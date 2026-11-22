import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  calculateConsensus,
  calibrateQualityAssessment,
  extractJsonObject,
  normalizeAgentResults,
  sanitizeMarketCriteriaSummary,
  sanitizeRadarMetrics,
} from './src/utils/consensusEngine.js';
import {
  computeDynamicTimingInsights,
  detectMarketEnvironment,
  isExpirationCoherentWithTimeframe,
  normalizeExplicitMarketEnvironment,
  resolveForcedMarketEnvironment,
} from './src/utils/timingEngine.js';
import {
  formatHHMMInTimeZone,
  getTimeZoneDisplayLabel,
  isEntryClockNearCurrentTime,
  normalizeTimeZone,
} from './src/utils/timezone.js';
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
} from './src/utils/riskGuardrails.js';
import { AllowedMultiTimeframe, EntryExecutionTimeframe, MarketEnvironment } from './src/types/trading.js';
import { sanitizeVisualAnnotations } from './src/utils/visualAnnotationBuilder.js';
import { getEconomicCalendarStatus, getLiveEconomicEvents } from './server/economicCalendar.js';
import {
  buildDynamicCalibrationPromptSection,
  getCurrentCalibrationProfile,
  isCalibrationStale,
  refreshCalibrationWithAI,
} from './server/aiCalibrationService.js';
import { authManager, SessionPayload } from './server/authService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
const port = process.env.PORT || 3000;

// Body parser with generous payload size for high-res chart screenshots
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Initialize Gemini client with aistudio-build telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// System prompt for the 5-Agent Hybrid Quantitative Vision Pipeline (Mercado Aberto & Mercado OTC)
const MULTI_AGENT_SYSTEM_PROMPT = `Você é o NextCandle.AI Multi-Agent Quantitative Engine, um sistema de visão computacional e trading algorítmico projetado para operar de forma HÍBRIDA entre **MERCADO ABERTO** e **MERCADO OTC**, ajustando automaticamente os critérios de decisão dos 5 agentes conforme o ativo identificado no gráfico.

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

Responda ESTRITAMENTE em formato JSON compatível com a estrutura especificada.`;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

function sanitizeShortField(val: unknown, maxLen = 120): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

// Helper to extract & strictly validate pure base64 payload + MIME type from data URLs
function extractCleanBase64(
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

  // Strip stray whitespace/newlines and verify valid base64 format
  const compactData = base64Data.replace(/\s+/g, '');
  if (compactData.length < 50 || !/^[A-Za-z0-9+/=]+$/.test(compactData.slice(0, 256))) {
    return null;
  }

  return {
    mimeType: cleanMimeType,
    data: compactData,
  };
}

interface AuthenticatedRequest extends Request {
  authSession?: SessionPayload;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  const { session, reason } = authManager.verifySessionToken(token);
  if (!session) {
    if (reason === 'expired') {
      return res.status(401).json({
        code: 'ACCOUNT_EXPIRED',
        error: 'O acesso temporário de 24 horas expirou e a conta foi bloqueada automaticamente.',
      });
    }
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      error: 'Sessão expirada ou não autorizada. Inicia sessão novamente.',
    });
  }
  req.authSession = session;
  return next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireAuth(req, res, () => {
    if (req.authSession?.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso restrito ao painel de Administração.',
      });
    }
    return next();
  });
}

// Auth Endpoints (scrypt + HMAC-SHA256 Bearer sessions + 24h tester enforcement)
app.get('/api/auth/status', (_req: Request, res: Response) => {
  return res.json({
    configured: authManager.isConfigured(),
    mode: authManager.getMode(),
    authSource: authManager.getAuthSource(),
  });
});

app.post('/api/auth/setup', (req: Request, res: Response) => {
  const result = authManager.setupFirstAccess(req.body?.email, req.body?.password);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json({
    token: result.token,
    email: result.email,
    role: result.role,
    expiresAt: result.expiresAt ?? null,
    serverNow: Date.now(),
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const result = authManager.authenticate(req.body?.email, req.body?.password);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json({
    token: result.token,
    email: result.email,
    role: result.role,
    expiresAt: result.expiresAt ?? null,
    serverNow: Date.now(),
  });
});

app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const session = req.authSession!;
  return res.json({
    email: session.sub,
    role: session.role,
    expiresAt: session.role === 'tester' ? session.exp : null,
    serverNow: Date.now(),
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  authManager.revokeToken(token);
  return res.json({ ok: true });
});

// Admin Panel Endpoints (Protected by requireAdmin)
app.get('/api/admin/test-users', requireAdmin, (_req: Request, res: Response) => {
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
  });
});

