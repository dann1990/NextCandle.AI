import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeframeToMinutes,
  formatExpirationDuration,
  computeCandleBoundaries,
  computeDynamicTimingInsights,
  evaluateMarketSession,
  detectMarketEnvironment,
  getSecondsToNextCandle,
  isExpirationCoherentWithTimeframe,
  normalizeExplicitMarketEnvironment,
  resolveForcedMarketEnvironment,
} from './timingEngine';

test('parseTimeframeToMinutes converts common chart timeframes accurately', () => {
  assert.equal(parseTimeframeToMinutes('M1'), 1);
  assert.equal(parseTimeframeToMinutes('M5'), 5);
  assert.equal(parseTimeframeToMinutes('M15'), 15);
  assert.equal(parseTimeframeToMinutes('H1'), 60);
  assert.equal(parseTimeframeToMinutes('4H'), 240);
  assert.equal(parseTimeframeToMinutes('D1'), 1440);
});

test('computeCandleBoundaries aligns to next candle boundaries on M5 and M15', () => {
  const m5 = computeCandleBoundaries('13:57', 5);
  assert.equal(m5.currentHHMM, '13:57');
  assert.equal(m5.nextBoundary, '14:00');
  assert.equal(m5.followingBoundary, '14:05');
  assert.equal(m5.minutesToNext, 3);

  const m15 = computeCandleBoundaries('23:50', 15);
  assert.equal(m15.nextBoundary, '00:00');
  assert.equal(m15.followingBoundary, '00:15');
});

test('computeDynamicTimingInsights adapts idealExpiration individually by volatility, timeframe, and pattern', () => {
  const highVolReversalM5 = computeDynamicTimingInsights({
    asset: 'XAU/USD',
    timeframe: 'M5',
    verdict: 'VENDA',
    keyPattern: 'Estrela Cadente com Rejeição de Pavio',
    volatilityScore: 92,
    confidenceScore: 89,
    clientTime: '10:12',
    utcHour: 14,
  });

  const lowVolPullbackM5 = computeDynamicTimingInsights({
    asset: 'EUR/USD',
    timeframe: 'M5',
    verdict: 'COMPRA',
    keyPattern: 'Pullback na LTB e Canal de Alta',
    volatilityScore: 55,
    confidenceScore: 82,
    clientTime: '10:12',
    utcHour: 14,
  });

  assert.notEqual(highVolReversalM5.idealExpiration, lowVolPullbackM5.idealExpiration);
  assert.match(highVolReversalM5.idealExpiration, /1 vela \(5 min\)|2 velas \(10 min\)/);
  assert.match(lowVolPullbackM5.idealExpiration, /5 velas \(25 min\)/);
  assert.match(highVolReversalM5.entryTiming, /10:15/);
  assert.match(lowVolPullbackM5.entryTiming, /10:15/);
  assert.match(highVolReversalM5.sessionLiquidity, /Londres \/ NY/);
});

test('computeDynamicTimingInsights blocks entry trigger when verdict is AGUARDAR', () => {
  const waitResult = computeDynamicTimingInsights({
    asset: 'ETH/USDT',
    timeframe: 'H1',
    verdict: 'AGUARDAR',
    keyPattern: 'Doji em Lateralização',
    volatilityScore: 50,
    confidenceScore: 60,
    clientTime: '14:20',
  });

  assert.match(waitResult.idealExpiration, /Aguardar rompimento/);
  assert.match(waitResult.entryTrigger, /Bloqueado/);
  assert.match(waitResult.entryTiming, /15:00/);
  assert.match(waitResult.sessionLiquidity, /Cripto 24\/7/);
  assert.equal(formatExpirationDuration(2, 60), '2 velas (2h)');
});

test('evaluateMarketSession classifies FX liquidity windows accurately', () => {
  assert.match(evaluateMarketSession(13, 'EUR/USD').sessionLiquidity, /Alta · Sobreposição Londres \/ NY/);
  assert.match(evaluateMarketSession(9, 'GBP/USD').sessionLiquidity, /Alta · Sessão de Londres/);
  assert.match(evaluateMarketSession(2, 'EUR/USD').sessionLiquidity, /Baixa · Sessão Asiática/);
});

