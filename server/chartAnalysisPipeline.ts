import { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  calibrateQualityAssessment,
  extractJsonObject,
  normalizeAgentResults,
  sanitizeMarketCriteriaSummary,
  sanitizeRadarMetrics,
} from '../src/utils/consensusEngine.js';
import {
  computeDynamicTimingInsights,
  isExpirationCoherentWithTimeframe,
  normalizeExplicitMarketEnvironment,
  resolveForcedMarketEnvironment,
} from '../src/utils/timingEngine.js';
import {
  formatHHMMInTimeZone,
  getTimeZoneDisplayLabel,
  isEntryClockNearCurrentTime,
  normalizeTimeZone,
} from '../src/utils/timezone.js';
import {
  applyHardTradeGuardrails,
  evaluateEconomicNewsBlackout,
  evaluateMacroAlignment,
  evaluateSqueezedZone,
  evaluateVisualLegibility,
  isAllowedEntryTimeframe,
  isAllowedMultiTimeframe,
  resolveCandidateDirectionForGuardrails,
  resolveMultiTimeframeBreakdown,
} from '../src/utils/riskGuardrails.js';
import { AllowedMultiTimeframe, EntryExecutionTimeframe, MarketEnvironment } from '../src/types/trading.js';
import { sanitizeVisualAnnotations } from '../src/utils/visualAnnotationBuilder.js';
import { getLiveEconomicEvents } from './economicCalendar.js';
import {
  buildDynamicCalibrationPromptSection,
  getCurrentCalibrationProfile,
  isCalibrationStale,
  refreshCalibrationWithAI,
} from './aiCalibrationService.js';
import { withAbortTimeout } from './timeoutUtils.js';
import { CHART_ANALYSIS_RESPONSE_SCHEMA, classifyGeminiApiError } from './geminiSchemas.js';

export const MULTI_AGENT_SYSTEM_PROMPT = `Você é o NextCandle.AI Multi-Agent Quantitative Engine, um sistema de visão computacional e trading algorítmico projetado para operar de forma HÍBRIDA entre **MERCADO ABERTO** e **MERCADO OTC**, ajustando automaticamente os critérios de decisão dos 5 agentes conforme o ativo identificado no gráfico.

DETECÇÃO AUTOMÁTICA DE AMBIENTE DE MERCADO:
- Identifique pelo cabeçalho/ticker na imagem se o ativo é **MERCADO_OTC** (contém "OTC", "(OTC)", "-OTC", índices sintéticos ou gráfico OTC de corretora) ou **MERCADO_ABERTO** (pares Forex reais sem sufixo OTC, ações, índices reais, commodities como XAU/USD ou criptoativos).

MODO MERCADO ABERTO (Critérios Rígidos):
- Considere obrigatoriamente liquidez institucional, volume real visível, proximidade de taxas psicológicas (.000 / .500), horário de sessão (Londres, NY, Sobreposição, Asiática/Rollover) e impacto potencial de notícias econômicas macro.
- Filtre sinais falsos em zonas de baixa liquidez, spreads altos, liquidity sweeps ou candles erráticos típicos de pré/pós-notícias.

MODO MERCADO OTC (Critérios Rígidos):
- Priorize estritamente **Price Action puro**, **padrões de repetição algorítmica** (simetria de micro-ondas, preenchimento de pavios, sequência/alternância de velas, velas de comando e exaustão de pavio duplo) e **zonas fortes de suporte e resistência** (taxas redondas, topos/fundos duplos, pullbacks limpos).
- Reserve AGUARDAR apenas para consolidação estreita de micro-velas / sequência de Dojis (< 30% de corpo) ou divergência direta entre compradores e vendedores.
- DESCONSIDERE completamente o calendário econômico externo, horários de sessões institucionais tradicionais e notícias macroeconômicas (pois o fluxo OTC é algorítmico/sintético).

MANDATO DOS 5 AGENTES ESPECIALIZADOS (Adaptados ao Mercado Detectado):
1. Agente de Price Action & Estrutura (Sofia Alencar):
   - No Mercado Aberto: analisa HH/HL/LH/LL, LTA/LTB, S/R institucional e rompimentos com deslocamento real.
   - No Mercado OTC: prioriza Price Action puro, zonas fortes de S/R, taxas psicológicas, pavios de retração e simetria de padrões de repetição algorítmica.
   - Voto: COMPRA ou VENDA sempre que houver viés estrutural claro; AGUARDAR apenas em lateralização indefinida.

2. Agente de Indicadores Técnicos (Dr. Lucas Vance):
   - Extrai médias móveis (EMA 20, 50, 200), Bollinger, RSI (14) e MACD; no Mercado OTC alinha a inclinação das EMAs e bandas com o Price Action para confirmar a direção, sem ficar neutro por falta de oscilador externo.
   - Voto: COMPRA ou VENDA quando médias/bandas ou exaustão em S/R apontarem viés claro; AGUARDAR apenas em divergência técnica real.

3. Agente de Fluxo e Volatilidade (Elena Rostova):
   - No Mercado Aberto: avalia volume real, agressão institucional, liquidez de sessão, liquidity sweeps e risco de manipulação por notícias.
   - No Mercado OTC: avalia força do corpo vs. pavio, ritmo algorítmico de repetição de velas e continuidade/reversão em S/R (desconsiderando notícias externas).
   - Voto: COMPRA, VENDA ou AGUARDAR.

4. Agente Preditivo (Gabriel Chen - ML & Séries Temporais):
   - No Mercado Aberto: estima probabilidade direcional considerando volatilidade da sessão atual.
   - No Mercado OTC: detecta ciclos de repetição estatística e probabilidade de retração/continuação nas próximas velas.
   - Voto: COMPRA ou VENDA sempre que a probabilidade estatística superar 65%; AGUARDAR apenas em séries 50/50.

5. Agente de Confluência e Risco (Marcus Sterling - Juiz Chefe):
   - Objetivo Global: validar entradas de alta probabilidade sem bloqueios excessivos por passividade.
   - Deve votar COMPRA ou VENDA sempre que houver confluência limpa de 3+ especialistas sem votos opostos diretos e espaço R:R >= 1:1.5, reservando AGUARDAR estritamente para conflito direcional real, consolidação em ruído, divergência Multi-Timeframe ou zona espremida colada em S/R contrária.

Responda ESTRITAMENTE em formato JSON compatível com o schema configurado.`;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function sanitizeShortField(val: unknown, maxLen = 120): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Extracts and validates the ENTIRE base64 payload + MIME type from data URLs or raw strings.
 */
