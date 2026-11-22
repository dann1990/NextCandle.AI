import {
  AgentResult,
  AllowedMultiTimeframe,
  ConsensusVerdict,
  EconomicCalendarCheck,
  EconomicNewsEvent,
  EntryExecutionTimeframe,
  GuardrailsReport,
  MarketEnvironment,
  MultiTimeframeCheck,
  SqueezeZoneCheck,
  VisualQualityCheck,
  VoteType,
} from '../types/trading.js';
import { calculateConsensus } from './consensusEngine.js';

export const MIN_VISIBLE_CANDLES = 20;
export const MIN_CLEARANCE_RR = 1.5;
export const MIN_DIRECTIONAL_CONFIDENCE = 70;
export const NEWS_BLACKOUT_WINDOW_MINUTES = 15;
export const ALLOWED_MULTI_TIMEFRAMES: readonly AllowedMultiTimeframe[] = ['H1', 'M15', 'M5'] as const;
export const ALLOWED_ENTRY_TIMEFRAMES: readonly EntryExecutionTimeframe[] = ['M1', 'M5'] as const;

export function isAllowedMultiTimeframe(tf: unknown): tf is AllowedMultiTimeframe {
  if (typeof tf !== 'string') return false;
  return (ALLOWED_MULTI_TIMEFRAMES as readonly string[]).includes(tf.trim().toUpperCase());
}

export function isAllowedEntryTimeframe(tf: unknown): tf is EntryExecutionTimeframe {
  if (typeof tf !== 'string') return false;
  return (ALLOWED_ENTRY_TIMEFRAMES as readonly string[]).includes(tf.trim().toUpperCase());
}

const KNOWN_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'XAU', 'XAG', 'BTC', 'ETH'];

/**
 * Extracts ISO/commodity currency codes from an asset label (including OTC suffixes).
 */
