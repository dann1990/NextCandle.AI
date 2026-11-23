import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AgentCalibrationProfile, AgentId } from '../src/types/trading.js';
import { extractJsonObject } from '../src/utils/consensusEngine.js';

const CALIBRATION_FILE = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), 'nextcandle-calibration.json')
  : path.join(process.cwd(), '.nextcandle-calibration.json');
const AUTO_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown after 429

export interface ClientPerformanceFeedback {
  totalDecided: number;
  overallWinRate: number;
  openWinRate: number | null;
  otcWinRate: number | null;
  weakestAssets?: string[];
  strongestAssets?: string[];
}

function clampPercent(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  return Math.max(0, Math.min(100, Math.round(val)));
}

function sanitizeAssetList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3)
    .map((s) => s.replace(/[\r\n]+/g, ' ').trim().slice(0, 60));
}

export function sanitizePerformanceFeedback(raw: unknown): ClientPerformanceFeedback | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const totalDecided =
    typeof obj.totalDecided === 'number' && Number.isFinite(obj.totalDecided)
      ? Math.max(0, Math.min(10000, Math.floor(obj.totalDecided)))
      : 0;

  return {
    totalDecided,
    overallWinRate: clampPercent(obj.overallWinRate) ?? 0,
    openWinRate: clampPercent(obj.openWinRate),
    otcWinRate: clampPercent(obj.otcWinRate),
    strongestAssets: sanitizeAssetList(obj.strongestAssets),
    weakestAssets: sanitizeAssetList(obj.weakestAssets),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const BASELINE_PROFILE: AgentCalibrationProfile = {
  version: 'v2.0-Híbrido',
  updatedAt: Date.now(),
  updatedBy: 'baseline',
  marketRegimeSummary:
    'Calibração híbrida base: proteção contra liquidez baixa/notícias no Mercado Aberto e leitura de Price Action puro com simetria algorítmica no Mercado OTC.',
  openMarketIndicators: ['EMA 20/50/200', 'VWAP & Liquidez de Sessão', 'RSI (14) + Divergência', 'MACD Histograma', 'ATR Volatilidade'],
  otcIndicators: ['Price Action Puro (Engolfo/Pinbar)', 'S/R Psicológico & Taxas Redondas', 'Simetria de Micro-Ondas', 'Bollinger (20,2) Exaustão'],
  agents: [
    {
      id: 'price_action',
      openMarketFocus: 'HH/HL/LH/LL, LTA/LTB, S/R institucional e rompimentos com deslocamento real.',
      otcFocus: 'Price Action puro, rejeição em taxas redondas, pullbacks limpos e padrões de vela de comando.',
      prioritizedIndicators: ['Estrutura S/R', 'LTA/LTB', 'Pinbar / Engolfo'],
      weight: 1.0,
    },
    {
      id: 'indicators',
      openMarketFocus: 'Cruzamento EMA 20/50, inclinação EMA 200, divergências de RSI (14) e Bandas de Bollinger.',
      otcFocus: 'Confirmação secundária de exaustão em extremidades de Bollinger e sobrecompra/sobrevenda de RSI sobre S/R.',
      prioritizedIndicators: ['EMA 20/50/200', 'RSI (14)', 'Bollinger (20,2)'],
      weight: 0.95,
    },
    {
      id: 'flow_volatility',
      openMarketFocus: 'Volume real visível, liquidity sweeps, liquidez de sessão Londres/NY e filtragem pré/pós-notícias.',
      otcFocus: 'Proporção corpo vs pavio, ritmo algorítmico de repetição de cores/velas e rejeição em consolidação estreita.',
      prioritizedIndicators: ['Volume Delta', 'Wick Ratio', 'ATR / Amplitude'],
      weight: 1.0,
    },
    {
      id: 'predictive_ml',
      openMarketFocus: 'Probabilidade direcional ajustada ao regime de volatilidade da sessão institucional atual.',
      otcFocus: 'Ciclos estatísticos de alternância, continuidade e exaustão algorítmica de curto prazo.',
      prioritizedIndicators: ['Séries Temporais', 'Simetria de Ciclos', 'Probabilidade Bayesiana'],
      weight: 0.95,
    },
    {
      id: 'confluence_risk',
      openMarketFocus: 'Exigir ≥ 80% de votos, bloquear entradas em notícias (±15m) e vetar zonas espremidas R:R < 1:1.5.',
      otcFocus: 'Exigir ≥ 80% de votos em S/R limpas, ignorar calendário externo e vetar entradas coladas em obstáculo contrário.',
      prioritizedIndicators: ['Consenso 4/5', 'R:R ≥ 1:1.5', 'Filtro Zona Espremida'],
      weight: 1.15,
    },
  ],
};

let activeProfile: AgentCalibrationProfile | null = null;
let refreshInFlight: Promise<AgentCalibrationProfile> | null = null;
let quotaCooldownUntil = 0;

function isRateLimitError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /429|RESOURCE_EXHAUSTED|quota|rate[- ]?limit/i.test(msg);
}

