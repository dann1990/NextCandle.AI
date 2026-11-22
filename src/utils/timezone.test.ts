import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertAnalysisForTimezone,
  convertUtcEventToTimeZone,
  formatDateTimeInTimeZone,
  formatHHMMInTimeZone,
  formatUtcOffsetLabel,
  getTimeZoneDisplayLabel,
  getTimeZoneOffsetMinutes,
  isEntryClockNearCurrentTime,
  isValidTimeZone,
  shiftClockTimesInText,
  shiftHHMM,
} from './timezone';
import { AnalysisResult } from '../types/trading';

test('isValidTimeZone validates IANA identifiers safely', () => {
  assert.equal(isValidTimeZone('America/Sao_Paulo'), true);
  assert.equal(isValidTimeZone('Europe/Lisbon'), true);
  assert.equal(isValidTimeZone('Asia/Tokyo'), true);
  assert.equal(isValidTimeZone('Invalid/Zone_123'), false);
  assert.equal(isValidTimeZone(''), false);
});

test('getTimeZoneOffsetMinutes and formatUtcOffsetLabel handle standard and half-hour zones accurately', () => {
  // Winter in Northern Hemisphere (Nov 22, 2026)
  const sampleDate = new Date(Date.UTC(2026, 10, 22, 21, 0, 0));

  const brOffset = getTimeZoneOffsetMinutes('America/Sao_Paulo', sampleDate);
  const lisbonOffset = getTimeZoneOffsetMinutes('Europe/Lisbon', sampleDate);
  const tokyoOffset = getTimeZoneOffsetMinutes('Asia/Tokyo', sampleDate);
  const indiaOffset = getTimeZoneOffsetMinutes('Asia/Kolkata', sampleDate);

  assert.equal(brOffset, -180);
  assert.equal(lisbonOffset, 0);
  assert.equal(tokyoOffset, 540);
  assert.equal(indiaOffset, 330);

  assert.equal(formatUtcOffsetLabel(brOffset), 'UTC-3');
  assert.equal(formatUtcOffsetLabel(lisbonOffset), 'UTC+0');
  assert.equal(formatUtcOffsetLabel(tokyoOffset), 'UTC+9');
  assert.equal(formatUtcOffsetLabel(indiaOffset), 'UTC+5:30');

  assert.equal(formatHHMMInTimeZone(sampleDate, 'America/Sao_Paulo'), '18:00');
  assert.equal(formatHHMMInTimeZone(sampleDate, 'Europe/Lisbon'), '21:00');
  assert.equal(formatHHMMInTimeZone(sampleDate, 'Asia/Tokyo'), '06:00');
});

test('shiftHHMM and shiftClockTimesInText shift 24h clocks cleanly without altering R:R ratios', () => {
  assert.equal(shiftHHMM('18:05', 180), '21:05');
  assert.equal(shiftHHMM('23:45', 60), '00:45');
  assert.equal(shiftHHMM('01:15', -180), '22:15');

  const input =
    'Análise às 18:02 com R:R 1:15 e R:R 1:2.5: entre na virada às 18:05 até 18:10.';
  const shifted = shiftClockTimesInText(input, 180);

  assert.match(shifted, /às 21:02/);
  assert.match(shifted, /às 21:05/);
  assert.match(shifted, /até 21:10/);
  // Must NOT corrupt Risk:Reward ratios
  assert.match(shifted, /R:R 1:15/);
  assert.match(shifted, /R:R 1:2\.5/);
});

test('isEntryClockNearCurrentTime detects broker screenshot timezone drift accurately', () => {
  // Entry in same timezone (next M5 candle)
  assert.equal(isEntryClockNearCurrentTime('Às 18:05 (Abertura próxima vela)', '18:02'), true);
  // Midnight wrap
  assert.equal(isEntryClockNearCurrentTime('Às 00:05 (Abertura)', '23:58'), true);
  // Stale / wrong timezone clock (e.g., broker printed UTC+0 21:05 when user is in UTC-3 18:02)
  assert.equal(isEntryClockNearCurrentTime('Às 21:05 (Abertura)', '18:02'), false);
  // Missing clock time
  assert.equal(isEntryClockNearCurrentTime('Abertura próxima vela', '18:02'), false);
});

test('convertUtcEventToTimeZone converts economic events into target timezone', () => {
  const eventTs = Date.UTC(2026, 10, 22, 16, 30, 0);
  const br = convertUtcEventToTimeZone('16:30 UTC', 'America/Sao_Paulo', eventTs);
  const tokyo = convertUtcEventToTimeZone('16:30 UTC', 'Asia/Tokyo', eventTs);

  assert.equal(br.timeLocal, '13:30');
  assert.equal(br.offsetLabel, 'UTC-3');
  assert.equal(tokyo.timeLocal, '01:30');
  assert.equal(tokyo.offsetLabel, 'UTC+9');
});