export function extractCurrenciesFromAsset(asset: string): string[] {
  const clean = (asset || '')
    .toUpperCase()
    .replace(/\(?\s*OTC\s*\)?/g, '')
    .replace(/[^A-Z0-9/]/g, '');

  const found: string[] = [];

  if (/US30|NAS100|NDX|SPX500|US500|US100|DOW/i.test(clean)) {
    found.push('USD');
  }
  if (/GER40|DAX|EU50/i.test(clean)) {
    found.push('EUR');
  }
  if (/UK100|FTSE/i.test(clean)) {
    found.push('GBP');
  }
  if (/JP225|NIKKEI/i.test(clean)) {
    found.push('JPY');
  }

  const matches: Array<{ code: string; index: number }> = [];
  for (const code of KNOWN_CURRENCIES) {
    const idx = clean.indexOf(code);
    if (idx !== -1 && !found.includes(code)) {
      matches.push({ code, index: idx });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  for (const m of matches) {
    found.push(m.code);
  }

  return found;
}

/**
 * Informational chart metadata reader (never blocks or rejects captures).
 */
export function evaluateVisualLegibility(input: {
  isReadable?: unknown;
  hasPriceAxis?: unknown;
  hasTimeAxis?: unknown;
  visibleCandlesCount?: unknown;
  issues?: unknown;
}): VisualQualityCheck {
  const isReadable = input.isReadable !== false;
  const hasPriceAxis = input.hasPriceAxis !== false;
  const hasTimeAxis = input.hasTimeAxis !== false;

  const rawCount =
    typeof input.visibleCandlesCount === 'number' && Number.isFinite(input.visibleCandlesCount)
      ? Math.max(0, Math.round(input.visibleCandlesCount))
      : typeof input.visibleCandlesCount === 'string' && !Number.isNaN(parseInt(input.visibleCandlesCount, 10))
      ? Math.max(0, parseInt(input.visibleCandlesCount, 10))
      : 28;

  const issues: string[] = Array.isArray(input.issues)
    ? input.issues.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((s) => s.trim())
    : [];

  return {
    isReadable,
    hasPriceAxis,
    hasTimeAxis,
    visibleCandlesCount: rawCount,
    issues,
    blocked: false,
    summary: `Captura aceita para análise (${rawCount} velas visíveis).`,
  };
}

function normalizeTrendLabel(rawTrend: unknown): 'alta' | 'baixa' | 'lateral' | 'indefinida' {
  const raw = typeof rawTrend === 'string' ? rawTrend.trim().toLowerCase() : 'indefinida';
  if (/alta|bull|up|ascendente/.test(raw)) return 'alta';
  if (/baixa|bear|down|descendente/.test(raw)) return 'baixa';
  if (/lateral|range|consolid|neutr/.test(raw)) return 'lateral';
  return 'indefinida';
}

/**
 * Resolves per-timeframe trends from AI vision output without silently inheriting
 * the execution trigger chart's trend onto omitted higher timeframes.
 */
export function resolveMultiTimeframeBreakdown(input: {
  attachedTimeframes: AllowedMultiTimeframe[];
  breakdownFromModel: Array<{ timeframe?: unknown; trend?: unknown }>;
  macroAnalysis?: { macroTimeframe?: unknown; macroTrend?: unknown } | null;
}): Array<{ timeframe: AllowedMultiTimeframe; trend: unknown }> {
  const breakdown = Array.isArray(input.breakdownFromModel) ? input.breakdownFromModel : [];
  const macroTfUpper = String(input.macroAnalysis?.macroTimeframe || '').trim().toUpperCase();

  return input.attachedTimeframes.map((tf) => {
    const matched = breakdown.find((b) => String(b?.timeframe || '').trim().toUpperCase() === tf);
    if (matched && matched.trend !== undefined && matched.trend !== null && String(matched.trend).trim() !== '') {
      return { timeframe: tf, trend: matched.trend };
    }
    if (macroTfUpper === tf && input.macroAnalysis?.macroTrend) {
      return { timeframe: tf, trend: input.macroAnalysis.macroTrend };
    }
    return { timeframe: tf, trend: 'indefinida' };
  });
}

/**
 * Filter 1: Evaluates Multi-Timeframe Macro vs Trigger alignment.
 * Strictly accepts only H1, M15, M5, M3, and M1 in multi-timeframe mode and blocks any
 * COMPRA/VENDA that runs counter to or inside lateral conflict with any higher timeframe.
 */
export function evaluateMacroAlignment(input: {
  macroAttached: boolean;
  macroTimeframe?: string;
  macroTrend?: unknown;
  timeframesAnalyzed?: Array<{ timeframe: string; trend: unknown }>;
  candidateVerdict: VoteType;
}): MultiTimeframeCheck {
  if (Array.isArray(input.timeframesAnalyzed) && input.timeframesAnalyzed.length > 0) {
    const rejectedTimeframes = input.timeframesAnalyzed
      .map((item) => String(item.timeframe || '').trim().toUpperCase())
      .filter((tf) => !isAllowedMultiTimeframe(tf));

    if (rejectedTimeframes.length > 0) {
      return {
        macroAttached: true,
        macroTimeframe: rejectedTimeframes.join(', '),
        macroTrend: 'indefinida',
        aligned: false,
        blocked: true,
        rejectedTimeframes,
        summary: `Timeframe(s) não permitido(s): ${rejectedTimeframes.join(', ')}. Na análise multi-timeframe são aceitos apenas H1, M15 e M5.`,
      };
    }

    const orderRank: Record<AllowedMultiTimeframe, number> = { H1: 3, M15: 2, M5: 1 };
    const normalizedList = input.timeframesAnalyzed
      .map((item) => ({
        timeframe: item.timeframe.trim().toUpperCase() as AllowedMultiTimeframe,
        trend: normalizeTrendLabel(item.trend),
      }))
      .sort((a, b) => orderRank[b.timeframe] - orderRank[a.timeframe]);

    const highestMacro = normalizedList[0];
    const tfChainLabel = normalizedList.map((t) => `${t.timeframe}:${t.trend}`).join(' · ');

    if (input.candidateVerdict === 'AGUARDAR') {
      const allSameDir =
        normalizedList.every((t) => t.trend === 'alta') ||
        normalizedList.every((t) => t.trend === 'baixa');
      return {
        macroAttached: normalizedList.length > 1,
        macroTimeframe: normalizedList.map((t) => t.timeframe).join(' + '),
        macroTrend: highestMacro.trend,
        aligned: allSameDir,
        blocked: false,
        timeframesAnalyzed: normalizedList,
        summary: `Multi-Timeframe (${tfChainLabel}); gatilho já se encontra em AGUARDAR.`,
      };
    }

    const expectedTrend = input.candidateVerdict === 'COMPRA' ? 'alta' : 'baixa';
    const misaligned = normalizedList.filter((t) => t.trend !== expectedTrend);
    const aligned = misaligned.length === 0;
    const blocked = !aligned;

    const summary = blocked
      ? `Bloqueio Multi-Timeframe (${tfChainLabel}): ${input.candidateVerdict} exige alinhamento em todos os timeframes enviados, mas ${misaligned.map((m) => `${m.timeframe} (${m.trend})`).join(', ')} diverge.`
      : `Confluência Multi-Timeframe 100% alinhada (${tfChainLabel}) a favor de ${input.candidateVerdict}.`;

    return {
      macroAttached: normalizedList.length > 1,
      macroTimeframe: normalizedList.map((t) => t.timeframe).join(' + '),
      macroTrend: highestMacro.trend,
      aligned,
      blocked,
      timeframesAnalyzed: normalizedList,
      summary,
    };
  }

  if (!input.macroAttached) {
    return {
      macroAttached: false,
      macroTrend: 'indefinida',
      aligned: true,
      blocked: false,
      summary: 'Análise em timeframe único (Multi-Timeframe H1 · M15 · M5 opcional não anexado).',
    };
  }

  const macroTrend = normalizeTrendLabel(input.macroTrend);
  const tfLabel = input.macroTimeframe ? ` (${input.macroTimeframe})` : '';

  if (input.candidateVerdict === 'AGUARDAR') {
    return {
      macroAttached: true,
      macroTimeframe: input.macroTimeframe,
      macroTrend,
      aligned: macroTrend === 'alta' || macroTrend === 'baixa',
      blocked: false,
      summary: `Gráfico Macro${tfLabel} em tendência ${macroTrend}; gatilho já se encontra em AGUARDAR.`,
    };
  }

  const aligned =
    (input.candidateVerdict === 'COMPRA' && macroTrend === 'alta') ||
    (input.candidateVerdict === 'VENDA' && macroTrend === 'baixa');

  const blocked = !aligned;

  const summary = blocked
    ? `Bloqueio Multi-Timeframe: Gatilho apontou ${input.candidateVerdict}, mas a estrutura Macro${tfLabel} está em "${macroTrend}". Operação vetada por falta de alinhamento de tendência maior.`
    : `Confluência Multi-Timeframe confirmada: Gatilho (${input.candidateVerdict}) 100% alinhado à tendência Macro${tfLabel} de ${macroTrend}.`;

  return {
    macroAttached: true,
    macroTimeframe: input.macroTimeframe,
    macroTrend,
    aligned,
    blocked,
    summary,
  };
}

/**
 * Filter 4: Evaluates Marcus Sterling's "Zona Espremida" rule.
 * Vetoes COMPRA pressed right below strong resistance or VENDA pressed right above strong support
 * whenever free clearance R:R is below 1:1.5.
 */
export function evaluateSqueezedZone(input: {
  candidateVerdict: VoteType;
  nearestObstructionType?: unknown;
  obstructionPrice?: string;
  freeClearanceRR?: unknown;
  isSqueezed?: unknown;
}): SqueezeZoneCheck {
  const rawType = typeof input.nearestObstructionType === 'string' ? input.nearestObstructionType.toLowerCase() : 'none';
  const nearestObstructionType: 'support' | 'resistance' | 'none' =
    /resist|topo|teto/.test(rawType)
      ? 'resistance'
      : /suport|fundo|piso/.test(rawType)
      ? 'support'
      : 'none';

  let parsedRR = 2.0;
  if (typeof input.freeClearanceRR === 'number' && Number.isFinite(input.freeClearanceRR)) {
    parsedRR = Math.max(0, Number(input.freeClearanceRR.toFixed(2)));
  } else if (typeof input.freeClearanceRR === 'string') {
    const colonMatch = input.freeClearanceRR.match(/1\s*:\s*([0-9]+(?:[.,][0-9]+)?)/);
    const numStr = colonMatch ? colonMatch[1] : input.freeClearanceRR.replace(/[^0-9.,]/g, '');
    const num = parseFloat(numStr.replace(',', '.'));
    if (Number.isFinite(num) && num > 0) {
      parsedRR = Number(num.toFixed(2));
    }
  }

  const flaggedSqueezed = input.isSqueezed === true;

  if (input.candidateVerdict === 'AGUARDAR') {
    return {
      nearestObstructionType,
      obstructionPrice: input.obstructionPrice,
      freeClearanceRR: parsedRR,
      isSqueezed: flaggedSqueezed || parsedRR < MIN_CLEARANCE_RR,
      blocked: false,
      summary: 'Proteção Zona Espremida em monitoramento (nenhum sinal direcional ativo).',
    };
  }

  const hitsImmediateResistance = input.candidateVerdict === 'COMPRA' && nearestObstructionType === 'resistance';
  const hitsImmediateSupport = input.candidateVerdict === 'VENDA' && nearestObstructionType === 'support';

  const hasInsufficientClearance = parsedRR < MIN_CLEARANCE_RR;
  const blocked =
    (hitsImmediateResistance && (flaggedSqueezed || hasInsufficientClearance)) ||
    (hitsImmediateSupport && (flaggedSqueezed || hasInsufficientClearance)) ||
    (flaggedSqueezed && hasInsufficientClearance);

  const obsLabel =
    nearestObstructionType === 'resistance'
      ? 'resistência forte logo acima'
      : nearestObstructionType === 'support'
      ? 'suporte forte logo abaixo'
      : 'barreira S/R próxima';

  const priceNote = input.obstructionPrice ? ` (${input.obstructionPrice})` : '';

  const summary = blocked
    ? `Veto do Juiz Chefe (Zona Espremida): ${input.candidateVerdict} colada em ${obsLabel}${priceNote} com espaço livre de apenas 1:${parsedRR} (mínimo exigido 1:${MIN_CLEARANCE_RR}).`
    : `Espaço livre aprovado antes da próxima S/R (R:R estimado 1:${parsedRR} ≥ 1:${MIN_CLEARANCE_RR}).`;

  return {
    nearestObstructionType,
    obstructionPrice: input.obstructionPrice,
    freeClearanceRR: parsedRR,
    isSqueezed: blocked || flaggedSqueezed,
    blocked,
    summary,
  };
}

/**
 * Filter 3: Evaluates Real Economic Calendar Blackout (±15 min around High-impact news)
 * strictly for MERCADO_ABERTO. MERCADO_OTC is completely exempt.
 */
export function evaluateEconomicNewsBlackout(input: {
  asset: string;
  marketEnvironment: MarketEnvironment;
  events: EconomicNewsEvent[];
  nowMs?: number;
  windowMinutes?: number;
  sources?: Array<{ title: string; uri: string }>;
}): EconomicCalendarCheck {
  const windowMinutes = input.windowMinutes ?? NEWS_BLACKOUT_WINDOW_MINUTES;

  if (input.marketEnvironment === 'MERCADO_OTC') {
    return {
      marketEnvironment: 'MERCADO_OTC',
      exempt: true,
      blocked: false,
      windowMinutes,
      affectedCurrencies: [],
      matchingEvents: [],
      upcomingEvents: [],
      summary: 'Mercado OTC isento do filtro de calendário econômico externo (fluxo algorítmico 24/7).',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const currencies = extractCurrenciesFromAsset(input.asset);
  const windowMs = windowMinutes * 60_000;

  const highEvents = (input.events || []).filter((ev) => ev.impact === 'High');

  const matchingEvents = highEvents
    .filter((ev) => {
      const currencyMatch =
        currencies.length === 0 ||
        currencies.includes(ev.currency.toUpperCase()) ||
        (currencies.includes('XAU') && ev.currency.toUpperCase() === 'USD');
      const deltaMs = Math.abs(ev.timestampMs - nowMs);
      return currencyMatch && deltaMs <= windowMs;
    })
    .map((ev) => ({
      ...ev,
      minutesDelta: Math.round((ev.timestampMs - nowMs) / 60_000),
    }));

  const upcomingEvents = highEvents
    .filter((ev) => {
      const currencyMatch =
        currencies.length === 0 ||
        currencies.includes(ev.currency.toUpperCase()) ||
        (currencies.includes('XAU') && ev.currency.toUpperCase() === 'USD');
      const deltaMin = (ev.timestampMs - nowMs) / 60_000;
      return currencyMatch && deltaMin >= -windowMinutes && deltaMin <= 180;
    })
    .map((ev) => ({
      ...ev,
      minutesDelta: Math.round((ev.timestampMs - nowMs) / 60_000),
    }))
    .sort((a, b) => Math.abs(a.minutesDelta) - Math.abs(b.minutesDelta))
    .slice(0, 5);

  const blocked = matchingEvents.length > 0;
  const firstMatch = matchingEvents[0];

  const summary = blocked
    ? `Bloqueio de Notícia Real (±${windowMinutes} min): Evento "${firstMatch.title}" (${firstMatch.currency} · Alto Impacto) em ${firstMatch.minutesDelta === 0 ? 'andamento agora' : firstMatch.minutesDelta > 0 ? `${firstMatch.minutesDelta} min` : `${Math.abs(firstMatch.minutesDelta)} min atrás`}.`
    : upcomingEvents.length > 0
    ? `Calendário Real verificado (${currencies.join('/') || input.asset}): nenhum evento de alto impacto nos próximos ±${windowMinutes} min (próximo: ${upcomingEvents[0].title} em ${upcomingEvents[0].minutesDelta} min).`
    : `Calendário Real verificado (${currencies.join('/') || input.asset}): janela limpa, sem notícias de alto impacto em ±${windowMinutes} min.`;

  return {
    marketEnvironment: 'MERCADO_ABERTO',
    exempt: false,
    blocked,
    windowMinutes,
    affectedCurrencies: currencies,
    matchingEvents,
    upcomingEvents,
    sources: input.sources,
    summary,
  };
}

interface UnopposedSpecialistSignal {
  direction: 'COMPRA' | 'VENDA';
  agreeingAvgConfidence: number;
}

/**
 * Detects when at least 3 of the 4 technical specialists agree in the exact same direction
 * with ZERO opposing votes and strong directional conviction, while the Chief Judge passively abstained.
 */
export function detectUnopposedSpecialistDirection(
  agents: AgentResult[]
): UnopposedSpecialistSignal | null {
  const specialists = agents.filter((a) => a.id !== 'confluence_risk');
  const judge = agents.find((a) => a.id === 'confluence_risk');
  if (!judge || judge.vote !== 'AGUARDAR') return null;

  const buySpecialists = specialists.filter((a) => a.vote === 'COMPRA');
  const sellSpecialists = specialists.filter((a) => a.vote === 'VENDA');

  let direction: 'COMPRA' | 'VENDA' | null = null;
  let agreeing: AgentResult[] = [];

  if (buySpecialists.length >= 3 && sellSpecialists.length === 0) {
    direction = 'COMPRA';
    agreeing = buySpecialists;
  } else if (sellSpecialists.length >= 3 && buySpecialists.length === 0) {
    direction = 'VENDA';
    agreeing = sellSpecialists;
  }

  if (!direction || agreeing.length < 3) return null;

  const agreeingAvgConfidence = Math.round(
    agreeing.reduce((acc, a) => acc + a.confidence, 0) / agreeing.length
  );
  const strongAgreeing = agreeing.filter((a) => a.confidence >= MIN_DIRECTIONAL_CONFIDENCE).length;
  const hasWeakOutlier = agreeing.some((a) => a.confidence < 65);

  if (agreeingAvgConfidence < MIN_DIRECTIONAL_CONFIDENCE || strongAgreeing < 2 || hasWeakOutlier) {
    return null;
  }

  return { direction, agreeingAvgConfidence };
}

/**
 * Resolves the directional candidate to audit against Multi-Timeframe and Squeeze Zone guardrails,
 * including unopposed 3/5 specialist alignments eligible for Judge confluence arbitration.
 */
export function resolveCandidateDirectionForGuardrails(agents: AgentResult[]): VoteType {
  const rawConsensus = calculateConsensus(agents);
  if (rawConsensus.verdict !== 'AGUARDAR') {
    return rawConsensus.verdict;
  }
  const unopposed = detectUnopposedSpecialistDirection(agents);
  return unopposed ? unopposed.direction : 'AGUARDAR';
}

/**
 * Applies the active institutional guardrails on top of raw agent votes.
 * Ensures Marcus Sterling (confluence_risk) arbitrates unopposed clean setups when all guardrails pass
 * and vetoes unsafe trades to AGUARDAR whenever any guardrail fails.
 */
export function applyHardTradeGuardrails(input: {
  agents: AgentResult[];
  visualQuality?: VisualQualityCheck;
  multiTimeframe: MultiTimeframeCheck;
  squeezeZone: SqueezeZoneCheck;
  economicCalendar: EconomicCalendarCheck;
}): {
  agents: AgentResult[];
  verdict: ConsensusVerdict;
  guardrails: GuardrailsReport;
} {
  const initialConsensus = calculateConsensus(input.agents);
  const unopposedCandidate =
    initialConsensus.verdict === 'AGUARDAR'
      ? detectUnopposedSpecialistDirection(input.agents)
      : null;
  const candidateDirection: VoteType =
    initialConsensus.verdict !== 'AGUARDAR'
      ? initialConsensus.verdict
      : unopposedCandidate?.direction ?? 'AGUARDAR';

  const safeVisualQuality: VisualQualityCheck = input.visualQuality
    ? { ...input.visualQuality, blocked: false }
    : evaluateVisualLegibility({});

  const vetoReasons: string[] = [];
  if (input.multiTimeframe.blocked) vetoReasons.push(input.multiTimeframe.summary);
  if (input.economicCalendar.blocked) vetoReasons.push(input.economicCalendar.summary);
  if (input.squeezeZone.blocked) vetoReasons.push(input.squeezeZone.summary);

  if (initialConsensus.verdict !== 'AGUARDAR') {
    const agreeingAgents = input.agents.filter((a) => a.vote === initialConsensus.verdict);
    const agreeingAvgConfidence =
      agreeingAgents.length > 0
        ? Math.round(agreeingAgents.reduce((acc, a) => acc + a.confidence, 0) / agreeingAgents.length)
        : 0;
    const agreeingStrongAgents = agreeingAgents.filter(
      (a) => a.confidence >= MIN_DIRECTIONAL_CONFIDENCE
    ).length;

    if (agreeingAvgConfidence < MIN_DIRECTIONAL_CONFIDENCE || agreeingStrongAgents < 3) {
      vetoReasons.push(
        `Filtro de Convicção Mínima: sinal de ${initialConsensus.verdict} com convicção direcional de ${agreeingAvgConfidence}% (mínimo institucional: ${MIN_DIRECTIONAL_CONFIDENCE}%).`
      );
    }
  }

  const allPassed = vetoReasons.length === 0;
  const canArbitrateUnopposed = allPassed && initialConsensus.verdict === 'AGUARDAR' && unopposedCandidate !== null;

  // Clone and update Marcus Sterling when guardrails veto OR when unopposed 3-specialist confluence earns Judge validation
  const updatedAgents = input.agents.map((agent) => {
    if (!allPassed && agent.id === 'confluence_risk') {
      return {
        ...agent,
        vote: 'AGUARDAR' as const,
        confidence: 95,
        rationale: `VETO DO JUIZ CHEFE: ${vetoReasons.join(' | ')}`,
        signals: [
          ...agent.signals.slice(0, 2),
          { label: 'Guardrail Ativo', value: 'Veto Protetor', sentiment: 'neutral' as const },
        ],
      };
    }

    if (canArbitrateUnopposed && unopposedCandidate && agent.id === 'confluence_risk') {
      const judgeConfidence = Math.max(82, Math.min(94, unopposedCandidate.agreeingAvgConfidence + 3));
      const sentiment: 'bullish' | 'bearish' =
        unopposedCandidate.direction === 'COMPRA' ? 'bullish' : 'bearish';
      return {
        ...agent,
        vote: unopposedCandidate.direction,
        confidence: judgeConfidence,
        rationale: `Arbitragem de Confluência (Juiz Chefe): 3 especialistas alinhados em ${unopposedCandidate.direction} (${unopposedCandidate.agreeingAvgConfidence}% de convicção) sem votos contrários e os 3 guardrails livres — consenso validado em 4/5 (80%).`,
        signals: [
          ...agent.signals.slice(0, 2),
          { label: 'Arbitragem Juiz', value: '4/5 Validado (80%)', sentiment },
        ],
      };
    }

    return agent;
  });

  let finalConsensus = calculateConsensus(updatedAgents);

  // Even if 4 other agents agreed despite Judge veto (e.g., 4/5 = 80%), hard guardrails ALWAYS override to AGUARDAR
  if (!allPassed && finalConsensus.verdict !== 'AGUARDAR') {
    finalConsensus = {
      ...finalConsensus,
      verdict: 'AGUARDAR',
      hasConsensus: false,
      confluenceScore: Math.min(54, finalConsensus.confluenceScore),
      recommendedAction: `SINAL VETADO POR PROTEÇÃO DE CAPITAL: ${vetoReasons.join(' ')}`,
      keyFactors: [...vetoReasons, ...finalConsensus.keyFactors].slice(0, 4),
    };
  } else if (!allPassed) {
    finalConsensus = {
      ...finalConsensus,
      verdict: 'AGUARDAR',
      hasConsensus: false,
      confluenceScore: Math.min(54, finalConsensus.confluenceScore),
      recommendedAction: `SINAL BLOQUEADO PELO CONSELHO: ${vetoReasons.join(' ')}`,
      keyFactors: [...vetoReasons, ...finalConsensus.keyFactors].slice(0, 4),
    };
  } else if (candidateDirection !== 'AGUARDAR' && finalConsensus.verdict !== 'AGUARDAR') {
    const extraConfirmation: string[] = [];
    if (input.multiTimeframe.macroAttached && input.multiTimeframe.aligned) {
      extraConfirmation.push(input.multiTimeframe.summary);
    }
    if (!input.squeezeZone.blocked && input.squeezeZone.freeClearanceRR >= MIN_CLEARANCE_RR) {
      extraConfirmation.push(input.squeezeZone.summary);
    }
    if (extraConfirmation.length > 0) {
      finalConsensus = {
        ...finalConsensus,
        keyFactors: [...extraConfirmation.slice(0, 1), ...finalConsensus.keyFactors].slice(0, 4),
      };
    }
  }

  return {
    agents: updatedAgents,
    verdict: finalConsensus,
    guardrails: {
      allPassed,
      vetoReasons,
      visualQuality: safeVisualQuality,
      multiTimeframe: input.multiTimeframe,
      squeezeZone: input.squeezeZone,
      economicCalendar: input.economicCalendar,
    },
  };
}
