import { AgentId, AgentResult, ConsensusVerdict, VoteType, CandleData, MarketEnvironment, RadarMetrics } from '../types/trading';

const CANONICAL_AGENTS: Array<{ id: AgentId; name: string; role: string }> = [
  {
    id: 'price_action',
    name: 'Sofia Alencar (Price Action & Estrutura)',
    role: 'Identificação de suportes, resistências, tendências e padrões de velas',
  },
  {
    id: 'indicators',
    name: 'Dr. Lucas Vance (Indicadores Técnicos)',
    role: 'Leitura de médias móveis, RSI, Bandas de Bollinger e osciladores',
  },
  {
    id: 'flow_volatility',
    name: 'Elena Rostova (Fluxo e Volatilidade)',
    role: 'Avaliação de força do movimento, pavios de rejeição e falso rompimento',
  },
  {
    id: 'predictive_ml',
    name: 'Gabriel Chen (Machine Learning Preditivo)',
    role: 'Modelagem estatística de probabilidade e séries temporais',
  },
  {
    id: 'confluence_risk',
    name: 'Marcus Sterling (Juiz Chefe de Risco)',
    role: 'Consolidação de votos, validação de conflitos e relação risco-retorno',
  },
];

/**
 * Normalizes LLM/external vote strings into strict VoteType ('COMPRA' | 'VENDA' | 'AGUARDAR').
 */
export function normalizeVote(rawVote: unknown): VoteType {
  if (typeof rawVote !== 'string') return 'AGUARDAR';
  const cleaned = rawVote.trim().toUpperCase();
  if (/^(COMPRA|BUY|CALL|LONG|ALTA)$/.test(cleaned)) return 'COMPRA';
  if (/^(VENDA|SELL|PUT|SHORT|BAIXA)$/.test(cleaned)) return 'VENDA';
  return 'AGUARDAR';
}

/**
 * Normalizes confidence values (supports 0..1 decimals, "85%" strings, or 0..100 numbers).
 */
export function normalizeConfidence(rawConf: unknown, fallback = 65): number {
  let num = fallback;
  if (typeof rawConf === 'number' && Number.isFinite(rawConf)) {
    num = rawConf > 0 && rawConf <= 1 ? rawConf * 100 : rawConf;
  } else if (typeof rawConf === 'string') {
    const parsed = parseFloat(rawConf.replace(/[^0-9.,-]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) {
      num = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
    }
  }
  return Math.max(5, Math.min(99, Math.round(num)));
}

/**
 * Normalizes raw agent outputs into the 5 canonical NextCandle.AI specialists,
 * preventing missing agents or inconsistent vote casing from skewing consensus math.
 */
export function normalizeAgentResults(rawAgents: unknown): AgentResult[] {
  const list = Array.isArray(rawAgents) ? rawAgents : [];

  return CANONICAL_AGENTS.map((canonical, idx) => {
    const matched =
      list.find((item: any) => item && item.id === canonical.id) ||
      list[idx] ||
      {};

    const vote = normalizeVote((matched as any).vote);
    const confidence = normalizeConfidence((matched as any).confidence, vote === 'AGUARDAR' ? 55 : 78);
    const rationale =
      typeof (matched as any).rationale === 'string' && (matched as any).rationale.trim()
        ? (matched as any).rationale.trim()
        : 'Leitura técnica consolidada sem divergências adicionais.';

    const rawSignals = Array.isArray((matched as any).signals) ? (matched as any).signals : [];
    const signals = rawSignals
      .filter((s: any) => s && typeof s.label === 'string' && typeof s.value === 'string')
      .slice(0, 4)
      .map((s: any) => ({
        label: s.label.trim(),
        value: s.value.trim(),
        sentiment: (s.sentiment === 'bullish' || s.sentiment === 'bearish' ? s.sentiment : 'neutral') as
          | 'bullish'
          | 'bearish'
          | 'neutral',
      }));

    return {
      id: canonical.id,
      name: typeof (matched as any).name === 'string' && (matched as any).name.trim() ? (matched as any).name : canonical.name,
      role: typeof (matched as any).role === 'string' && (matched as any).role.trim() ? (matched as any).role : canonical.role,
      vote,
      confidence,
      rationale,
      signals,
    };
  });
}

/**
 * Safely parses JSON from LLM text responses, stripping markdown code fences, prose wrappers, or trailing commas.
 */
export function extractJsonObject(rawText: string): any {
  const trimmed = (rawText || '').trim();
  if (!trimmed) throw new Error('Resposta vazia do motor de visão.');

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate);
    } catch {
      const cleanedTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleanedTrailingCommas);
    }
  };

  try {
    return tryParse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return tryParse(unfenced.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('JSON estruturado não encontrado na resposta do modelo.');
  }
}