test('detectMarketEnvironment and evaluateMarketSession adapt automatically for OTC vs Open Market', () => {
  assert.equal(detectMarketEnvironment('EUR/USD (OTC)'), 'MERCADO_OTC');
  assert.equal(detectMarketEnvironment('USD/BRL-OTC'), 'MERCADO_OTC');
  assert.equal(detectMarketEnvironment('EUR/USD'), 'MERCADO_ABERTO');
  assert.equal(detectMarketEnvironment('XAU/USD'), 'MERCADO_ABERTO');

  const otcSession = evaluateMarketSession(2, 'GBP/JPY (OTC)');
  assert.match(otcSession.sessionLiquidity, /Mercado OTC · Fluxo Algorítmico 24\/7/);
  assert.match(otcSession.sessionAdvisory, /Price Action puro/i);

  const otcTiming = computeDynamicTimingInsights({
    asset: 'USD/JPY (OTC)',
    timeframe: 'M1',
    verdict: 'COMPRA',
    keyPattern: 'Repetição Algorítmica em Suporte',
    volatilityScore: 76,
    confidenceScore: 88,
    clientTime: '22:14',
    utcHour: 1,
  });
  assert.match(otcTiming.sessionLiquidity, /Mercado OTC/);
  assert.match(otcTiming.expirationRationale, /Mercado OTC/);
});

test('getSecondsToNextCandle computes remaining time accurately for M5 boundary', () => {
  const sampleDate = new Date(2026, 0, 1, 14, 12, 15); // 14:12:15 -> next M5 at 14:15:00 = 2m45s = 165s
  const countdown = getSecondsToNextCandle('M5', sampleDate);
  assert.equal(countdown.secondsLeft, 165);
  assert.equal(countdown.formattedCountdown, '02:45');
  assert.equal(countdown.nextCandleHHMM, '14:15');
});

test('isExpirationCoherentWithTimeframe validates M1 vs M5 candle-to-minute durations accurately', () => {
  assert.equal(isExpirationCoherentWithTimeframe('2 velas (2 min)', 'M1'), true);
  assert.equal(isExpirationCoherentWithTimeframe('2 velas (10 min)', 'M1'), false);
  assert.equal(isExpirationCoherentWithTimeframe('3 velas (15 min)', 'M5'), true);
  assert.equal(isExpirationCoherentWithTimeframe('3 velas (3 min)', 'M5'), false);
});

test('resolveForcedMarketEnvironment enforces selected market toggle over ticker hints', () => {
  assert.equal(normalizeExplicitMarketEnvironment('MERCADO_OTC'), 'MERCADO_OTC');
  assert.equal(normalizeExplicitMarketEnvironment('MERCADO_ABERTO'), 'MERCADO_ABERTO');
  assert.equal(normalizeExplicitMarketEnvironment(''), undefined);

  // Explicit MERCADO_ABERTO overrides "(OTC)" ticker hint when trader enforces Open Market
  assert.equal(resolveForcedMarketEnvironment('MERCADO_ABERTO', 'EUR/USD (OTC)'), 'MERCADO_ABERTO');
  // Explicit MERCADO_OTC overrides regular FX ticker when trader enforces OTC focus
  assert.equal(resolveForcedMarketEnvironment('MERCADO_OTC', 'EUR/USD'), 'MERCADO_OTC');
  // Omitted falls back to automatic detection
  assert.equal(resolveForcedMarketEnvironment(undefined, 'GBP/JPY (OTC)'), 'MERCADO_OTC');
  assert.equal(resolveForcedMarketEnvironment(undefined, 'EUR/USD'), 'MERCADO_ABERTO');
});

test('getSecondsToNextCandle and computeDynamicTimingInsights adapt accurately to explicit timezones', () => {
  // 21:02:15 UTC -> 18:02:15 in America/Sao_Paulo (UTC-3), 21:02:15 in Europe/Lisbon (UTC+0), 02:32:15 in Asia/Kolkata (UTC+5:30)
  const sampleUtc = new Date(Date.UTC(2026, 10, 22, 21, 2, 15));

  const brCountdown = getSecondsToNextCandle('M5', sampleUtc, 'America/Sao_Paulo');
  assert.equal(brCountdown.nextCandleHHMM, '18:05');
  assert.equal(brCountdown.formattedCountdown, '02:45');

  const lisbonCountdown = getSecondsToNextCandle('M5', sampleUtc, 'Europe/Lisbon');
  assert.equal(lisbonCountdown.nextCandleHHMM, '21:05');
  assert.equal(lisbonCountdown.formattedCountdown, '02:45');

  const indiaCountdown = getSecondsToNextCandle('M5', sampleUtc, 'Asia/Kolkata');
  assert.equal(indiaCountdown.nextCandleHHMM, '02:35');
  assert.equal(indiaCountdown.formattedCountdown, '02:45');

  const timing = computeDynamicTimingInsights({
    asset: 'EUR/USD',
    timeframe: 'M5',
    verdict: 'COMPRA',
    keyPattern: 'Engolfo de Alta em Suporte',
    volatilityScore: 76,
    confidenceScore: 88,
    utcHour: 18,
    timezone: 'Europe/Lisbon',
    nowMs: sampleUtc.getTime(),
  });
  assert.match(timing.entryTiming, /21:05/);
  assert.match(timing.entryTrigger, /21:05/);
  assert.equal(timing.timezone, 'Europe/Lisbon');
  assert.match(timing.sessionAdvisory, /UTC\+0/);
});