app.post('/api/admin/test-users', requireAdmin, (req: Request, res: Response) => {
  const result = authManager.createTemporaryTestAccount(req.body?.email, req.body?.note);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json({
    credential: result.credential,
    account: result.account,
    serverNow: Date.now(),
  });
});

app.post('/api/admin/test-users/:id/revoke', requireAdmin, (req: Request, res: Response) => {
  const revoked = authManager.revokeTemporaryTestAccount(req.params.id);
  if (!revoked) {
    return res.status(404).json({ error: 'Conta temporária não encontrada.' });
  }
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
  });
});

app.delete('/api/admin/test-users/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = authManager.deleteTemporaryTestAccount(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Conta temporária não encontrada.' });
  }
  return res.json({
    accounts: authManager.listTemporaryTestAccounts(),
    serverNow: Date.now(),
  });
});

// Endpoint: Live Economic Calendar (Open Market High-Impact News)
app.get('/api/economic-calendar', requireAuth, async (req: Request, res: Response) => {
  try {
    const asset = typeof req.query.asset === 'string' ? req.query.asset : 'EUR/USD';
    const envQuery = typeof req.query.marketEnvironment === 'string' ? req.query.marketEnvironment : '';
    const marketEnvironment =
      envQuery === 'MERCADO_OTC' ? 'MERCADO_OTC' : detectMarketEnvironment(asset, envQuery);

    const status = await getEconomicCalendarStatus({
      asset,
      marketEnvironment,
      aiClient,
    });
    const feed = await getLiveEconomicEvents(aiClient);

    return res.json({
      status,
      events: feed.events.slice(0, 25),
      sources: feed.sources,
      fetchedAt: Date.now(),
    });
  } catch (err: any) {
    console.warn('Erro ao consultar calendário econômico:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao consultar calendário econômico ao vivo.' });
  }
});

// Endpoint: Get active AI Agent & Indicator Calibration Profile
app.get('/api/agent-calibration', requireAuth, (_req: Request, res: Response) => {
  const profile = getCurrentCalibrationProfile();
  if (aiClient && isCalibrationStale(profile)) {
    refreshCalibrationWithAI(aiClient).catch(() => {});
  }
  return res.json(profile);
});

// Endpoint: Refresh Agents & Indicators dynamically using Gemini + Search Grounding + User History
app.post('/api/agent-calibration/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const { performanceFeedback } = req.body || {};
    const updated = await refreshCalibrationWithAI(aiClient, performanceFeedback);
    return res.json(updated);
  } catch {
    return res.json(getCurrentCalibrationProfile());
  }
});