/**
 * Calculates the multi-agent consensus verdict strictly enforcing the 80% (4 out of 5) rule.
 * A BUY or SELL signal is ONLY triggered if at least 80% of voting agents agree.
 * Otherwise, the verdict is strictly AGUARDAR (Wait / Neutral).
 */
export function calculateConsensus(agents: AgentResult[]): ConsensusVerdict {
  const totalAgents = agents.length;
  if (totalAgents === 0) {
    return {
      verdict: 'AGUARDAR',
      consensusRatio: 0,
      agreementCount: 0,
      totalAgents: 0,
      buyVotes: 0,
      sellVotes: 0,
      neutralVotes: 0,
      overallConfidence: 0,
      hasConsensus: false,
      confluenceScore: 0,
      recommendedAction: 'Nenhum agente disponível para votação.',
      keyFactors: [],
    };
  }

  let buyVotes = 0;
  let sellVotes = 0;
  let neutralVotes = 0;
  let totalConfidenceWeighted = 0;

  for (const agent of agents) {
    if (agent.vote === 'COMPRA') buyVotes++;
    else if (agent.vote === 'VENDA') sellVotes++;
    else neutralVotes++;

    totalConfidenceWeighted += agent.confidence;
  }

  const overallConfidence = Math.round(totalConfidenceWeighted / totalAgents);

  // Minimum required agreement is 80% (e.g. Math.ceil(5 * 0.8) = 4)
  const minRequiredVotes = Math.ceil(totalAgents * 0.8);

  let verdict: VoteType = 'AGUARDAR';
  let agreementCount = 0;
  let hasConsensus = false;

  if (buyVotes >= minRequiredVotes) {
    verdict = 'COMPRA';
    agreementCount = buyVotes;
    hasConsensus = true;
  } else if (sellVotes >= minRequiredVotes) {
    verdict = 'VENDA';
    agreementCount = sellVotes;
    hasConsensus = true;
  } else {
    verdict = 'AGUARDAR';
    // Track directional agreement toward the 80% (4/5) entry threshold so AGUARDAR never shows 100% consensus
    agreementCount = Math.max(buyVotes, sellVotes);
    hasConsensus = false;
  }

  const consensusRatio = Number((agreementCount / totalAgents).toFixed(2));

  // Compute directional confluence score (0 - 100): blocked AGUARDAR signals are strictly capped below 65
  const confluenceScore = hasConsensus
    ? Math.round((agreementCount / totalAgents) * 60 + (overallConfidence / 100) * 40)
    : Math.min(64, Math.round((agreementCount / totalAgents) * 60 + (overallConfidence / 100) * 20));

  let recommendedAction = '';
  if (verdict === 'COMPRA') {
    recommendedAction = `Confluência altista confirmada por ${buyVotes}/${totalAgents} agentes (${Math.round((buyVotes / totalAgents) * 100)}%). Operação de compra autorizada com gestão de risco controlada.`;
  } else if (verdict === 'VENDA') {
    recommendedAction = `Confluência baixista confirmada por ${sellVotes}/${totalAgents} agentes (${Math.round((sellVotes / totalAgents) * 100)}%). Operação de venda autorizada com gestão de risco controlada.`;
  } else {
    recommendedAction = `Consenso insuficiente (${Math.max(buyVotes, sellVotes)}/${totalAgents} votos, abaixo do limiar de 80%). Mercado sem confluência clara ou em zona de ruído. Recomendado aguardar nova confirmação de estrutura.`;
  }

  const keyFactors: string[] = [];
  agents.forEach(a => {
    if (a.vote === verdict || (verdict === 'AGUARDAR' && a.confidence > 70)) {
      keyFactors.push(`${a.name}: ${a.rationale}`);
    }
  });

  return {
    verdict,
    consensusRatio,
    agreementCount,
    totalAgents,
    buyVotes,
    sellVotes,
    neutralVotes,
    overallConfidence,
    hasConsensus,
    confluenceScore,
    recommendedAction,
    keyFactors: keyFactors.slice(0, 4),
  };
}

