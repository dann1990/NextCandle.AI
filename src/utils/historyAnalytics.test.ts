import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAssetTimeframeRanking,
  computeDailyBankrollProtection,
  sanitizeBankrollSettings,
  sanitizeStoredHistory,
} from './historyAnalytics.js';
import { AnalysisResult } from '../types/trading.js';

function makeRecord(overrides: Partial<AnalysisResult> & { id: string }): AnalysisResult {
  return {
    timestamp: Date.now(),
    mode: 'simple',
    asset: 'EUR/USD',
    timeframe: 'M5',
    verdict: {
      verdict: 'COMPRA',
      consensusRatio: 0.8,
      agreementCount: 4,
      totalAgents: 5,
      buyVotes: 4,
      sellVotes: 0,
      neutralVotes: 1,
      overallConfidence: 85,
      hasConsensus: true,
      confluenceScore: 86,
      recommendedAction: 'OK',
      keyFactors: [],
    },
    agents: [],
    plan: {
      asset: 'EUR/USD',
      timeframe: 'M5',
      entryZone: '1.0850',
      takeProfit1: '1.0870',
      takeProfit2: '1.0890',
      stopLoss: '1.0840',
      riskRewardRatio: '1:2.0',
      suggestedExpiration: '3 velas',
      riskLevel: 'Baixo',
      direction: 'COMPRA',
    },
    radarMetrics: { priceAction: 80, technicals: 80, flowVolatility: 80, predictiveML: 80, riskManagement: 85 },
    candles: [],
    levels: [],
    outcome: 'win',
    ...overrides,
  };
}

test('computeAssetTimeframeRanking groups by asset + timeframe and sorts by winRate', () => {
  const records: AnalysisResult[] = [
    makeRecord({ id: '1', asset: 'EUR/USD (OTC)', timeframe: 'M1', outcome: 'win' }),
    makeRecord({ id: '2', asset: 'EUR/USD (OTC)', timeframe: 'M1', outcome: 'win' }),
    makeRecord({ id: '3', asset: 'GBP/JPY', timeframe: 'M5', outcome: 'loss' }),
    makeRecord({ id: '4', asset: 'GBP/JPY', timeframe: 'M5', outcome: 'win' }),
    makeRecord({ id: '5', asset: 'AUD/CAD', timeframe: 'M5', outcome: 'pending' }),
  ];

  const ranking = computeAssetTimeframeRanking(records);
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].asset, 'EUR/USD (OTC)');
  assert.equal(ranking[0].winRate, 100);
  assert.equal(ranking[1].asset, 'GBP/JPY');
  assert.equal(ranking[1].winRate, 50);
});

test('computeDailyBankrollProtection triggers warning on 2 consecutive losses and stop_daily on 3 losses', () => {
  const now = new Date(2026, 4, 15, 14, 0, 0);
  const t1 = now.getTime() - 30 * 60_000;
  const t2 = now.getTime() - 20 * 60_000;
  const t3 = now.getTime() - 10 * 60_000;

  const twoLosses = [
    makeRecord({ id: 'a', timestamp: t1, outcome: 'loss' }),
    makeRecord({ id: 'b', timestamp: t2, outcome: 'loss' }),
  ];

  const warn = computeDailyBankrollProtection(twoLosses, 2000, 1.5, now);
  assert.equal(warn.protectionLevel, 'warning');
  assert.equal(warn.suggestedStake, 30);
  assert.equal(warn.conservativeStake, 20);
  assert.equal(warn.maxStake, 40);

  const threeLosses = [
    ...twoLosses,
    makeRecord({ id: 'c', timestamp: t3, outcome: 'loss' }),
  ];
  const stop = computeDailyBankrollProtection(threeLosses, 2000, 1.5, now);
  assert.equal(stop.protectionLevel, 'stop_daily');
  assert.equal(stop.todayConsecutiveLosses, 3);
});