function getNextVersion(currentVersion: string, suffix: string): string {
  const m = currentVersion.match(/v2\.(\d+)/);
  const nextNum = m ? parseInt(m[1], 10) + 1 : 1;
  return `v2.${nextNum}-${suffix}`;
}

function loadCalibrationFromDisk(): AgentCalibrationProfile {
  try {
    if (fs.existsSync(CALIBRATION_FILE)) {
      const raw = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.agents) && parsed.agents.length === 5) {
        return parsed as AgentCalibrationProfile;
      }
    }
  } catch {
    // Ignore disk cache read errors and fall back to baseline
  }
  return { ...BASELINE_PROFILE, updatedAt: Date.now() };
}

function saveCalibrationToDisk(profile: AgentCalibrationProfile) {
  try {
    const dir = path.dirname(CALIBRATION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(profile, null, 2), 'utf-8');
  } catch {
    // Ignore disk write errors on read-only environments
  }
}

export function getCurrentCalibrationProfile(): AgentCalibrationProfile {
  if (!activeProfile) {
    activeProfile = loadCalibrationFromDisk();
  }
  return activeProfile;
}

export function isCalibrationStale(profile: AgentCalibrationProfile): boolean {
  return Date.now() - profile.updatedAt > AUTO_REFRESH_INTERVAL_MS && Date.now() >= quotaCooldownUntil;
}

/**
 * Deterministic telemetry-driven calibration fallback when AI quota is exhausted
 * or network is temporarily limited, adapting agent weights and indicator priorities
 * directly from real Win/Loss feedback and current UTC trading session.
 */
function buildTelemetryCalibrationProfile(
  current: AgentCalibrationProfile,
  feedback?: ClientPerformanceFeedback,
  reasonNotice?: string
): AgentCalibrationProfile {
  const utcHour = new Date().getUTCHours();
  const isHighLiquidityWindow = utcHour >= 7 && utcHour <= 17;
  const sessionLabel = isHighLiquidityWindow
    ? 'Sessão Londres/NY (alta liquidez institucional)'
    : 'Sessão Asiática/Rollover (maior seletividade e filtro de range)';

  const openLowWinRate = typeof feedback?.openWinRate === 'number' && feedback.openWinRate < 60;
  const otcLowWinRate = typeof feedback?.otcWinRate === 'number' && feedback.otcWinRate < 60;
  const hasStats = Boolean(feedback && feedback.totalDecided > 0);

  const regimeText = hasStats
    ? `Calibração por telemetria real (${feedback!.totalDecided} trades · ${feedback!.overallWinRate}% assertividade) em ${sessionLabel}${
        openLowWinRate ? ' — rigor elevado em Mercado Aberto' : ''
      }${otcLowWinRate ? ' — foco estrito em S/R forte no OTC' : ''}.`
    : `Calibração adaptativa para ${sessionLabel}: pesos otimizados para filtragem de falsos rompimentos e proteção R:R ≥ 1:1.5.`;

  const updatedAgents = current.agents.map((agent) => {
    if (agent.id === 'confluence_risk') {
      return {
        ...agent,
        weight: openLowWinRate || otcLowWinRate ? 1.3 : 1.2,
      };
    }
    if (agent.id === 'price_action' && otcLowWinRate) {
      return {
        ...agent,
        otcFocus:
          'Exigir toque em S/R testada ≥ 2x com pavio claro de rejeição e bloqueio em candles de indecisão.',
        weight: 1.15,
      };
    }
    if (agent.id === 'flow_volatility' && !isHighLiquidityWindow) {
      return {
        ...agent,
        openMarketFocus:
          'Reduzir exposição em consolidações asiáticas; exigir deslocamento claro e ausência de spread alargado.',
        weight: 1.1,
      };
    }
    return agent;
  });

  const unchanged =
    current.updatedBy === 'telemetry_adaptive' &&
    current.marketRegimeSummary === regimeText &&
    current.notice === reasonNotice &&
    JSON.stringify(current.agents) === JSON.stringify(updatedAgents);

  const nextProfile: AgentCalibrationProfile = {
    ...current,
    version: unchanged ? current.version : getNextVersion(current.version, 'Telemetria'),
    updatedAt: unchanged ? current.updatedAt : Date.now(),
    updatedBy: 'telemetry_adaptive',
    marketRegimeSummary: regimeText,
    agents: updatedAgents,
    notice: reasonNotice,
  };

  activeProfile = nextProfile;
  if (!unchanged) {
    saveCalibrationToDisk(nextProfile);
  }
  return nextProfile;
}