export function extractCleanBase64(
  rawData: unknown,
  fallbackMime = 'image/png'
): { mimeType: string; data: string } | null {
  if (typeof rawData !== 'string') return null;
  const trimmed = rawData.trim();
  if (trimmed.length < 50) return null;

  let cleanMimeType = ALLOWED_IMAGE_MIMES.has(fallbackMime.toLowerCase())
    ? fallbackMime.toLowerCase()
    : 'image/png';
  let base64Data = trimmed;

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) {
      cleanMimeType = match[1].trim().toLowerCase();
      base64Data = match[2].trim();
    } else {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx === -1) return null;
      const header = trimmed.slice(0, commaIdx);
      const headerMatch = header.match(/data:([^;]+)/);
      if (headerMatch) cleanMimeType = headerMatch[1].trim().toLowerCase();
      base64Data = trimmed.slice(commaIdx + 1).trim();
    }
  }

  if (cleanMimeType === 'image/jpg') cleanMimeType = 'image/jpeg';
  if (!ALLOWED_IMAGE_MIMES.has(cleanMimeType)) return null;

  const compactData = base64Data.replace(/\s+/g, '');
  if (compactData.length < 50 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compactData)) {
    return null;
  }

  return {
    mimeType: cleanMimeType,
    data: compactData,
  };
}