test('computeDailyBankrollProtection safely ignores invalid timestamps and clamps invalid bankroll inputs', () => {
  const now = new Date(2026, 4, 15, 14, 0, 0);
  const records = [
    makeRecord({ id: 'bad-ts', timestamp: Number.NaN, outcome: 'loss' }),
    makeRecord({ id: 'valid-win', timestamp: now.getTime() - 5_000, outcome: 'win' }),
  ];

  const result = computeDailyBankrollProtection(records, -50, 99, now);
  assert.equal(result.todayLosses, 0);
  assert.equal(result.todayWins, 1);
  assert.equal(result.conservativeStake, 10); // fallback bankroll 1000 -> 1%
  assert.equal(result.suggestedStake, 20); // riskPercent clamped to max 2%
  assert.equal(result.protectionLevel, 'normal');
});

test('sanitizePerformanceFeedback clamps out-of-range percentages and truncates oversized payloads', async () => {
  const { sanitizePerformanceFeedback } = await import('../../server/aiCalibrationService.js');

  const sanitized = sanitizePerformanceFeedback({
    totalDecided: 999999,
    overallWinRate: 145.6,
    openWinRate: -12,
    otcWinRate: Number.NaN,
    strongestAssets: [
      'EUR/USD M5 (90%)\nINJECT',
      'GBP/USD M1 (85%)',
      'AUD/CAD M5 (80%)',
      'SHOULD BE DROPPED',
    ],
    weakestAssets: [123, '', '   ', 'USD/JPY M1 (30%)'],
  });

  assert.ok(sanitized);
  assert.equal(sanitized.totalDecided, 10000);
  assert.equal(sanitized.overallWinRate, 100);
  assert.equal(sanitized.openWinRate, 0);
  assert.equal(sanitized.otcWinRate, null);
  assert.equal(sanitized.strongestAssets?.length, 3);
  assert.equal(sanitized.strongestAssets?.[0], 'EUR/USD M5 (90%) INJECT');
  assert.deepEqual(sanitized.weakestAssets, ['USD/JPY M1 (30%)']);
});

test('sanitizeStoredHistory drops corrupt records and safely recovers legacy partial items', () => {
  const valid = makeRecord({ id: 'ok-1' });
  const legacyNoRadar = { ...makeRecord({ id: 'legacy-2', outcome: 'invalid' as any }), radarMetrics: undefined };
  const result = sanitizeStoredHistory([
    null,
    'bad',
    { id: '', verdict: { verdict: 'COMPRA' } },
    { id: 'bad-verdict', verdict: { verdict: 'INVALID' } },
    valid,
    legacyNoRadar,
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'ok-1');
  assert.equal(result[1].id, 'legacy-2');
  assert.equal(result[1].outcome, 'pending');
  assert.equal(result[1].radarMetrics.priceAction, 75);
});

test('sanitizeBankrollSettings rejects invalid inputs and normalizes valid amounts', () => {
  assert.equal(sanitizeBankrollSettings(null), null);
  assert.equal(sanitizeBankrollSettings({ bankrollAmount: 5, riskPercent: 1 }), null);
  assert.deepEqual(sanitizeBankrollSettings({ bankrollAmount: 1500.456, riskPercent: 9 }), {
    bankrollAmount: 1500.46,
    riskPercent: 1.5,
  });
});

test('buildDynamicCalibrationPromptSection filters directives strictly to explicit market focus', async () => {
  const { buildDynamicCalibrationPromptSection, getCurrentCalibrationProfile } = await import(
    '../../server/aiCalibrationService.js'
  );
  const profile = getCurrentCalibrationProfile();

  const otcPrompt = buildDynamicCalibrationPromptSection(profile, 'MERCADO_OTC');
  assert.match(otcPrompt, /EXCLUSIVO MERCADO OTC/);
  assert.doesNotMatch(otcPrompt, /Indicadores Prioritários Mercado Aberto:/);

  const openPrompt = buildDynamicCalibrationPromptSection(profile, 'MERCADO_ABERTO');
  assert.match(openPrompt, /EXCLUSIVO MERCADO ABERTO/);
  assert.doesNotMatch(openPrompt, /Indicadores Prioritários Mercado OTC:/);
});