/**
 * Calculates Risk to Reward ratio
 */
export function calculateRiskReward(entry: number, stopLoss: number, takeProfit: number): { ratio: number; formatted: string } {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);

  if (risk === 0) return { ratio: 0, formatted: '1:0.0' };
  const r = Number((reward / risk).toFixed(2));
  return {
    ratio: r,
    formatted: `1:${r}`,
  };
}

/**
 * Generates forward predictive simulation candles (Monte Carlo / Random Walk with drift)
 */
export function generatePredictiveCandles(
  lastCandle: CandleData,
  count: number = 5,
  direction: VoteType,
  volatility: number = 0.0015
): CandleData[] {
  const projected: CandleData[] = [];
  let currentClose = lastCandle.close;

  // Drift direction multiplier
  const drift = direction === 'COMPRA' ? 0.0008 : direction === 'VENDA' ? -0.0008 : 0;

  for (let i = 1; i <= count; i++) {
    const randomShock = (Math.random() - 0.48) * volatility * currentClose;
    const directionalMove = drift * currentClose * (1 + i * 0.1);
    
    const open = currentClose;
    const close = Number((open + directionalMove + randomShock).toFixed(5));
    const high = Number((Math.max(open, close) + Math.random() * volatility * currentClose * 0.8).toFixed(5));
    const low = Number((Math.min(open, close) - Math.random() * volatility * currentClose * 0.8).toFixed(5));

    // Mock forward time (incrementing)
    const baseDate = new Date();
    baseDate.setMinutes(baseDate.getMinutes() + i * 5);
    const timeStr = `${baseDate.getHours().toString().padStart(2, '0')}:${baseDate.getMinutes().toString().padStart(2, '0')}`;

    projected.push({
      time: timeStr,
      open,
      high,
      low,
      close,
      volume: Math.floor(800 + Math.random() * 1200),
      isProjected: true,
    });

    currentClose = close;
  }

  return projected;
}

/**
 * Calculates Simple/Exponential Moving Average for a series of closes
 */
export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = [];

  // Initial SMA as first EMA
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += closes[i];
  }
  let currentEma = initialSum / period;
  emaArray.push(currentEma);

  for (let i = period; i < closes.length; i++) {
    currentEma = closes[i] * k + currentEma * (1 - k);
    emaArray.push(currentEma);
  }

  return emaArray;
}

/**
 * Computes Relative Strength Index (RSI) for candle close series
 */
export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

/**
 * Sanitizes multi-agent radar scores to valid integer bounds [0..100],
 * falling back to each canonical agent's calibrated confidence.
 */
export function sanitizeRadarMetrics(rawRadar: any, agents: AgentResult[]): RadarMetrics {
  const findConf = (id: AgentId, fallback = 75): number => {
    const found = agents.find((a) => a.id === id);
    return typeof found?.confidence === 'number' && Number.isFinite(found.confidence)
      ? Math.max(5, Math.min(99, Math.round(found.confidence)))
      : fallback;
  };

  const clampAxis = (val: unknown, fallback: number): number => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Math.max(5, Math.min(100, Math.round(val)));
    }
    return fallback;
  };

  const rm = rawRadar && typeof rawRadar === 'object' ? rawRadar : {};
  return {
    priceAction: clampAxis(rm.priceAction, findConf('price_action')),
    technicals: clampAxis(rm.technicals, findConf('indicators')),
    flowVolatility: clampAxis(rm.flowVolatility, findConf('flow_volatility')),
    predictiveML: clampAxis(rm.predictiveML, findConf('predictive_ml')),
    riskManagement: clampAxis(rm.riskManagement, findConf('confluence_risk')),
  };
}

/**
 * Calibrates qualityGrade, qualityScore, and formatted quality label strictly against
 * computed consensus agreement and confluenceScore so scores never contradict the verdict.
 */