app.post('/api/analyze-chart', requireAuth, async (req: Request, res: Response) => {
  const calibration = getCurrentCalibrationProfile();
  if (aiClient && isCalibrationStale(calibration)) {
    refreshCalibrationWithAI(aiClient).catch(() => {});
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
    } = req.body;

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

    // Validate multi-timeframe image list when provided (strictly H1, M15, M5 only)
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
      // Sort Macro -> Trigger (H1 -> M15 -> M5)
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

    // Pre-fetch live economic calendar concurrently with Vision call ONLY when Open Market can apply (skip completely in explicit OTC)
    const liveCalendarPromise =
      explicitMarketFocus === 'MERCADO_OTC'
        ? Promise.resolve({ events: [], sources: [] })
        : getLiveEconomicEvents(aiClient).catch(() => ({
            events: [],
            sources: [],
          }));

    // Attempt multimodal analysis if Gemini client is configured
    if (aiClient) {
      try {
        const isAutoDetectMode = mode === 'simple' || !asset || !(normalizedEntryTimeframe || triggerTimeframeFromMulti || timeframe);
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

        const effectiveTf = normalizedEntryTimeframe || triggerTimeframeFromMulti || timeframe || effectiveEntryTf;
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

Retorne ESTRITAMENTE um objeto JSON válido (sem blocos de markdown adicionais) com o seguinte formato:
{
  "asset": "${asset || 'ATIVO_DETECTADO (incluir (OTC) se visível)'}",
  "timeframe": "${timeframe || 'M5'}",
  "marketEnvironment": "${explicitMarketFocus || 'MERCADO_ABERTO ou MERCADO_OTC'}",
  "marketCriteriaSummary": "Resumo de 1 frase explicando quais critérios exclusivos de ${explicitMarketFocus === 'MERCADO_OTC' ? 'Mercado OTC' : explicitMarketFocus === 'MERCADO_ABERTO' ? 'Mercado Aberto' : 'Mercado Aberto ou OTC'} os 5 agentes aplicaram neste ativo.",
  "detectedPattern": "padrão identificado",
  "currentPriceEstimate": "preço aproximado visível",
  "insights": {
    "trend": "Alta Forte (Estrutura de Topos e Fundos Ascendentes)",
    "trendDirection": "alta",
    "keyPattern": "Engolfo de Alta em Suporte com Rompimento de LTB",
    "patternType": "Reversão Confirmada",
    "quality": "A+ (Excelente Confluência 5/5 - 94%)",
    "qualityGrade": "A+",
    "qualityScore": 94,
    "idealExpiration": "2 velas (10 min)",
    "expirationRationale": "Justificativa individual citando volatilidade, timeframe, modo (Aberto/OTC) e padrão específico deste gráfico.",
    "entryTiming": "Às HH:MM (Abertura da próxima vela)",
    "entryTrigger": "Virada de Vela · HH:MM (máx 4 palavras)",
    "entryTimingRationale": "Fundamentação visual e temporal baseada no último candle visível, eixo de tempo e confirmação da estrutura."
  },
  "visualQuality": {
    "isReadable": true,
    "hasPriceAxis": true,
    "hasTimeAxis": true,
    "visibleCandlesCount": 34,
    "issues": []
  },
  "macroAnalysis": {
    "macroTimeframe": "H1",
    "macroTrend": "alta",
    "macroSummary": "Estrutura macro ascendente sem resistência imediata"
  },
  "multiTimeframeBreakdown": [
    { "timeframe": "H1", "trend": "alta" },
    { "timeframe": "M15", "trend": "alta" }
  ],
  "squeezeAnalysis": {
    "nearestObstructionType": "resistance",
    "obstructionPrice": "1.0895",
    "freeClearanceRR": 2.1,
    "isSqueezed": false
  },
  "agents": [
    {
      "id": "price_action",
      "name": "Agente de Price Action & Estrutura",
      "role": "Identificação de suportes, resistências, tendências e padrões de velas",
      "vote": "COMPRA" ou "VENDA" ou "AGUARDAR",
      "confidence": 88,
      "rationale": "Justificativa objetiva de 1 a 2 frases.",
      "signals": [
        {"label": "Padrão", "value": "Engolfo de Alta", "sentiment": "bullish"}
      ]
    },
    {
      "id": "indicators",
      "name": "Agente de Indicadores Técnicos",
      "role": "Leitura de médias móveis, RSI, Bandas de Bollinger e osciladores",
      "vote": "COMPRA" ou "VENDA" ou "AGUARDAR",
      "confidence": 85,
      "rationale": "Justificativa técnica de 1 a 2 frases.",
      "signals": [
        {"label": "Médias Móveis", "value": "EMA 20 acima da EMA 50", "sentiment": "bullish"}
      ]
    },
    {
      "id": "flow_volatility",
      "name": "Agente de Fluxo e Volatilidade",
      "role": "Avaliação de força do movimento, pavios de rejeição e falso rompimento",
      "vote": "COMPRA" ou "VENDA" ou "AGUARDAR",
      "confidence": 82,
      "rationale": "Justificativa de fluxo de 1 a 2 frases.",
      "signals": [
        {"label": "Volume Delta", "value": "Comprador", "sentiment": "bullish"}
      ]
    },
    {
      "id": "predictive_ml",
      "name": "Agente Preditivo (Machine Learning)",
      "role": "Modelagem estatística de probabilidade e séries temporais",
      "vote": "COMPRA" ou "VENDA" ou "AGUARDAR",
      "confidence": 84,
      "rationale": "Justificativa preditiva de 1 a 2 frases.",
      "signals": [
        {"label": "Probabilidade", "value": "82%", "sentiment": "bullish"}
      ]
    },
    {
      "id": "confluence_risk",
      "name": "Agente de Confluência e Risco (Juiz)",
      "role": "Consolidação de votos, validação de conflitos e relação risco-retorno",
      "vote": "COMPRA" ou "VENDA" ou "AGUARDAR",
      "confidence": 90,
      "rationale": "Justificativa do juiz de 1 a 2 frases.",
      "signals": [
        {"label": "Confluência", "value": "Alta", "sentiment": "bullish"}
      ]
    }
  ],
  "plan": {
    "entryZone": "faixa de preço",
    "takeProfit1": "alvo 1",
    "takeProfit2": "alvo 2",
    "stopLoss": "stop loss",
    "riskRewardRatio": "1:2.5",
    "suggestedExpiration": "3 a 5 velas",
    "riskLevel": "Baixo"
  },
  "radarMetrics": {
    "priceAction": 88,
    "technicals": 85,
    "flowVolatility": 82,
    "predictiveML": 84,
    "riskManagement": 90
  },
  "visualAnnotations": {
    "analyzedZone": {
      "x": 520,
      "y": 410,
      "width": 290,
      "height": 260,
      "label": "Zona de Suporte & Rejeição (Ex: 1.0840)"
    },
    "triggerPoint": {
      "x": 790,
      "y": 540,
      "label": "Gatilho de Entrada no Último Candle",
      "timingLabel": "Abertura Próxima Vela"
    },
    "trendArrow": {
      "fromX": 380,
      "fromY": 670,
      "toX": 765,
      "toY": 545,
      "label": "Fluxo & Impulso Direcional"
    },
    "keyLevels": [
      { "y": 640, "type": "support", "label": "Suporte Defendido" },
      { "y": 320, "type": "target", "label": "Alvo Principal (TP)" }
    ],
    "strategyTitle": "Estratégia Aplicada (Ex: Pullback + Engolfo em Suporte)",
    "technicalReason": "Motivo técnico curto e objetivo da entrada validado pelos 5 agentes.",
    "steps": [
      { "step": 1, "title": "Zona Analisada", "detail": "Descrição curta da região de preço observada na caixa destacada." },
      { "step": 2, "title": "Gatilho e Ponto de Entrada", "detail": "Onde e em qual candle ocorre a execução da entrada." },
      { "step": 3, "title": "Racional da Operação", "detail": "Resumo claro da estratégia e confluência que justifica o veredito." }
    ]
  }
}

IMPORTANTE SOBRE "visualAnnotations": Use coordenadas normalizadas exatas de 0 a 1000 relativas à imagem enviada (x=0 esquerda, x=1000 direita, y=0 topo, y=1000 fundo), apontando diretamente para o candle atual (geralmente próximo à direita do gráfico) e para os níveis reais de S/R visíveis no print.`;

        // Build multimodal content parts (either sorted Multi-Timeframe images H1->M15->M5 or single Trigger + optional Macro)
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

        // Call with a tight timeout and leak-free timer cleanup
        const callGeminiWithTimeout = async (
          modelName: string,
          useLowThinking: boolean,
          timeoutMs: number
        ) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            return await Promise.race([
              aiClient!.models.generateContent({
                model: modelName,
                contents: { parts: contentParts },
                config: {
                  systemInstruction: dynamicSystemPrompt,
                  responseMimeType: 'application/json',
                  ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
                },
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error('Timeout de comunicação com o modelo de visão')),
                  timeoutMs
                );
              }),
            ]);
          } finally {
            if (timer !== undefined) clearTimeout(timer);
          }
        };

        let response: any = null;
        try {
          response = await callGeminiWithTimeout('gemini-4-hydrogen', true, 18000);
        } catch {
          // Try fast secondary attempt with separate quota pool
          try {
            response = await callGeminiWithTimeout('gemini-3.1-flash-lite', false, 12000);
          } catch {
            // Fall through cleanly to contingency mode
          }
        }

        if (response && response.text) {
          const parsedData = extractJsonObject(response.text);
          const normalizedAgents = normalizeAgentResults(parsedData.agents);
          const candidateVerdictForGuardrails = resolveCandidateDirectionForGuardrails(normalizedAgents);

          const resolvedAsset = parsedData.asset || asset || 'EUR/USD';
          const resolvedTimeframe = normalizedEntryTimeframe || triggerTimeframeFromMulti || parsedData.timeframe || timeframe || effectiveEntryTf;
          const resolvedMarket = resolveForcedMarketEnvironment(
            explicitMarketFocus,
            resolvedAsset,
            `${asset} ${additionalContext} ${parsedData.marketEnvironment || ''} ${parsedData.detectedPattern || ''}`
          );

          // Evaluate all 3 active institutional guardrails deterministically
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

          // Fallback or sanitize insights with individual dynamic calibration
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

          // Enforce strict mathematical consistency between consensus and quality grade/score
          const {
            qualityGrade: calibratedGrade,
            qualityScore: calibratedScore,
            quality: calibratedQualityLabel,
          } = calibrateQualityAssessment(computedConsensus, rawInsights.qualityScore);

          const sanitizedInsights = {
            trend: rawInsights.trend || (isBuyVerdict ? 'Alta Forte (Topos e Fundos Ascendentes)' : isSellVerdict ? 'Baixa Dominante (Topos e Fundos Descendentes)' : 'Lateralização / Consolidação em Range'),
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
            entryTiming: mustUseCalibratedEntryTiming
              ? dynamicTiming.entryTiming
              : rawInsights.entryTiming,
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
        }
      } catch (geminiError: any) {
        console.warn('Pipeline Gemini indisponível no momento. Ativando motor quantitativo heurístico:', geminiError?.message);
      }
    }

    // Safe contingency mode: blocks trades when AI Vision is unavailable instead of fabricating COMPRA/VENDA
    const fallbackResult = generateIntelligentFallbackAnalysis(
      asset || 'EUR/USD',
      normalizedEntryTimeframe || triggerTimeframeFromMulti || timeframe || effectiveEntryTf,
      mode,
      additionalContext,
      primaryImageSource,
      resolvedClientTime,
      resolvedUtcHour,
      effectiveEntryTf,
      explicitMarketFocus,
      activeTimezone,
      analysisRefMs
    );

    return res.json(fallbackResult);
  } catch (error: any) {
    console.error('Erro geral no endpoint /api/analyze-chart:', error);
    const fallbackEntryTf: EntryExecutionTimeframe =
      String(req.body?.entryTimeframe || '').trim().toUpperCase() === 'M1' ? 'M1' : 'M5';
    const fallbackMarketFocus = normalizeExplicitMarketEnvironment(req.body?.marketEnvironment);
    const fallbackTimezone = normalizeTimeZone(req.body?.timezone);
    const safeFallback = generateIntelligentFallbackAnalysis(
      req.body?.asset || 'EUR/USD',
      req.body?.entryTimeframe || req.body?.timeframe || fallbackEntryTf,
      req.body?.mode || 'simple',
      req.body?.additionalContext || '',
      req.body?.imageBase64 || '',
      req.body?.clientTime || '',
      typeof req.body?.utcHour === 'number' ? req.body.utcHour : undefined,
      fallbackEntryTf,
      fallbackMarketFocus,
      fallbackTimezone
    );
    return res.json(safeFallback);
  }
});

// Safe contingency analyzer when AI Vision is unavailable/timed out:
// Never emits a speculative COMPRA/VENDA signal without real chart vision.
function generateIntelligentFallbackAnalysis(
  asset: string,
  timeframe: string,
  mode: 'simple' | 'pro',
  context: string,
  imagePreview: string,
  clientTime?: string,
  utcHour?: number,
  entryTimeframe?: EntryExecutionTimeframe,
  forcedMarketEnvironment?: MarketEnvironment,
  timezone?: string,
  nowMs?: number
) {
  const resolvedAsset = asset || 'EUR/USD';
  const resolvedTf = timeframe || entryTimeframe || 'M5';
  const resolvedMarket = resolveForcedMarketEnvironment(forcedMarketEnvironment, resolvedAsset, context);
  const resolvedTimezone = normalizeTimeZone(timezone);
  const resolvedTimestamp = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  const calibration = getCurrentCalibrationProfile();

  const dynamicTiming = computeDynamicTimingInsights({
    asset: resolvedAsset,
    timeframe: resolvedTf,
    verdict: 'AGUARDAR',
    keyPattern: 'Leitura Visual Pendente (Modo Contingência)',
    volatilityScore: 60,
    confidenceScore: 45,
    clientTime: clientTime || formatHHMMInTimeZone(new Date(resolvedTimestamp), resolvedTimezone),
    utcHour,
    marketEnvironment: resolvedMarket,
    timezone: resolvedTimezone,
    nowMs: resolvedTimestamp,
  });

  const agents = [
    {
      id: 'price_action' as const,
      name: 'Sofia Alencar (Price Action & Estrutura)',
      role: 'Especialista em Suportes, Resistências e Padrões de Candlestick',
      vote: 'AGUARDAR' as const,
      confidence: 45,
      rationale: 'Aguardando leitura visual completa do gráfico pelo motor multimodal para confirmar topos, fundos e padrões de vela.',
      signals: [
        { label: 'Status Visual', value: 'Reenviar / Aguardar', sentiment: 'neutral' as const },
      ],
    },
    {
      id: 'indicators' as const,
      name: 'Dr. Lucas Vance (Indicadores Técnicos)',
      role: 'Engenheiro de Médias Móveis, Bandas de Bollinger e Osciladores',
      vote: 'AGUARDAR' as const,
      confidence: 45,
      rationale: 'Sem extração visual confirmada de EMAs, RSI ou Bandas de Bollinger neste ciclo.',
      signals: [
        { label: 'Osciladores', value: 'Aguardando Leitura', sentiment: 'neutral' as const },
      ],
    },
    {
      id: 'flow_volatility' as const,
      name: 'Elena Rostova (Fluxo e Volatilidade)',
      role: 'Analista de Pressão Compradora/Vendedora e Risco de Armadilha',
      vote: 'AGUARDAR' as const,
      confidence: 50,
      rationale: 'Por segurança de capital, não estimamos força de fluxo ou pavios sem confirmação visual da IA.',
      signals: [
        { label: 'Proteção', value: 'Bloqueio Preventivo', sentiment: 'neutral' as const },
      ],
    },
    {
      id: 'predictive_ml' as const,
      name: 'Gabriel Chen (Machine Learning Preditivo)',
      role: 'Cientista de Séries Temporais e Simulação Estocástica',
      vote: 'AGUARDAR' as const,
      confidence: 45,
      rationale: 'Série temporal visual indisponível temporariamente; probabilidade mantida neutra.',
      signals: [
        { label: 'Probabilidade', value: 'Neutra (Contingência)', sentiment: 'neutral' as const },
      ],
    },
    {
      id: 'confluence_risk' as const,
      name: 'Marcus Sterling (Juiz Chefe de Risco)',
      role: 'Consolidador de Risco, Relação R:R e Validação dos 80%',
      vote: 'AGUARDAR' as const,
      confidence: 90,
      rationale: 'Modo Contingência ativado: o sistema nunca autoriza COMPRA ou VENDA sem leitura visual validada pela IA.',
      signals: [
        { label: 'Consenso Final', value: 'Bloqueado por Segurança', sentiment: 'neutral' as const },
        { label: 'Ação Recomendada', value: 'Tentar Nova Captura', sentiment: 'neutral' as const },
      ],
    },
  ];

  const computedConsensus = calculateConsensus(agents);

  return {
    id: `analysis_fb_${resolvedTimestamp}`,
    timestamp: resolvedTimestamp,
    timezone: resolvedTimezone,
    imagePreview,
    mode,
    asset: resolvedAsset,
    timeframe: resolvedTf,
    entryTimeframe: entryTimeframe || (resolvedTf === 'M1' ? 'M1' : 'M5'),
    additionalContext: context,
    analysisSource: 'heuristic_fallback' as const,
    marketEnvironment: resolvedMarket,
    calibrationVersion: calibration.version,
    guardrails: {
      allPassed: true,
      vetoReasons: [],
      visualQuality: evaluateVisualLegibility({ isReadable: true, hasPriceAxis: true, hasTimeAxis: true, visibleCandlesCount: 24 }),
      multiTimeframe: evaluateMacroAlignment({ macroAttached: false, candidateVerdict: 'AGUARDAR' }),
      squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'AGUARDAR', freeClearanceRR: 2.0, isSqueezed: false }),
      economicCalendar: evaluateEconomicNewsBlackout({ asset: resolvedAsset, marketEnvironment: resolvedMarket, events: [] }),
    },
    marketCriteriaSummary:
      resolvedMarket === 'MERCADO_OTC'
        ? 'Modo Contingência (OTC): leitura visual pendente para validação de Price Action puro e zonas de S/R.'
        : 'Modo Contingência (Mercado Aberto): leitura visual pendente para validação de liquidez institucional e confluência.',
    verdict: {
      ...computedConsensus,
      recommendedAction:
        'MODO CONTINGÊNCIA: O motor de visão computacional demorou ou esteve indisponível nesta tentativa. Por proteção de capital, nenhuma operação foi autorizada. Envie ou fotografe o gráfico novamente.',
    },
    insights: {
      trend: 'Indefinida (Aguardando Leitura Visual de IA)',
      trendDirection: 'lateral' as const,
      keyPattern: 'Modo Contingência — Sem Leitura Visual Confirmada',
      patternType: 'Proteção de Capital',
      quality: 'C (Contingência — Reenviar Imagem)',
      qualityGrade: 'C' as const,
      qualityScore: 45,
      idealExpiration: dynamicTiming.idealExpiration,
      expirationRationale:
        'Análise visual não concluída a tempo; não execute entradas baseadas em contingência offline.',
      entryTiming: dynamicTiming.entryTiming,
      entryTrigger: 'Contingência · Reenviar Gráfico',
      entryTimingRationale: dynamicTiming.entryTimingRationale,
      sessionLiquidity: dynamicTiming.sessionLiquidity,
      sessionAdvisory: dynamicTiming.sessionAdvisory,
      marketEnvironment: resolvedMarket,
      timezone: resolvedTimezone,
      timezoneLabel: dynamicTiming.timezoneLabel,
    },
    agents,
    plan: {
      asset: resolvedAsset,
      timeframe: resolvedTf,
      entryZone: 'Aguardando nova leitura visual',
      takeProfit1: 'N/A',
      takeProfit2: 'N/A',
      stopLoss: 'N/A',
      riskRewardRatio: 'N/A',
      suggestedExpiration: dynamicTiming.idealExpiration,
      riskLevel: 'Alto' as const,
      direction: 'AGUARDAR' as const,
    },
    radarMetrics: {
      priceAction: 45,
      technicals: 45,
      flowVolatility: 50,
      predictiveML: 45,
      riskManagement: 90,
    },
    candles: [],
    levels: [],
    visualAnnotations: sanitizeVisualAnnotations(
      {
        strategyTitle: 'Proteção Preventiva · Aguardar Visão IA',
        technicalReason:
          'Motor multimodal indisponível ou em timeout neste ciclo. Reenvie o print para destacar a zona exata e validar os 5 agentes.',
      },
      {
        verdict: 'AGUARDAR',
        timeframe: resolvedTf,
        keyPattern: 'Leitura Visual Pendente (Contingência)',
        entryTrigger: 'Contingência · Reenviar Gráfico',
        entryTiming: dynamicTiming.entryTiming,
        trend: 'Indefinida (Aguardando Leitura Visual)',
        recommendedAction:
          'MODO CONTINGÊNCIA: Por proteção de capital, reenvie o gráfico para leitura visual completa.',
      }
    ),
    outcome: 'pending' as const,
  };
}

// Start dev or production server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, bundled server runs from dist/server.js where __dirname is already dist/
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`NextCandle.AI Multi-Agent Terminal rodando em http://localhost:${port}`);
  });
}

startServer();