const AI_REFRESH_MIN_INTERVAL_MS = 30 * 60 * 1000; // Minimum 30 min between external AI calibration calls
let lastAiRefreshAttemptAt = 0;

/**
 * Automatically updates the 5 agents' analytical directives and prioritized indicators
 * using Gemini (with automatic Flash Lite fallback) and instant Win/Loss telemetry calibration.
 */
export async function refreshCalibrationWithAI(
  aiClient: GoogleGenAI | null,
  rawFeedback?: ClientPerformanceFeedback
): Promise<AgentCalibrationProfile> {
  const feedback = sanitizePerformanceFeedback(rawFeedback);
  const current = getCurrentCalibrationProfile();
  if (!aiClient) {
    return buildTelemetryCalibrationProfile(
      current,
      feedback,
      'Calibração automática aplicada via telemetria Win/Loss e janela de sessão.'
    );
  }

  const now = Date.now();
  if (now < quotaCooldownUntil || now - lastAiRefreshAttemptAt < AI_REFRESH_MIN_INTERVAL_MS) {
    return buildTelemetryCalibrationProfile(current, feedback);
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  lastAiRefreshAttemptAt = now;

  const flight = (async (): Promise<AgentCalibrationProfile> => {
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const perfSummary =
        feedback && feedback.totalDecided > 0
          ? `Histórico real recente do operador: ${feedback.totalDecided} trades decididos, assertividade geral ${feedback.overallWinRate}% (Mercado Aberto: ${feedback.openWinRate ?? 'N/D'}%, Mercado OTC: ${feedback.otcWinRate ?? 'N/D'}%). Melhores ativos: ${feedback.strongestAssets?.join(', ') || 'N/D'}. Piores ativos: ${feedback.weakestAssets?.join(', ') || 'N/D'}.`
          : 'Sem histórico de trades suficiente ainda; calibre para o regime atual de volatilidade Forex, Índices, Cripto e OTC.';

      const prompt = `Hoje é ${todayIso}. Atualize as diretrizes quantitativas e indicadores prioritários dos 5 agentes do NextCandle.AI para maximizar a assertividade em Mercado Aberto e Mercado OTC.

Contexto de performance do usuário: ${perfSummary}

Responda ESTRITAMENTE com um objeto JSON válido (sem blocos markdown) neste formato:
{
  "marketRegimeSummary": "Resumo em português (1 a 2 frases) do regime de volatilidade atual e ajuste recomendado nos indicadores.",
  "openMarketIndicators": ["EMA 20/50/200", "RSI (14) + Divergência", "ATR (14)", "Estrutura S/R Institucional", "VWAP Sessão"],
  "otcIndicators": ["Price Action Puro (Rejeição/Engolfo)", "Taxas Redondas S/R", "Bollinger (20,2) Exaustão", "Simetria de Micro-Ondas"],
  "agents": [
    {
      "id": "price_action",
      "openMarketFocus": "Diretriz atualizada em português para Mercado Aberto",
      "otcFocus": "Diretriz atualizada em português para Mercado OTC",
      "prioritizedIndicators": ["Ind 1", "Ind 2"],
      "weight": 1.05
    },
    {
      "id": "indicators",
      "openMarketFocus": "...",
      "otcFocus": "...",
      "prioritizedIndicators": ["EMA 20/50", "RSI (14)"],
      "weight": 0.95
    },
    {
      "id": "flow_volatility",
      "openMarketFocus": "...",
      "otcFocus": "...",
      "prioritizedIndicators": ["Volume Delta", "ATR"],
      "weight": 1.0
    },
    {
      "id": "predictive_ml",
      "openMarketFocus": "...",
      "otcFocus": "...",
      "prioritizedIndicators": ["Regime Volatilidade", "Simetria"],
      "weight": 0.95
    },
    {
      "id": "confluence_risk",
      "openMarketFocus": "Exigir 4/5 votos, calendário ±15m limpo e espaço R:R >= 1:1.5 antes de S/R.",
      "otcFocus": "Exigir 4/5 votos, Price Action em S/R forte e espaço R:R >= 1:1.5 antes de S/R.",
      "prioritizedIndicators": ["Consenso 80%", "R:R >= 1:1.5"],
      "weight": 1.2
    }
  ]
}`;

      const tryModel = async (modelName: string, withSearch: boolean, timeoutMs: number) => {
        return withTimeout(
          aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              ...(withSearch ? { tools: [{ googleSearch: {} }] } : { responseMimeType: 'application/json' }),
              ...(modelName === 'gemini-4-hydrogen' ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            },
          }),
          timeoutMs,
          'Timeout na atualização adaptativa'
        );
      };

      let response: any = null;
      let hitRateLimit = false;

      try {
        response = await tryModel('gemini-4-hydrogen', true, 12000);
      } catch (err1) {
        if (isRateLimitError(err1)) hitRateLimit = true;
        try {
          // Fallback to fast Flash Lite model without search grounding (uses separate quota pool)
          response = await tryModel('gemini-3.1-flash-lite', false, 10000);
          hitRateLimit = false;
        } catch (err2) {
          if (isRateLimitError(err2)) hitRateLimit = true;
        }
      }

      if (response?.text) {
        try {
          const parsed = extractJsonObject(response.text);
          const rawAgents = Array.isArray(parsed.agents) ? parsed.agents : [];
          const canonicalIds: AgentId[] = [
            'price_action',
            'indicators',
            'flow_volatility',
            'predictive_ml',
            'confluence_risk',
          ];

          const mergedAgents = canonicalIds.map((id) => {
            const base = BASELINE_PROFILE.agents.find((a) => a.id === id)!;
            const found = rawAgents.find((a: any) => a?.id === id) || {};
            return {
              id,
              openMarketFocus:
                typeof found.openMarketFocus === 'string' && found.openMarketFocus.trim()
                  ? found.openMarketFocus.trim()
                  : base.openMarketFocus,
              otcFocus:
                typeof found.otcFocus === 'string' && found.otcFocus.trim()
                  ? found.otcFocus.trim()
                  : base.otcFocus,
              prioritizedIndicators:
                Array.isArray(found.prioritizedIndicators) && found.prioritizedIndicators.length > 0
                  ? found.prioritizedIndicators.map(String).slice(0, 4)
                  : base.prioritizedIndicators,
              weight:
                typeof found.weight === 'number' && Number.isFinite(found.weight)
                  ? Math.min(1.5, Math.max(0.7, Number(found.weight.toFixed(2))))
                  : base.weight,
            };
          });

          const sources: Array<{ title: string; uri: string }> = [];
          const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(chunks)) {
            for (const ch of chunks) {
              if (ch?.web?.uri && /^https?:\/\//i.test(String(ch.web.uri))) {
                sources.push({
                  title: String(ch.web.title || 'Referência de Mercado').slice(0, 120),
                  uri: String(ch.web.uri),
                });
              }
            }
          }

          const updated: AgentCalibrationProfile = {
            version: getNextVersion(current.version, 'AI'),
            updatedAt: Date.now(),
            updatedBy: 'ai_adaptive',
            marketRegimeSummary:
              typeof parsed.marketRegimeSummary === 'string' && parsed.marketRegimeSummary.trim()
                ? parsed.marketRegimeSummary.trim()
                : current.marketRegimeSummary,
            openMarketIndicators:
              Array.isArray(parsed.openMarketIndicators) && parsed.openMarketIndicators.length > 0
                ? parsed.openMarketIndicators.map(String).slice(0, 6)
                : current.openMarketIndicators,
            otcIndicators:
              Array.isArray(parsed.otcIndicators) && parsed.otcIndicators.length > 0
                ? parsed.otcIndicators.map(String).slice(0, 6)
                : current.otcIndicators,
            agents: mergedAgents,
            groundedSources: sources.slice(0, 4),
            notice: undefined,
          };

          activeProfile = updated;
          saveCalibrationToDisk(updated);
          return updated;
        } catch {
          // Malformed JSON falls through cleanly to telemetry calibration
        }
      }

      if (hitRateLimit) {
        quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        return buildTelemetryCalibrationProfile(
          current,
          feedback,
          'Cota da API Gemini momentaneamente atingida (429). Calibração aplicada automaticamente usando sua telemetria Win/Loss e regime de sessão.'
        );
      }

      return buildTelemetryCalibrationProfile(
        current,
        feedback,
        'Calibração ajustada via telemetria Win/Loss e sessão de mercado.'
      );
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = flight;
  return flight;
}