export async function handleAnalyzeChartRequest(
  req: Request,
  res: Response,
  aiClient: GoogleGenAI | null
) {
  const calibration = getCurrentCalibrationProfile();
  if (aiClient && isCalibrationStale(calibration)) {
    refreshCalibrationWithAI(aiClient, undefined, { persistGlobal: true }).catch(() => {});
  }

  try {
    const {
      imageBase64,
      mimeType = 'image/png',
      macroImageBase64,
      macroMimeType = 'image/png',
      timeframeImages,
      mode = 'simple',
      asset = '',
      timeframe = '',
      entryTimeframe,
      marketEnvironment,
      additionalContext = '',
      clientTime = '',
      utcHour,
      timezone,
      analysisTimestampMs,
    } = req.body || {};

    if (!aiClient) {
      return res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        error:
          'Motor de visão Gemini não configurado no servidor (defina GEMINI_API_KEY nas variáveis de ambiente).',
      });
    }

    const explicitMarketFocus = normalizeExplicitMarketEnvironment(marketEnvironment);
    const activeTimezone = normalizeTimeZone(timezone);
    const analysisRefMs =
      typeof analysisTimestampMs === 'number' && Number.isFinite(analysisTimestampMs)
        ? analysisTimestampMs
        : Date.now();
    const analysisRefDate = new Date(analysisRefMs);

    let normalizedEntryTimeframe: EntryExecutionTimeframe | undefined;
    if (entryTimeframe !== undefined && entryTimeframe !== null && String(entryTimeframe).trim() !== '') {
      const entryUpper = String(entryTimeframe).trim().toUpperCase();
      if (!isAllowedEntryTimeframe(entryUpper)) {
        return res.status(400).json({
          error: `Tempo gráfico de entrada "${entryUpper}" não permitido. As entradas devem ser feitas em M1 ou M5.`,
        });
      }
      normalizedEntryTimeframe = entryUpper;
    }

    const tfRank: Record<AllowedMultiTimeframe, number> = { H1: 3, M15: 2, M5: 1 };
    const normalizedTfImages: Array<{ timeframe: AllowedMultiTimeframe; imageBase64: string }> = [];

    if (Array.isArray(timeframeImages) && timeframeImages.length > 0) {
      for (const item of timeframeImages) {
        const tfUpper = String(item?.timeframe || '').trim().toUpperCase();
        if (!isAllowedMultiTimeframe(tfUpper)) {
          return res.status(400).json({
            error: `Timeframe "${tfUpper || 'inválido'}" não permitido na análise multi-timeframe. São aceitos apenas: H1, M15 e M5.`,
          });
        }
        if (typeof item?.imageBase64 === 'string' && item.imageBase64.length > 50) {
          normalizedTfImages.push({
            timeframe: tfUpper,
            imageBase64: item.imageBase64,
          });
        }
      }
      normalizedTfImages.sort((a, b) => tfRank[b.timeframe] - tfRank[a.timeframe]);
    }

    const primaryImageSource =
      normalizedTfImages.length > 0
        ? normalizedTfImages[normalizedTfImages.length - 1].imageBase64
        : imageBase64;

    if (!primaryImageSource) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada para análise.' });
    }

    const safeAsset = sanitizeShortField(asset, 40);
    const safeTimeframe = sanitizeShortField(timeframe, 16);
    const safeContext = sanitizeShortField(additionalContext, 280);
    const safeClientTime = sanitizeShortField(clientTime, 16);
    const resolvedClientTime = formatHHMMInTimeZone(analysisRefDate, activeTimezone) || safeClientTime;
    const resolvedUtcHour =
      typeof utcHour === 'number' && Number.isFinite(utcHour)
        ? utcHour
        : analysisRefDate.getUTCHours();
    const timezoneDisplayLabel = getTimeZoneDisplayLabel(activeTimezone, analysisRefDate, true);

    const triggerTimeframeFromMulti =
      normalizedTfImages.length > 0 ? normalizedTfImages[normalizedTfImages.length - 1].timeframe : safeTimeframe;
    const effectiveEntryTf: EntryExecutionTimeframe =
      normalizedEntryTimeframe ||
      (String(safeTimeframe || triggerTimeframeFromMulti).trim().toUpperCase() === 'M1' ? 'M1' : 'M5');

    const triggerImage = extractCleanBase64(primaryImageSource, mimeType);
    if (!triggerImage) {
      return res.status(400).json({ error: 'Formato de imagem inválido ou corrompido. Envie PNG, JPEG ou WEBP.' });
    }
    const macroImage =
      normalizedTfImages.length <= 1 && typeof macroImageBase64 === 'string' && macroImageBase64.length > 50
        ? extractCleanBase64(macroImageBase64, macroMimeType)
        : null;
    const hasMacroImage = normalizedTfImages.length > 1 || Boolean(macroImage);

    const liveCalendarPromise =
      explicitMarketFocus === 'MERCADO_OTC'
        ? Promise.resolve({ events: [], sources: [] })
        : getLiveEconomicEvents(aiClient).catch(() => ({
            events: [],
            sources: [],
          }));

    const isAutoDetectMode =
      mode === 'simple' || !asset || !(normalizedEntryTimeframe || triggerTimeframeFromMulti || timeframe);
    const dynamicSystemPrompt = `${MULTI_AGENT_SYSTEM_PROMPT}\n\n${buildDynamicCalibrationPromptSection(calibration, explicitMarketFocus)}`;

    const multiTfInstructions =
      normalizedTfImages.length > 0
        ? `
ANÁLISE MULTI-TIMEFRAME ATIVA (${normalizedTfImages.length} GRÁFICO(S) SEPARADO(S) POR TIMEFRAME — ACEITOS APENAS H1, M15, M5):
${normalizedTfImages
  .map(
    (item, idx) =>
      `- IMAGEM ${idx + 1}: Timeframe ${item.timeframe}${
        idx === normalizedTfImages.length - 1
          ? ' (GRÁFICO DE GATILHO MAIS CURTO ANEXADO)'
          : ' (GRÁFICO MACRO DE TENDÊNCIA)'
      }`
  )
  .join('\n')}
- Analise a estrutura de CADA imagem acima, preencha obrigatoriamente "multiTimeframeBreakdown" com a tendência ("alta" | "baixa" | "lateral") de cada timeframe enviado e exija ALINHAMENTO DIRETO entre todos os timeframes (${normalizedTfImages.map((t) => t.timeframe).join(' -> ')}).
- Se o gráfico de execução (${triggerTimeframeFromMulti}) estiver contra qualquer timeframe macro acima dele ou se algum timeframe macro estiver lateralizado, os agentes devem votar AGUARDAR.`
        : hasMacroImage
        ? `
ANÁLISE MULTI-TIMEFRAME ATIVA (2 IMAGENS ANEXADAS):
- IMAGEM 1 = Gráfico de EXECUÇÃO / GATILHO.
- IMAGEM 2 = Gráfico de TENDÊNCIA MACRO (H1 ou M15).
- Analise obrigatoriamente a estrutura da IMAGEM 2 (Macro), preencha "macroAnalysis" e exija ALINHAMENTO DIRETO entre Macro e Gatilho. Se o Gatilho for contra a tendência Macro ou se a Macro estiver lateralizada sem direção clara, os agentes devem votar AGUARDAR.`
        : '';

    const exclusiveMarketInstruction =
      explicitMarketFocus === 'MERCADO_OTC'
        ? `FOCO EXCLUSIVO ATIVADO PELO TRADER: **MERCADO OTC (MERCADO_OTC)**.
REGRA MANDATÓRIA DE FOCO: Todos os 5 agentes (Price Action, Indicadores, Fluxo, ML e Juiz de Risco) devem operar EXCLUSIVAMENTE com critérios de **MERCADO OTC**:
- Priorize estritamente Price Action puro, zonas fortes de Suporte/Resistência, taxas psicológicas, pavios de retração/exaustão e padrões de repetição algorítmica/simetria de micro-ondas.
- IGNORE e NÃO utilize calendário econômico, notícias macroeconômicas, volume real de bolsa ou sessões institucionais (Londres/NY/Asiática).
- Defina obrigatoriamente "marketEnvironment": "MERCADO_OTC" no JSON.`
        : explicitMarketFocus === 'MERCADO_ABERTO'
        ? `FOCO EXCLUSIVO ATIVADO PELO TRADER: **MERCADO ABERTO (MERCADO_ABERTO)**.
REGRA MANDATÓRIA DE FOCO: Todos os 5 agentes (Price Action, Indicadores, Fluxo, ML e Juiz de Risco) devem operar EXCLUSIVAMENTE com critérios de **MERCADO ABERTO**:
- Avalie obrigatoriamente estrutura institucional (HH/HL/LH/LL), liquidez real de sessão (Londres, NY, Sobreposição, Asiática), volume real, liquidity sweeps, taxas institucionais e risco de calendário econômico real (±15 min).
- NÃO utilize heurísticas sintéticas ou padrões de algoritmo OTC.
- Defina obrigatoriamente "marketEnvironment": "MERCADO_ABERTO" no JSON.`
        : `PASSO 1 - DETECÇÃO DO AMBIENTE DE MERCADO:
- Defina "marketEnvironment": "MERCADO_OTC" se o ativo contiver OTC, índice sintético ou for gráfico OTC de corretora; caso contrário, defina "MERCADO_ABERTO".
- Se for MERCADO_ABERTO: avalie liquidez institucional, volume real, horário da sessão e exposição macroeconômica.
- Se for MERCADO_OTC: priorize Price Action puro, padrões de repetição algorítmica e zonas fortes de suporte/resistência, DESCONSIDERANDO o calendário econômico externo.`;

    const prompt = `Analise este gráfico financeiro minuciosamente aplicando ${
      explicitMarketFocus === 'MERCADO_OTC'
        ? 'EXCLUSIVAMENTE O MODO MERCADO OTC'
        : explicitMarketFocus === 'MERCADO_ABERTO'
        ? 'EXCLUSIVAMENTE O MODO MERCADO ABERTO'
        : 'o MODO HÍBRIDO (Mercado Aberto vs. Mercado OTC)'
    } e os 3 GUARDRAILS INSTITUCIONAIS.
Modo: ${mode === 'pro' ? 'pro' : 'simple'}. ${isAutoDetectMode ? `Ativo não pré-definido: DETECTE diretamente na imagem do gráfico qual é o ativo/par (incluindo tag OTC se aplicável).` : `Ativo informado: ${safeAsset || 'Detectar na imagem'}.`}
TEMPO GRÁFICO DAS ENTRADAS ESCOLHIDO PELO TRADER: ${effectiveEntryTf} (as entradas serão executadas em velas de ${effectiveEntryTf}). Calibre obrigatoriamente o gatilho dos 5 agentes, a expiração ideal ("idealExpiration" em múltiplos exatos de ${effectiveEntryTf}: ${effectiveEntryTf === 'M1' ? '1 vela = 1 min, 2 velas = 2 min, 3 velas = 3 min' : '1 vela = 5 min, 2 velas = 10 min, 3 velas = 15 min'}) e o momento de entrada ("entryTiming", "entryTrigger") exclusivamente para operações em ${effectiveEntryTf}.
FUSO HORÁRIO SELECIONADO PELO TRADER: ${timezoneDisplayLabel} (IANA: ${activeTimezone}).
Horário atual nesse fuso selecionado: ${resolvedClientTime} (Hora UTC atual: ${resolvedUtcHour}).
REGRA CRÍTICA DE FUSO HORÁRIO: Todos os horários em "entryTiming", "entryTrigger", "entryTimingRationale" e "visualAnnotations.triggerPoint.timingLabel" DEVEM estar convertidos e expressos estritamente no fuso horário selecionado (${timezoneDisplayLabel}, hora base ${resolvedClientTime}). Se o gráfico anexado mostrar outro fuso horário no eixo temporal (ex: UTC+0 ou fuso diferente da corretora), NÃO repita o horário cru do print — converta obrigatoriamente para o fuso ${timezoneDisplayLabel}.
Contexto adicional: ${safeContext || 'Nenhum'}.
${multiTfInstructions}

GUARDRAIL OBRIGATÓRIO DE ZONA ESPREMIDA ("squeezeAnalysis" - Regra do Juiz Chefe Marcus Sterling):
- Analise normalmente todas as velas visíveis na captura enviada sem bloquear por recorte, quantidade de velas ou ausência de eixos.
- Verifique qual é o próximo nível forte de Suporte ou Resistência no caminho imediato da possível entrada.
- Em potencial COMPRA, avalie a distância até a resistência forte mais próxima acima ("nearestObstructionType": "resistance").
- Em potencial VENDA, avalie a distância até o suporte forte mais próximo abaixo ("nearestObstructionType": "support").
- Em tendências abertas ou pullbacks após rompimento com espaço até o próximo topo/fundo estrutural, mantenha "freeClearanceRR" >= 1.5 e "isSqueezed": false. Reserve "isSqueezed": true ("freeClearanceRR" < 1.5) estritamente para entradas coladas a 1–2 velas de uma barreira S/R contrária já testada!

${exclusiveMarketInstruction}

CRÍTICO: Extraia e determine claramente estas 5 INFORMAÇÕES CHAVE DA ANÁLISE:
1. Tendência (direção e força da estrutura)
2. Padrão Chave (padrão gráfico, repetição algorítmica ou de candlestick predominante)
3. Qualidade (grau de assertividade: A+, A, B ou C, com score percentual)
4. Expiração Ideal DINÂMICA E INDIVIDUAL: NÃO use valores genéricos, fixos ou "N/A". Calcule estritamente para ESTE gráfico analisando a volatilidade aparente, o timeframe e o padrão identificado (ex: "2 velas (10 min)"). Se o veredito for AGUARDAR, retorne "Aguardar rompimento · Ref. X velas (Y min)".
5. Horário / Momento de Entrada Recomendado (entryTiming, entryTrigger, entryTimingRationale): Calcule com base no horário atual no fuso selecionado (${resolvedClientTime} em ${timezoneDisplayLabel}), informando o horário/gatilho exato já convertido neste fuso. NUNCA retorne "N/A". Se o veredito for AGUARDAR, informe "Aguardar fechamento às HH:MM".

IMPORTANTE SOBRE "visualAnnotations": Use coordenadas normalizadas exatas de 0 a 1000 relativas à imagem enviada (x=0 esquerda, x=1000 direita, y=0 topo, y=1000 fundo), apontando diretamente para o candle atual (geralmente próximo à direita do gráfico) e para os níveis reais de S/R visíveis no print.`;

    const contentParts: any[] = [];
    if (normalizedTfImages.length > 0) {
      for (const item of normalizedTfImages) {
        const clean = extractCleanBase64(item.imageBase64, mimeType);
        if (clean) {
          contentParts.push({
            inlineData: {
              mimeType: clean.mimeType,
              data: clean.data,
            },
          });
        }
      }
    }
    if (contentParts.length === 0) {
      contentParts.push({
        inlineData: {
          mimeType: triggerImage.mimeType,
          data: triggerImage.data,
        },
      });
      if (macroImage) {
        contentParts.push({
          inlineData: {
            mimeType: macroImage.mimeType,
            data: macroImage.data,
          },
        });
      }
    }
    contentParts.push({ text: prompt });

    const callGeminiWithTimeout = async (
      modelName: string,
      useLowThinking: boolean,
      timeoutMs: number
    ) => {
      return withAbortTimeout(
        (abortSignal) =>
          aiClient.models.generateContent({
            model: modelName,
            contents: { parts: contentParts },
            config: {
              abortSignal,
              systemInstruction: dynamicSystemPrompt,
              responseMimeType: 'application/json',
              responseSchema: CHART_ANALYSIS_RESPONSE_SCHEMA,
              ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            },
          }),
        timeoutMs,
        'Timeout de comunicação com o modelo de visão'
      );
    };

    let response: any = null;
    let lastGeminiError: unknown = null;

    try {
      response = await callGeminiWithTimeout('gemini-4-hydrogen', true, 18000);
    } catch (err1) {
      lastGeminiError = err1;
      const classifiedPrimary = classifyGeminiApiError(err1);
      // Do not waste another call if credentials themselves are invalid
      if (classifiedPrimary.code !== 'AI_CREDENTIALS_INVALID') {
        try {
          response = await callGeminiWithTimeout('gemini-3.1-flash-lite', false, 12000);
          lastGeminiError = null;
        } catch (err2) {
          lastGeminiError = err2;
        }
      }
    }

    if (!response || !response.text) {
      const classified = classifyGeminiApiError(lastGeminiError);
      console.warn('Falha no pipeline Gemini:', classified.code, (lastGeminiError as any)?.message || lastGeminiError);
      return res.status(classified.status).json({
        code: classified.code,
        error: classified.userMessage,
      });
    }

    const parsedData = extractJsonObject(response.text);
    const normalizedAgents = normalizeAgentResults(parsedData.agents);
    const candidateVerdictForGuardrails = resolveCandidateDirectionForGuardrails(normalizedAgents);

    const resolvedAsset = parsedData.asset || asset || 'EUR/USD';
    const resolvedTimeframe =
      normalizedEntryTimeframe || triggerTimeframeFromMulti || parsedData.timeframe || timeframe || effectiveEntryTf;
    const resolvedMarket = resolveForcedMarketEnvironment(
      explicitMarketFocus,
      resolvedAsset,
      `${asset} ${additionalContext} ${parsedData.marketEnvironment || ''} ${parsedData.detectedPattern || ''}`
    );

    const visualQuality = evaluateVisualLegibility(parsedData.visualQuality || {});

    const breakdownFromModel = Array.isArray(parsedData.multiTimeframeBreakdown)
      ? parsedData.multiTimeframeBreakdown
      : [];
    const timeframesAnalyzed =
      normalizedTfImages.length > 0
        ? resolveMultiTimeframeBreakdown({
            attachedTimeframes: normalizedTfImages.map((item) => item.timeframe),
            breakdownFromModel,
            macroAnalysis: parsedData.macroAnalysis,
          })
        : undefined;

    const multiTimeframe = evaluateMacroAlignment({
      macroAttached: hasMacroImage,
      macroTimeframe: parsedData.macroAnalysis?.macroTimeframe,
      macroTrend: parsedData.macroAnalysis?.macroTrend,
      timeframesAnalyzed,
      candidateVerdict: candidateVerdictForGuardrails,
    });
    const squeezeZone = evaluateSqueezedZone({
      candidateVerdict: candidateVerdictForGuardrails,
      nearestObstructionType: parsedData.squeezeAnalysis?.nearestObstructionType,
      obstructionPrice: parsedData.squeezeAnalysis?.obstructionPrice,
      freeClearanceRR: parsedData.squeezeAnalysis?.freeClearanceRR,
      isSqueezed: parsedData.squeezeAnalysis?.isSqueezed,
    });

    const liveFeed = await liveCalendarPromise;
    const economicCalendar = evaluateEconomicNewsBlackout({
      asset: resolvedAsset,
      marketEnvironment: resolvedMarket,
      events: liveFeed.events,
      sources: liveFeed.sources,
    });

    const guarded = applyHardTradeGuardrails({
      agents: normalizedAgents,
      visualQuality,
      multiTimeframe,
      squeezeZone,
      economicCalendar,
    });

    const finalAgents = guarded.agents;
    const computedConsensus = guarded.verdict;

    const rawInsights = parsedData.insights || {};
    const isBuyVerdict = computedConsensus.verdict === 'COMPRA';
    const isSellVerdict = computedConsensus.verdict === 'VENDA';
    const isWaitVerdict = computedConsensus.verdict === 'AGUARDAR';
    const resolvedKeyPattern =
      rawInsights.keyPattern ||
      parsedData.detectedPattern ||
      (isBuyVerdict
        ? 'Engolfo de Alta em Suporte com Pullback'
        : isSellVerdict
        ? 'Estrela Cadente em Resistência com Rompimento'
        : 'Indecisão / Doji em Meio de Gráfico');

    const volScore =
      typeof parsedData.radarMetrics?.flowVolatility === 'number'
        ? parsedData.radarMetrics.flowVolatility
        : 76;

    const dynamicTiming = computeDynamicTimingInsights({
      asset: resolvedAsset,
      timeframe: resolvedTimeframe,
      verdict: computedConsensus.verdict,
      keyPattern: resolvedKeyPattern,
      volatilityScore: volScore,
      confidenceScore: computedConsensus.overallConfidence,
      clientTime: resolvedClientTime,
      utcHour: resolvedUtcHour,
      marketEnvironment: resolvedMarket,
      timezone: activeTimezone,
      nowMs: analysisRefMs,
    });

    const isInvalidOrPlaceholder = (val: unknown) => {
      if (typeof val !== 'string') return true;
      const trimmed = val.trim();
      return (
        !trimmed ||
        /^(n\/a|na|nenhum|nenhuma|indispon[ií]vel|null|undefined|-|0 velas.*)$/i.test(trimmed)
      );
    };

    const rawExpIsGeneric =
      isInvalidOrPlaceholder(rawInsights.idealExpiration) ||
      /^3 a 5 velas(\s*\(15m a 25m\))?$/i.test(String(rawInsights.idealExpiration).trim()) ||
      !isExpirationCoherentWithTimeframe(rawInsights.idealExpiration, resolvedTimeframe);

    const rawTimingMismatchesEntryTf = (() => {
      if (typeof rawInsights.entryTiming !== 'string') return true;
      const tfExplicit = rawInsights.entryTiming.match(/\b(M1|M3|M5|M15|M30|H1|H4)\b/i)?.[1];
      return Boolean(tfExplicit && tfExplicit.toUpperCase() !== resolvedTimeframe.toUpperCase());
    })();

    const rawTimingDriftsFromTimezone = !isEntryClockNearCurrentTime(
      rawInsights.entryTiming,
      resolvedClientTime
    );
    const mustUseCalibratedEntryTiming =
      isWaitVerdict ||
      isInvalidOrPlaceholder(rawInsights.entryTiming) ||
      rawTimingMismatchesEntryTf ||
      rawTimingDriftsFromTimezone;

    const {
      qualityGrade: calibratedGrade,
      qualityScore: calibratedScore,
      quality: calibratedQualityLabel,
    } = calibrateQualityAssessment(computedConsensus, rawInsights.qualityScore);

    const sanitizedInsights = {
      trend:
        rawInsights.trend ||
        (isBuyVerdict
          ? 'Alta Forte (Topos e Fundos Ascendentes)'
          : isSellVerdict
          ? 'Baixa Dominante (Topos e Fundos Descendentes)'
          : 'Lateralização / Consolidação em Range'),
      trendDirection: rawInsights.trendDirection || (isBuyVerdict ? 'alta' : isSellVerdict ? 'baixa' : 'lateral'),
      keyPattern: resolvedKeyPattern,
      patternType: rawInsights.patternType || (isBuyVerdict || isSellVerdict ? 'Reversão Confirmada' : 'Indefinido'),
      quality: calibratedQualityLabel,
      qualityGrade: calibratedGrade,
      qualityScore: calibratedScore,
      idealExpiration:
        isWaitVerdict || rawExpIsGeneric ? dynamicTiming.idealExpiration : rawInsights.idealExpiration,
      expirationRationale:
        isWaitVerdict || rawExpIsGeneric || isInvalidOrPlaceholder(rawInsights.expirationRationale)
          ? dynamicTiming.expirationRationale
          : rawInsights.expirationRationale,
      entryTiming: mustUseCalibratedEntryTiming ? dynamicTiming.entryTiming : rawInsights.entryTiming,
      entryTrigger:
        mustUseCalibratedEntryTiming || isInvalidOrPlaceholder(rawInsights.entryTrigger)
          ? dynamicTiming.entryTrigger
          : rawInsights.entryTrigger,
      entryTimingRationale:
        mustUseCalibratedEntryTiming || isInvalidOrPlaceholder(rawInsights.entryTimingRationale)
          ? dynamicTiming.entryTimingRationale
          : rawInsights.entryTimingRationale,
      sessionLiquidity: dynamicTiming.sessionLiquidity,
      sessionAdvisory: dynamicTiming.sessionAdvisory,
      marketEnvironment: resolvedMarket,
      timezone: activeTimezone,
      timezoneLabel: dynamicTiming.timezoneLabel,
    };

    const resolvedCriteriaSummary = sanitizeMarketCriteriaSummary(
      parsedData.marketCriteriaSummary,
      resolvedMarket
    );

    const rawPlan = parsedData.plan || {};
    const blockReasonShort = !guarded.guardrails.allPassed
      ? 'Bloqueado por Guardrail de Proteção'
      : 'Bloqueado (Sem Consenso 80%)';

    const sanitizedPlan = isWaitVerdict
      ? {
          asset: resolvedAsset,
          timeframe: resolvedTimeframe,
          direction: 'AGUARDAR' as const,
          entryZone: 'Aguardando confirmação fora do ruído',
          takeProfit1: blockReasonShort,
          takeProfit2: 'N/A',
          stopLoss: 'Proteção de Capital Ativa',
          riskRewardRatio: 'N/A',
          suggestedExpiration: sanitizedInsights.idealExpiration,
          riskLevel: 'Alto' as const,
        }
      : {
          asset: resolvedAsset,
          timeframe: resolvedTimeframe,
          direction: computedConsensus.verdict,
          entryZone: !isInvalidOrPlaceholder(rawPlan.entryZone)
            ? rawPlan.entryZone
            : parsedData.currentPriceEstimate || 'Preço atual de fechamento',
          takeProfit1: !isInvalidOrPlaceholder(rawPlan.takeProfit1) ? rawPlan.takeProfit1 : 'Próxima Zona S/R',
          takeProfit2: !isInvalidOrPlaceholder(rawPlan.takeProfit2) ? rawPlan.takeProfit2 : 'Alvo Estendido',
          stopLoss: !isInvalidOrPlaceholder(rawPlan.stopLoss) ? rawPlan.stopLoss : 'Abaixo/Acima do último pavio',
          riskRewardRatio: !isInvalidOrPlaceholder(rawPlan.riskRewardRatio) ? rawPlan.riskRewardRatio : '1:2.0',
          suggestedExpiration: sanitizedInsights.idealExpiration,
          riskLevel: rawPlan.riskLevel || (calibratedGrade === 'A+' ? 'Baixo' : 'Moderado'),
        };

    const result = {
      id: `analysis_${analysisRefMs}`,
      timestamp: analysisRefMs,
      timezone: activeTimezone,
      imagePreview: primaryImageSource,
      ...(hasMacroImage && normalizedTfImages.length <= 1 && macroImageBase64
        ? { macroImagePreview: macroImageBase64 }
        : {}),
      ...(normalizedTfImages.length > 0
        ? {
            timeframeImages: normalizedTfImages.map((t) => ({
              timeframe: t.timeframe,
              imagePreview: t.imageBase64,
            })),
          }
        : {}),
      mode,
      asset: resolvedAsset,
      timeframe: resolvedTimeframe,
      entryTimeframe: effectiveEntryTf,
      additionalContext,
      analysisSource: 'ai_vision' as const,
      marketEnvironment: resolvedMarket,
      marketCriteriaSummary: resolvedCriteriaSummary,
      calibrationVersion: calibration.version,
      guardrails: guarded.guardrails,
      verdict: computedConsensus,
      insights: sanitizedInsights,
      agents: finalAgents,
      plan: sanitizedPlan,
      radarMetrics: sanitizeRadarMetrics(parsedData.radarMetrics, finalAgents),
      candles: [],
      levels: [],
      visualAnnotations: sanitizeVisualAnnotations(
        isWaitVerdict && !guarded.guardrails.allPassed
          ? {
              ...parsedData.visualAnnotations,
              triggerPoint: {
                ...parsedData.visualAnnotations?.triggerPoint,
                label: 'Entrada Vetada por Guardrail',
                timingLabel: sanitizedInsights.entryTrigger,
              },
              strategyTitle: `Bloqueio Preventivo (${guarded.guardrails.vetoReasons.length} critério)`,
              technicalReason: guarded.guardrails.vetoReasons[0] || computedConsensus.recommendedAction,
            }
          : parsedData.visualAnnotations,
        {
          verdict: computedConsensus.verdict,
          timeframe: resolvedTimeframe,
          keyPattern: sanitizedInsights.keyPattern,
          entryTrigger: sanitizedInsights.entryTrigger,
          entryTiming: sanitizedInsights.entryTiming,
          trend: sanitizedInsights.trend,
          recommendedAction: computedConsensus.recommendedAction,
          strategyFallback: `${sanitizedInsights.patternType} · ${resolvedKeyPattern}`,
        }
      ),
      outcome: 'pending',
    };

    return res.json(result);
  } catch (error: any) {
    console.error('Erro no endpoint /api/analyze-chart:', error?.message || error);
    const classified = classifyGeminiApiError(error);
    return res.status(classified.status).json({
      code: classified.code,
      error: classified.userMessage,
    });
  }
}