test('convertAnalysisForTimezone automatically converts all entry, trigger, visual annotation, and history times across countries', () => {
  const analysisTimestamp = Date.UTC(2026, 10, 22, 21, 2, 0); // 18:02 in Brasilia (UTC-3), 21:02 in Lisbon (UTC+0)
  const sampleAnalysis: AnalysisResult = {
    id: 'analysis_tz_1',
    timestamp: analysisTimestamp,
    timezone: 'America/Sao_Paulo',
    mode: 'simple',
    asset: 'EUR/USD',
    timeframe: 'M5',
    entryTimeframe: 'M5',
    marketEnvironment: 'MERCADO_ABERTO',
    verdict: {
      verdict: 'COMPRA',
      consensusRatio: 0.8,
      agreementCount: 4,
      totalAgents: 5,
      buyVotes: 4,
      sellVotes: 0,
      neutralVotes: 1,
      overallConfidence: 86,
      hasConsensus: true,
      confluenceScore: 88,
      recommendedAction: 'Executar compra na virada de M5.',
      keyFactors: ['Pullback limpo em suporte'],
    },
    insights: {
      trend: 'Alta Forte',
      trendDirection: 'alta',
      keyPattern: 'Engolfo de Alta',
      patternType: 'Reversão',
      quality: 'A+ (90%)',
      qualityGrade: 'A+',
      qualityScore: 90,
      idealExpiration: '2 velas (10 min)',
      entryTiming: 'Às 18:05 (Abertura da próxima vela M5)',
      entryTrigger: 'Virada de Vela · 18:05',
      entryTimingRationale:
        'Análise visual e temporal (18:02): entrada na compra às 18:05 até 18:10.',
      timezone: 'America/Sao_Paulo',
    },
    agents: [],
    plan: {
      asset: 'EUR/USD',
      timeframe: 'M5',
      entryZone: '1.0840',
      takeProfit1: '1.0860',
      takeProfit2: '1.0880',
      stopLoss: '1.0825',
      riskRewardRatio: '1:2.0',
      suggestedExpiration: '2 velas (10 min)',
      riskLevel: 'Baixo',
      direction: 'COMPRA',
    },
    radarMetrics: {
      priceAction: 88,
      technicals: 84,
      flowVolatility: 82,
      predictiveML: 86,
      riskManagement: 90,
    },
    candles: [],
    levels: [],
    visualAnnotations: {
      analyzedZone: { x: 400, y: 400, width: 200, height: 200, label: 'Suporte' },
      triggerPoint: {
        x: 700,
        y: 500,
        label: 'Entrada COMPRA',
        timingLabel: 'Virada de Vela · 18:05',
      },
      trendArrow: { fromX: 300, fromY: 600, toX: 700, toY: 500, label: 'Impulso' },
      keyLevels: [],
      strategyTitle: 'Engolfo em Suporte',
      technicalReason: 'Confluência 4/5',
      steps: [
        { step: 1, title: 'Zona', detail: 'Suporte testado' },
        { step: 2, title: 'Gatilho', detail: 'Entrada às 18:05 na abertura do próximo candle' },
        { step: 3, title: 'Racional', detail: 'Compra confirmada' },
      ],
    },
  };

  const inLisbon = convertAnalysisForTimezone(sampleAnalysis, 'Europe/Lisbon');
  assert.equal(inLisbon.timezone, 'Europe/Lisbon');
  assert.equal(inLisbon.insights?.entryTiming, 'Às 21:05 (Abertura da próxima vela M5)');
  assert.equal(inLisbon.insights?.entryTrigger, 'Virada de Vela · 21:05');
  assert.match(inLisbon.insights?.entryTimingRationale || '', /21:02/);
  assert.match(inLisbon.insights?.entryTimingRationale || '', /21:05/);
  assert.match(inLisbon.insights?.entryTimingRationale || '', /21:10/);
  assert.equal(inLisbon.visualAnnotations?.triggerPoint.timingLabel, 'Virada de Vela · 21:05');
  assert.match(inLisbon.visualAnnotations?.steps[1].detail || '', /21:05/);
  assert.match(inLisbon.insights?.timezoneLabel || '', /UTC\+0/);

  // Midnight crossing into Japan (+9h UTC -> +12h vs Brasilia)
  const inTokyo = convertAnalysisForTimezone(sampleAnalysis, 'Asia/Tokyo');
  assert.equal(inTokyo.insights?.entryTrigger, 'Virada de Vela · 06:05');
  assert.match(formatDateTimeInTimeZone(analysisTimestamp, 'Asia/Tokyo'), /23\/11.*06:02/);
  assert.match(getTimeZoneDisplayLabel('Europe/Lisbon', new Date(analysisTimestamp)), /UTC\+0 · Lisboa/);
});