/**
 * Formats the live AI-updated calibration directives into the multimodal system prompt,
 * scoped strictly to the active market focus when explicitly locked by the trader.
 */
export function buildDynamicCalibrationPromptSection(
  profile: AgentCalibrationProfile,
  explicitMarketFocus?: 'MERCADO_ABERTO' | 'MERCADO_OTC'
): string {
  if (explicitMarketFocus === 'MERCADO_OTC') {
    const otcLines = profile.agents
      .map((a) => `- ${a.id} (Peso ${a.weight}): Foco OTC=[${a.otcFocus}]`)
      .join('\n');
    return `CALIBRAÇÃO ADAPTATIVA ATIVA (${profile.version} · EXCLUSIVO MERCADO OTC):
Regime Atual: ${profile.marketRegimeSummary}
Indicadores Prioritários Mercado OTC: ${profile.otcIndicators.join(', ')}
Diretrizes Atualizadas dos Agentes (Somente OTC):
${otcLines}`;
  }

  if (explicitMarketFocus === 'MERCADO_ABERTO') {
    const openLines = profile.agents
      .map(
        (a) =>
          `- ${a.id} (Peso ${a.weight}): Foco Aberto=[${a.openMarketFocus}] | Indicadores=[${a.prioritizedIndicators.join(', ')}]`
      )
      .join('\n');
    return `CALIBRAÇÃO ADAPTATIVA ATIVA (${profile.version} · EXCLUSIVO MERCADO ABERTO):
Regime Atual: ${profile.marketRegimeSummary}
Indicadores Prioritários Mercado Aberto: ${profile.openMarketIndicators.join(', ')}
Diretrizes Atualizadas dos Agentes (Somente Mercado Aberto):
${openLines}`;
  }

  const agentLines = profile.agents
    .map(
      (a) =>
        `- ${a.id} (Peso ${a.weight}): Aberto=[${a.openMarketFocus}] | OTC=[${a.otcFocus}] | Indicadores=[${a.prioritizedIndicators.join(', ')}]`
    )
    .join('\n');

  return `CALIBRAÇÃO ADAPTATIVA ATIVA (${profile.version}):
Regime Atual: ${profile.marketRegimeSummary}
Indicadores Prioritários Mercado Aberto: ${profile.openMarketIndicators.join(', ')}
Indicadores Prioritários Mercado OTC: ${profile.otcIndicators.join(', ')}
Diretrizes Atualizadas dos Agentes:
${agentLines}`;
}