export function calibrateQualityAssessment(
  consensus: ConsensusVerdict,
  rawQualityScore: unknown
): {
  qualityGrade: 'A+' | 'A' | 'B' | 'C';
  qualityScore: number;
  quality: string;
} {
  const parsedRaw =
    typeof rawQualityScore === 'number' && Number.isFinite(rawQualityScore)
      ? rawQualityScore
      : typeof rawQualityScore === 'string' && !Number.isNaN(parseFloat(rawQualityScore))
      ? parseFloat(rawQualityScore)
      : consensus.confluenceScore;

  if (!consensus.hasConsensus) {
    const qualityScore = Math.max(30, Math.min(64, Math.round(parsedRaw || consensus.confluenceScore)));
    const qualityGrade: 'B' | 'C' = consensus.confluenceScore >= 55 ? 'B' : 'C';
    const quality =
      qualityGrade === 'B'
        ? `B (Sem Consenso 80% · ${consensus.agreementCount}/${consensus.totalAgents} - ${qualityScore}%)`
        : `C (Baixa Confluência / Risco - ${qualityScore}%)`;
    return { qualityGrade, qualityScore, quality };
  }

  const isUnanimous =
    consensus.totalAgents > 0 && consensus.agreementCount === consensus.totalAgents;

  if (isUnanimous && consensus.confluenceScore >= 85) {
    const qualityScore = Math.max(84, Math.min(98, Math.round(parsedRaw || consensus.confluenceScore)));
    return {
      qualityGrade: 'A+',
      qualityScore,
      quality: `A+ (Excelente Confluência ${consensus.agreementCount}/${consensus.totalAgents} - ${qualityScore}%)`,
    };
  }

  // 4/5 consensus or lower-confidence unanimous setup capped at A [74..89]
  const qualityScore = Math.max(74, Math.min(89, Math.round(parsedRaw || consensus.confluenceScore)));
  return {
    qualityGrade: 'A',
    qualityScore,
    quality: `A (Alta Confluência ${consensus.agreementCount}/${consensus.totalAgents} - ${qualityScore}%)`,
  };
}

/**
 * Prevents Open Market vs OTC wording leakage in the LLM-generated criteria summary
 * when a specific MarketEnvironment is active.
 */
export function sanitizeMarketCriteriaSummary(
  rawSummary: unknown,
  resolvedMarket: MarketEnvironment
): string {
  const defaultOtc =
    'Foco Exclusivo em Mercado OTC: os 5 agentes aplicaram Price Action puro, repetição algorítmica e zonas de suporte/resistência, desconsiderando calendário econômico externo.';
  const defaultOpen =
    'Foco Exclusivo em Mercado Aberto: os 5 agentes avaliaram liquidez institucional, volume real, horário de sessão e exposição a notícias econômicas.';

  if (typeof rawSummary !== 'string') {
    return resolvedMarket === 'MERCADO_OTC' ? defaultOtc : defaultOpen;
  }

  const cleaned = rawSummary.replace(/[\r\n\t]+/g, ' ').trim();
  if (!cleaned || /^(n\/a|na|nenhum|null|undefined|-)$/i.test(cleaned)) {
    return resolvedMarket === 'MERCADO_OTC' ? defaultOtc : defaultOpen;
  }

  if (resolvedMarket === 'MERCADO_OTC') {
    const mentionsOpenCriteriaWithoutDismissing =
      /(sess[aã]o de londres|nova york|volume real de bolsa|liquidity sweep institucional)/i.test(cleaned) ||
      (/calend[aá]rio econ[oô]mico|not[ií]cias/i.test(cleaned) &&
        !/desconsider|ignor|isent|sem\s+(?:not[ií]cias|calend[aá]rio)/i.test(cleaned));
    if (mentionsOpenCriteriaWithoutDismissing || !/otc|price action|algor[ií]tmic/i.test(cleaned)) {
      return defaultOtc;
    }
    return cleaned;
  }

  // MERCADO_ABERTO: reject accidental OTC/synthetic phrasing
  if (/\botc\b|algor[ií]tmo\s*sint[eé]tico|repeti[cç][aã]o\s*algor[ií]tmic/i.test(cleaned)) {
    return defaultOpen;
  }

  return cleaned;
}

