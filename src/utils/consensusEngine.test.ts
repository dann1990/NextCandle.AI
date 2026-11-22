import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateConsensus,
  calibrateQualityAssessment,
  normalizeAgentResults,
  normalizeVote,
  normalizeConfidence,
  extractJsonObject,
  sanitizeMarketCriteriaSummary,
  sanitizeRadarMetrics,
} from './consensusEngine.ts';
import type { AgentResult, VoteType } from '../types/trading.ts';

function makeAgents(votes: VoteType[], confidences: number[] = [85, 85, 85, 85, 85]): AgentResult[] {
  const ids = ['price_action', 'indicators', 'flow_volatility', 'predictive_ml', 'confluence_risk'] as const;
  return ids.map((id, idx) => ({
    id,
    name: `Agent ${idx + 1}`,
    role: 'Role',
    vote: votes[idx],
    confidence: confidences[idx],
    rationale: `Rationale ${idx + 1}`,
    signals: [],
  }));
}

test('calculateConsensus authorizes COMPRA when 4/5 agents (80%) agree', () => {
  const res = calculateConsensus(makeAgents(['COMPRA', 'COMPRA', 'COMPRA', 'COMPRA', 'AGUARDAR']));
  assert.equal(res.verdict, 'COMPRA');
  assert.equal(res.hasConsensus, true);
  assert.equal(res.agreementCount, 4);
  assert.equal(res.consensusRatio, 0.8);
  assert.ok(res.confluenceScore >= 75);
});

test('calculateConsensus blocks entry (AGUARDAR) when only 3/5 agents agree (60%)', () => {
  const res = calculateConsensus(makeAgents(['VENDA', 'VENDA', 'VENDA', 'COMPRA', 'AGUARDAR']));
  assert.equal(res.verdict, 'AGUARDAR');
  assert.equal(res.hasConsensus, false);
  assert.equal(res.agreementCount, 3);
  assert.equal(res.consensusRatio, 0.6);
  assert.ok(res.confluenceScore <= 64);
});

test('calculateConsensus reports 0% directional consensus and capped confluenceScore when all 5 vote AGUARDAR', () => {
  const res = calculateConsensus(
    makeAgents(['AGUARDAR', 'AGUARDAR', 'AGUARDAR', 'AGUARDAR', 'AGUARDAR'], [100, 100, 100, 100, 100])
  );
  assert.equal(res.verdict, 'AGUARDAR');
  assert.equal(res.hasConsensus, false);
  assert.equal(res.agreementCount, 0);
  assert.equal(res.consensusRatio, 0);
  assert.ok(res.confluenceScore <= 25);
});

test('normalizeAgentResults sanitizes LLM vote aliases, decimal confidences, and missing agents', () => {
  assert.equal(normalizeVote('buy'), 'COMPRA');
  assert.equal(normalizeVote('PUT'), 'VENDA');
  assert.equal(normalizeConfidence(0.88), 88);
  assert.equal(normalizeConfidence('92%'), 92);

  const normalized = normalizeAgentResults([
    { id: 'price_action', vote: 'buy', confidence: 0.91, rationale: 'Engolfo limpo' },
    { id: 'indicators', vote: 'COMPRA', confidence: '84%', rationale: 'EMA alinhada' },
    { id: 'flow_volatility', vote: 'CALL', confidence: 86, rationale: 'Fluxo forte' },
    { id: 'predictive_ml', vote: 'compra', confidence: 0.82, rationale: 'Alta probabilidade' },
  ]);

  assert.equal(normalized.length, 5);
  assert.equal(normalized[0].confidence, 91);
  assert.equal(normalized[4].id, 'confluence_risk');
  assert.equal(normalized[4].vote, 'AGUARDAR');

  const verdict = calculateConsensus(normalized);
  assert.equal(verdict.verdict, 'COMPRA');
  assert.equal(verdict.agreementCount, 4);
});

test('extractJsonObject parses markdown-fenced, wrapped, and trailing-comma JSON safely', () => {
  const fenced = 'Aqui está a análise:\n```json\n{"asset":"EUR/USD","timeframe":"M5",}\n```';
  const parsed = extractJsonObject(fenced);
  assert.equal(parsed.asset, 'EUR/USD');
  assert.equal(parsed.timeframe, 'M5');
});

test('calibrateQualityAssessment enforces strict consistency between consensus and quality score/grade', () => {
  const fourOfFive = calculateConsensus(makeAgents(['COMPRA', 'COMPRA', 'COMPRA', 'COMPRA', 'AGUARDAR'], [85, 84, 83, 82, 55]));
  const fourCal = calibrateQualityAssessment(fourOfFive, 99);
  assert.equal(fourCal.qualityGrade, 'A');
  assert.ok(fourCal.qualityScore <= 89);

  const unanimous = calculateConsensus(makeAgents(['VENDA', 'VENDA', 'VENDA', 'VENDA', 'VENDA'], [92, 90, 91, 89, 93]));
  const fiveCal = calibrateQualityAssessment(unanimous, 94);
  assert.equal(fiveCal.qualityGrade, 'A+');
  assert.equal(fiveCal.qualityScore, 94);

  const waitVerdict = calculateConsensus(makeAgents(['COMPRA', 'AGUARDAR', 'AGUARDAR', 'AGUARDAR', 'AGUARDAR'], [75, 60, 60, 60, 60]));
  const waitCal = calibrateQualityAssessment(waitVerdict, 95);
  assert.ok(waitCal.qualityGrade === 'B' || waitCal.qualityGrade === 'C');
  assert.ok(waitCal.qualityScore <= 64);
});

test('sanitizeRadarMetrics clamps out-of-range values and falls back to canonical agent confidences', () => {
  const agents = makeAgents(['COMPRA', 'COMPRA', 'COMPRA', 'COMPRA', 'AGUARDAR'], [88, 82, 79, 85, 61]);
  const radar = sanitizeRadarMetrics({ priceAction: 140, technicals: Number.NaN, flowVolatility: -10 }, agents);
  assert.equal(radar.priceAction, 100);
  assert.equal(radar.technicals, 82);
  assert.equal(radar.flowVolatility, 5);
  assert.equal(radar.predictiveML, 85);
  assert.equal(radar.riskManagement, 61);
});

test('sanitizeMarketCriteriaSummary prevents cross-market wording leakage between OTC and Open Market', () => {
  const otcLeaked = sanitizeMarketCriteriaSummary(
    'Agentes avaliaram sessão de Londres e notícias econômicas de alto impacto.',
    'MERCADO_OTC'
  );
  assert.match(otcLeaked, /Mercado OTC/i);
  assert.match(otcLeaked, /desconsiderando calendário/i);

  const openLeaked = sanitizeMarketCriteriaSummary(
    'Foco em algoritmo sintético OTC de 24 horas.',
    'MERCADO_ABERTO'
  );
  assert.match(openLeaked, /Mercado Aberto/i);
  assert.doesNotMatch(openLeaked, /\bOTC\b/i);
});

