import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHardTradeGuardrails,
  evaluateEconomicNewsBlackout,
  evaluateMacroAlignment,
  evaluateSqueezedZone,
  evaluateVisualLegibility,
  extractCurrenciesFromAsset,
  isAllowedEntryTimeframe,
  resolveCandidateDirectionForGuardrails,
  resolveMultiTimeframeBreakdown,
} from './riskGuardrails.js';
import { AgentResult } from '../types/trading.js';

function makeBullishAgents(): AgentResult[] {
  return [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'COMPRA', confidence: 88, rationale: 'Engolfo', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'COMPRA', confidence: 84, rationale: 'EMA', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'COMPRA', confidence: 82, rationale: 'Delta', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'COMPRA', confidence: 85, rationale: 'Prob', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'COMPRA', confidence: 89, rationale: 'OK', signals: [] },
  ];
}

test('extractCurrenciesFromAsset parses OTC, Forex, Gold and US indices', () => {
  assert.deepEqual(extractCurrenciesFromAsset('EUR/USD (OTC)'), ['EUR', 'USD']);
  assert.deepEqual(extractCurrenciesFromAsset('XAU/USD'), ['XAU', 'USD']);
  assert.deepEqual(extractCurrenciesFromAsset('NAS100'), ['USD']);
});

test('evaluateVisualLegibility never blocks captures even with fewer than 20 candles, missing axes or glare', () => {
  const tooFew = evaluateVisualLegibility({ isReadable: true, hasPriceAxis: true, hasTimeAxis: true, visibleCandlesCount: 14 });
  assert.equal(tooFew.blocked, false);

  const noAxis = evaluateVisualLegibility({ isReadable: false, hasPriceAxis: false, hasTimeAxis: false, visibleCandlesCount: 8 });
  assert.equal(noAxis.blocked, false);

  const allowedResult = applyHardTradeGuardrails({
    agents: makeBullishAgents(),
    visualQuality: noAxis,
    multiTimeframe: evaluateMacroAlignment({ macroAttached: false, candidateVerdict: 'COMPRA' }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'COMPRA', nearestObstructionType: 'resistance', freeClearanceRR: 2.2, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });
  assert.equal(allowedResult.guardrails.allPassed, true);
  assert.equal(allowedResult.verdict.verdict, 'COMPRA');
});

test('evaluateMacroAlignment blocks trigger entry when counter-trend or lateral against macro chart', () => {
  const counterTrend = evaluateMacroAlignment({
    macroAttached: true,
    macroTimeframe: 'M15',
    macroTrend: 'baixa',
    candidateVerdict: 'COMPRA',
  });
  assert.equal(counterTrend.blocked, true);
  assert.equal(counterTrend.aligned, false);

  const aligned = evaluateMacroAlignment({
    macroAttached: true,
    macroTimeframe: 'H1',
    macroTrend: 'alta',
    candidateVerdict: 'COMPRA',
  });
  assert.equal(aligned.blocked, false);
  assert.equal(aligned.aligned, true);
});

test('evaluateMacroAlignment enforces H1/M15/M5 only and checks full multi-timeframe chain', () => {
  const rejected = evaluateMacroAlignment({
    macroAttached: true,
    timeframesAnalyzed: [
      { timeframe: 'H1', trend: 'alta' },
      { timeframe: 'M3', trend: 'alta' },
      { timeframe: 'M1', trend: 'alta' },
    ],
    candidateVerdict: 'COMPRA',
  });
  assert.equal(rejected.blocked, true);
  assert.deepEqual(rejected.rejectedTimeframes, ['M3', 'M1']);

  const alignedChain = evaluateMacroAlignment({
    macroAttached: true,
    timeframesAnalyzed: [
      { timeframe: 'H1', trend: 'alta' },
      { timeframe: 'M15', trend: 'alta' },
      { timeframe: 'M5', trend: 'alta' },
    ],
    candidateVerdict: 'COMPRA',
  });
  assert.equal(alignedChain.blocked, false);
  assert.equal(alignedChain.aligned, true);

  const divergentChain = evaluateMacroAlignment({
    macroAttached: true,
    timeframesAnalyzed: [
      { timeframe: 'H1', trend: 'alta' },
      { timeframe: 'M15', trend: 'lateral' },
      { timeframe: 'M5', trend: 'alta' },
    ],
    candidateVerdict: 'COMPRA',
  });
  assert.equal(divergentChain.blocked, true);
  assert.equal(divergentChain.aligned, false);
});

test('isAllowedEntryTimeframe strictly validates M1 or M5 entry execution timeframes', () => {
  assert.equal(isAllowedEntryTimeframe('M1'), true);
  assert.equal(isAllowedEntryTimeframe('m5'), true);
  assert.equal(isAllowedEntryTimeframe('M3'), false);
  assert.equal(isAllowedEntryTimeframe('M15'), false);
});

test('evaluateSqueezedZone vetoes COMPRA pressed against resistance with R:R < 1.5', () => {
  const squeezed = evaluateSqueezedZone({
    candidateVerdict: 'COMPRA',
    nearestObstructionType: 'resistance',
    obstructionPrice: '1.0892',
    freeClearanceRR: 0.9,
    isSqueezed: true,
  });
  assert.equal(squeezed.blocked, true);

  const openRoom = evaluateSqueezedZone({
    candidateVerdict: 'COMPRA',
    nearestObstructionType: 'resistance',
    obstructionPrice: '1.0940',
    freeClearanceRR: 2.1,
    isSqueezed: false,
  });
  assert.equal(openRoom.blocked, false);
});

test('evaluateEconomicNewsBlackout blocks Open Market within ±15 min of High-impact event, but exempts OTC', () => {
  const nowMs = Date.UTC(2026, 4, 15, 12, 30, 0);
  const events = [
    {
      title: 'US CPI m/m',
      currency: 'USD',
      impact: 'High' as const,
      timeUtc: '12:38 UTC',
      timestampMs: nowMs + 8 * 60_000,
      minutesDelta: 8,
      source: 'ForexFactory',
    },
  ];

  const openMarketCheck = evaluateEconomicNewsBlackout({
    asset: 'EUR/USD',
    marketEnvironment: 'MERCADO_ABERTO',
    events,
    nowMs,
  });
  assert.equal(openMarketCheck.blocked, true);
  assert.equal(openMarketCheck.exempt, false);

  const otcCheck = evaluateEconomicNewsBlackout({
    asset: 'EUR/USD (OTC)',
    marketEnvironment: 'MERCADO_OTC',
    events,
    nowMs,
  });
  assert.equal(otcCheck.blocked, false);
  assert.equal(otcCheck.exempt, true);
});

test('applyHardTradeGuardrails overrides 5/5 bullish votes to AGUARDAR when squeezed against resistance', () => {
  const result = applyHardTradeGuardrails({
    agents: makeBullishAgents(),
    visualQuality: evaluateVisualLegibility({ isReadable: true, hasPriceAxis: true, hasTimeAxis: true, visibleCandlesCount: 35 }),
    multiTimeframe: evaluateMacroAlignment({ macroAttached: true, macroTimeframe: 'M15', macroTrend: 'alta', candidateVerdict: 'COMPRA' }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'COMPRA', nearestObstructionType: 'resistance', freeClearanceRR: 1.1, isSqueezed: true }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });

  assert.equal(result.guardrails.allPassed, false);
  assert.equal(result.verdict.verdict, 'AGUARDAR');
  assert.equal(result.verdict.hasConsensus, false);
  const judge = result.agents.find((a) => a.id === 'confluence_risk');
  assert.equal(judge?.vote, 'AGUARDAR');
});

test('resolveMultiTimeframeBreakdown marks omitted higher timeframes as indefinida and prevents false alignment', () => {
  const resolved = resolveMultiTimeframeBreakdown({
    attachedTimeframes: ['H1', 'M5'],
    breakdownFromModel: [{ timeframe: 'M5', trend: 'alta' }],
    macroAnalysis: { macroTimeframe: 'M15', macroTrend: 'alta' },
  });

  assert.equal(resolved[0].timeframe, 'H1');
  assert.equal(resolved[0].trend, 'indefinida');

  const check = evaluateMacroAlignment({
    macroAttached: true,
    timeframesAnalyzed: resolved,
    candidateVerdict: 'COMPRA',
  });
  assert.equal(check.blocked, true);
  assert.equal(check.aligned, false);
});

test('applyHardTradeGuardrails blocks directional consensus with average confidence below 70%', () => {
  const weakBullishAgents: AgentResult[] = [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'COMPRA', confidence: 64, rationale: 'Fraco', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'COMPRA', confidence: 62, rationale: 'Fraco', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'COMPRA', confidence: 66, rationale: 'Fraco', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'COMPRA', confidence: 65, rationale: 'Fraco', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'AGUARDAR', confidence: 68, rationale: 'Baixa convicção', signals: [] },
  ];

  const result = applyHardTradeGuardrails({
    agents: weakBullishAgents,
    visualQuality: evaluateVisualLegibility({ isReadable: true, hasPriceAxis: true, hasTimeAxis: true, visibleCandlesCount: 30 }),
    multiTimeframe: evaluateMacroAlignment({ macroAttached: false, candidateVerdict: 'COMPRA' }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'COMPRA', nearestObstructionType: 'resistance', freeClearanceRR: 2.2, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });

  assert.equal(result.guardrails.allPassed, false);
  assert.equal(result.verdict.verdict, 'AGUARDAR');
  assert.match(result.guardrails.vetoReasons.join(' '), /Convicção Mínima/i);
});

test('applyHardTradeGuardrails arbitrates unopposed 3-specialist alignment when all 3 guardrails pass', () => {
  const unopposedThreeBullish: AgentResult[] = [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'COMPRA', confidence: 84, rationale: 'Engolfo', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'AGUARDAR', confidence: 55, rationale: 'OTC neutro', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'COMPRA', confidence: 80, rationale: 'Força compradora', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'COMPRA', confidence: 78, rationale: 'Probabilidade 78%', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'AGUARDAR', confidence: 68, rationale: 'Aguardando conselho', signals: [] },
  ];

  const candidate = resolveCandidateDirectionForGuardrails(unopposedThreeBullish);
  assert.equal(candidate, 'COMPRA');

  const result = applyHardTradeGuardrails({
    agents: unopposedThreeBullish,
    visualQuality: evaluateVisualLegibility({ visibleCandlesCount: 30 }),
    multiTimeframe: evaluateMacroAlignment({ macroAttached: true, macroTimeframe: 'M15', macroTrend: 'alta', candidateVerdict: candidate }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: candidate, nearestObstructionType: 'resistance', freeClearanceRR: 2.1, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD (OTC)', marketEnvironment: 'MERCADO_OTC', events: [] }),
  });

  assert.equal(result.guardrails.allPassed, true);
  assert.equal(result.verdict.verdict, 'COMPRA');
  assert.equal(result.verdict.hasConsensus, true);
  assert.equal(result.verdict.agreementCount, 4);
  const judge = result.agents.find((a) => a.id === 'confluence_risk');
  assert.equal(judge?.vote, 'COMPRA');
});

test('applyHardTradeGuardrails does NOT unlock when an opposing directional vote exists (3 COMPRA vs 1 VENDA)', () => {
  const conflictedAgents: AgentResult[] = [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'COMPRA', confidence: 84, rationale: 'Engolfo', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'VENDA', confidence: 78, rationale: 'Sobrecompra', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'COMPRA', confidence: 80, rationale: 'Fluxo', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'COMPRA', confidence: 76, rationale: 'ML', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'AGUARDAR', confidence: 70, rationale: 'Conflito', signals: [] },
  ];

  assert.equal(resolveCandidateDirectionForGuardrails(conflictedAgents), 'AGUARDAR');

  const result = applyHardTradeGuardrails({
    agents: conflictedAgents,
    multiTimeframe: evaluateMacroAlignment({ macroAttached: false, candidateVerdict: 'AGUARDAR' }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'AGUARDAR', freeClearanceRR: 2.2, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });

  assert.equal(result.verdict.verdict, 'AGUARDAR');
  assert.equal(result.verdict.hasConsensus, false);
});

test('applyHardTradeGuardrails keeps unopposed 3-specialist signal blocked when squeezed or counter-macro', () => {
  const unopposedThreeSell: AgentResult[] = [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'VENDA', confidence: 86, rationale: 'Estrela', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'AGUARDAR', confidence: 55, rationale: 'Neutro', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'VENDA', confidence: 82, rationale: 'Pressão', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'VENDA', confidence: 81, rationale: 'ML Venda', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'AGUARDAR', confidence: 70, rationale: 'Aguardando', signals: [] },
  ];

  const candidate = resolveCandidateDirectionForGuardrails(unopposedThreeSell);
  assert.equal(candidate, 'VENDA');

  const result = applyHardTradeGuardrails({
    agents: unopposedThreeSell,
    multiTimeframe: evaluateMacroAlignment({ macroAttached: true, macroTimeframe: 'H1', macroTrend: 'alta', candidateVerdict: candidate }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: candidate, nearestObstructionType: 'support', freeClearanceRR: 2.0, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });

  assert.equal(result.guardrails.allPassed, false);
  assert.equal(result.verdict.verdict, 'AGUARDAR');
});

test('applyHardTradeGuardrails ignores low confidence on a single AGUARDAR agent when 4 directional agents average >= 70%', () => {
  const fourStrongPlusWeakNeutral: AgentResult[] = [
    { id: 'price_action', name: 'Sofia', role: 'PA', vote: 'COMPRA', confidence: 76, rationale: 'Alta', signals: [] },
    { id: 'indicators', name: 'Lucas', role: 'Ind', vote: 'AGUARDAR', confidence: 45, rationale: 'Neutro', signals: [] },
    { id: 'flow_volatility', name: 'Elena', role: 'Flow', vote: 'COMPRA', confidence: 75, rationale: 'Fluxo', signals: [] },
    { id: 'predictive_ml', name: 'Gabriel', role: 'ML', vote: 'COMPRA', confidence: 74, rationale: 'ML', signals: [] },
    { id: 'confluence_risk', name: 'Marcus', role: 'Judge', vote: 'COMPRA', confidence: 72, rationale: 'OK', signals: [] },
  ];

  const result = applyHardTradeGuardrails({
    agents: fourStrongPlusWeakNeutral,
    multiTimeframe: evaluateMacroAlignment({ macroAttached: false, candidateVerdict: 'COMPRA' }),
    squeezeZone: evaluateSqueezedZone({ candidateVerdict: 'COMPRA', nearestObstructionType: 'resistance', freeClearanceRR: 2.1, isSqueezed: false }),
    economicCalendar: evaluateEconomicNewsBlackout({ asset: 'EUR/USD', marketEnvironment: 'MERCADO_ABERTO', events: [] }),
  });

  assert.equal(result.guardrails.allPassed, true);
  assert.equal(result.verdict.verdict, 'COMPRA');
});

