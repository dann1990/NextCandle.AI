import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAnnotationLayout,
  resolveVisualAnnotations,
  sanitizeVisualAnnotations,
} from './visualAnnotationBuilder.js';
import { AnalysisResult } from '../types/trading.js';

function assertInsideCanvas(
  rect: { x: number; y: number; width: number; height: number },
  w: number,
  h: number,
  label: string
) {
  assert.ok(rect.x >= 10, `${label}.x (${rect.x}) must be >= 10`);
  assert.ok(rect.y >= 10, `${label}.y (${rect.y}) must be >= 10`);
  assert.ok(rect.x + rect.width <= w - 10, `${label} right edge overflows ${w}`);
  assert.ok(rect.y + rect.height <= h - 10, `${label} bottom edge overflows ${h}`);
}

test('sanitizeVisualAnnotations clamps out-of-range coordinates and fills missing steps', () => {
  const sanitized = sanitizeVisualAnnotations(
    {
      analyzedZone: { x: -120, y: 980, width: 900, height: 800, label: '  Suporte Forte\nM5  ' },
      triggerPoint: { x: 1250, y: -40, label: 'COMPRA Confirmada', timingLabel: 'Virada 14:15' },
      trendArrow: { fromX: -10, fromY: 1200, toX: 1100, toY: 20, label: 'Pullback' },
      keyLevels: [{ y: 1200, type: 'resistance', label: 'Topo Anterior' }],
      strategyTitle: 'Engolfo de Alta + S/R',
      technicalReason: 'Rejeição limpa em fundo duplo com 4/5 votos.',
    },
    {
      verdict: 'COMPRA',
      timeframe: 'M5',
      keyPattern: 'Engolfo de Alta',
      entryTrigger: 'Virada M5',
      entryTiming: 'Abertura próxima vela',
      trend: 'Alta Forte',
      recommendedAction: 'COMPRA autorizada',
    }
  );

  assert.ok(sanitized.analyzedZone.x >= 30 && sanitized.analyzedZone.x + sanitized.analyzedZone.width <= 960);
  assert.ok(sanitized.analyzedZone.y >= 40 && sanitized.analyzedZone.y + sanitized.analyzedZone.height <= 940);
  assert.equal(sanitized.analyzedZone.label, 'Suporte Forte M5');
  assert.ok(sanitized.triggerPoint.x <= 940 && sanitized.triggerPoint.y >= 70);
  assert.equal(sanitized.keyLevels.length, 1);
  assert.equal(sanitized.keyLevels[0].y, 955);
  assert.equal(sanitized.steps.length, 3);
  assert.equal(sanitized.steps[0].step, 1);
  assert.equal(sanitized.steps[2].step, 3);
});

test('resolveVisualAnnotations synthesizes clean annotations for legacy analyses without visualAnnotations', () => {
  const legacy: AnalysisResult = {
    id: 'legacy_1',
    timestamp: Date.now(),
    mode: 'simple',
    asset: 'EUR/USD (OTC)',
    timeframe: 'M1',
    entryTimeframe: 'M1',
    verdict: {
      verdict: 'VENDA',
      consensusRatio: 0.8,
      agreementCount: 4,
      totalAgents: 5,
      buyVotes: 0,
      sellVotes: 4,
      neutralVotes: 1,
      overallConfidence: 88,
      hasConsensus: true,
      confluenceScore: 87,
      recommendedAction: 'VENDA autorizada após estrela cadente em resistência.',
      keyFactors: [],
    },
    insights: {
      trend: 'Baixa Dominante',
      trendDirection: 'baixa',
      keyPattern: 'Estrela Cadente em Resistência',
      patternType: 'Reversão Bearish',
      quality: 'A',
      qualityGrade: 'A',
      qualityScore: 87,
      idealExpiration: '2 velas (2 min)',
      entryTiming: 'Às 14:12 (Abertura próxima vela M1)',
      entryTrigger: 'Virada M1 · 14:12',
    },
    agents: [],
    plan: {
      asset: 'EUR/USD (OTC)',
      timeframe: 'M1',
      entryZone: '1.0880',
      takeProfit1: '1.0860',
      takeProfit2: '1.0840',
      stopLoss: '1.0890',
      riskRewardRatio: '1:2.0',
      suggestedExpiration: '2 velas',
      riskLevel: 'Baixo',
      direction: 'VENDA',
    },
    radarMetrics: { priceAction: 88, technicals: 82, flowVolatility: 85, predictiveML: 84, riskManagement: 90 },
    candles: [],
    levels: [],
  };

  const resolved = resolveVisualAnnotations(legacy);
  assert.match(resolved.analyzedZone.label, /Resistência/i);
  assert.match(resolved.triggerPoint.label, /VENDA/);
  assert.equal(resolved.steps.length, 3);
  assert.ok(resolved.keyLevels.some((l) => l.type === 'resistance'));
});

test('computeAnnotationLayout keeps all callouts strictly inside canvas bounds even at extreme corners', () => {
  const cornerAnnotations = sanitizeVisualAnnotations(
    {
      analyzedZone: { x: 800, y: 20, width: 200, height: 180, label: 'Resistência Topo' },
      triggerPoint: { x: 935, y: 75, label: 'Gatilho Extremo', timingLabel: 'Imediato' },
      trendArrow: { fromX: 700, fromY: 40, toX: 930, toY: 75, label: 'Impulso' },
    },
    {
      verdict: 'VENDA',
      timeframe: 'M5',
      keyPattern: 'Topo Duplo',
      entryTrigger: 'Imediato',
      entryTiming: 'Agora',
      trend: 'Baixa',
      recommendedAction: 'Venda no toque da resistência',
    }
  );

  const layout = computeAnnotationLayout(cornerAnnotations, 1280, 720, 'VENDA');
  assertInsideCanvas(layout.zoneCallout, 1280, 720, 'zoneCallout');
  assertInsideCanvas(layout.triggerCallout, 1280, 720, 'triggerCallout');
  assertInsideCanvas(layout.rationaleCallout, 1280, 720, 'rationaleCallout');

  // Verify small mobile container also clamps safely without overflow
  const mobileLayout = computeAnnotationLayout(cornerAnnotations, 390, 260, 'VENDA');
  assertInsideCanvas(mobileLayout.zoneCallout, 390, 260, 'mobile.zoneCallout');
  assertInsideCanvas(mobileLayout.triggerCallout, 390, 260, 'mobile.triggerCallout');
  assertInsideCanvas(mobileLayout.rationaleCallout, 390, 260, 'mobile.rationaleCallout');
});
