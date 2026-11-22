import {
  AnalysisResult,
  VisualAnnotations,
  VisualDecisionStep,
  VisualKeyLevel,
  VoteType,
} from '../types/trading.js';

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function cleanLabel(raw: unknown, fallback: string, maxLen = 72): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\r\n\t]+/g, ' ').trim();
  if (!cleaned || /^(n\/a|na|null|undefined|-)$/i.test(cleaned)) return fallback;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1).trimEnd()}…` : cleaned;
}

export interface SanitizeVisualContext {
  verdict: VoteType;
  timeframe: string;
  keyPattern: string;
  entryTrigger: string;
  entryTiming: string;
  trend: string;
  recommendedAction: string;
  strategyFallback?: string;
}

/**
 * Sanitizes and clamps normalized (0..1000) Gemini Vision visual annotations,
 * guaranteeing legible coordinates and complete 3-step decision labels.
 */
export function sanitizeVisualAnnotations(
  raw: any,
  ctx: SanitizeVisualContext
): VisualAnnotations {
  const isBuy = ctx.verdict === 'COMPRA';
  const isSell = ctx.verdict === 'VENDA';

  const defaultZone = isBuy
    ? { x: 460, y: 420, width: 320, height: 300, label: 'Zona de Suporte & Rejeição Compradora' }
    : isSell
    ? { x: 460, y: 240, width: 320, height: 300, label: 'Zona de Resistência & Pressão Vendedora' }
    : { x: 460, y: 340, width: 320, height: 280, label: 'Zona de Consolidação / Filtro Ativo' };

  const rawZone = raw?.analyzedZone || {};
  const zoneW = clamp(Number(rawZone.width ?? defaultZone.width), 140, 560);
  const zoneH = clamp(Number(rawZone.height ?? defaultZone.height), 120, 520);
  const zoneX = clamp(Number(rawZone.x ?? defaultZone.x), 30, 960 - zoneW);
  const zoneY = clamp(Number(rawZone.y ?? defaultZone.y), 40, 940 - zoneH);

  const defaultTrigger = isBuy
    ? {
        x: Math.min(890, zoneX + zoneW - 20),
        y: Math.min(850, zoneY + Math.round(zoneH * 0.65)),
        label: `Entrada COMPRA (${ctx.timeframe})`,
        timingLabel: cleanLabel(ctx.entryTrigger, `Virada ${ctx.timeframe}`, 34),
      }
    : isSell
    ? {
        x: Math.min(890, zoneX + zoneW - 20),
        y: Math.max(130, zoneY + Math.round(zoneH * 0.35)),
        label: `Entrada VENDA (${ctx.timeframe})`,
        timingLabel: cleanLabel(ctx.entryTrigger, `Virada ${ctx.timeframe}`, 34),
      }
    : {
        x: Math.min(890, zoneX + zoneW - 20),
        y: zoneY + Math.round(zoneH * 0.5),
        label: 'Aguardar Confirmação',
        timingLabel: cleanLabel(ctx.entryTrigger, 'Sem Gatilho Ativo', 34),
      };

  const rawTrigger = raw?.triggerPoint || {};
  const triggerX = clamp(Number(rawTrigger.x ?? defaultTrigger.x), 60, 940);
  const triggerY = clamp(Number(rawTrigger.y ?? defaultTrigger.y), 70, 920);

  const defaultArrow = isBuy
    ? {
        fromX: Math.max(60, zoneX - 110),
        fromY: Math.min(900, triggerY + 130),
        toX: triggerX - 16,
        toY: triggerY + 8,
        label: 'Impulso & Pullback Altista',
      }
    : isSell
    ? {
        fromX: Math.max(60, zoneX - 110),
        fromY: Math.max(80, triggerY - 130),
        toX: triggerX - 16,
        toY: triggerY - 8,
        label: 'Rejeição & Fluxo Vendedor',
      }
    : {
        fromX: Math.max(60, zoneX - 90),
        fromY: zoneY + Math.round(zoneH * 0.5),
        toX: triggerX - 24,
        toY: zoneY + Math.round(zoneH * 0.5),
        label: 'Movimento Lateral / Filtro',
      };

  const rawArrow = raw?.trendArrow || {};
  const fromX = clamp(Number(rawArrow.fromX ?? defaultArrow.fromX), 40, 940);
  const fromY = clamp(Number(rawArrow.fromY ?? defaultArrow.fromY), 50, 940);
  const toX = clamp(Number(rawArrow.toX ?? defaultArrow.toX), 50, 950);
  const toY = clamp(Number(rawArrow.toY ?? defaultArrow.toY), 50, 940);

  const rawLevels = Array.isArray(raw?.keyLevels) ? raw.keyLevels : [];
  const keyLevels: VisualKeyLevel[] = rawLevels
    .filter((lvl: any) => lvl && typeof lvl.y === 'number' && Number.isFinite(lvl.y))
    .slice(0, 3)
    .map((lvl: any) => {
      const type: VisualKeyLevel['type'] =
        lvl.type === 'resistance' || lvl.type === 'target' ? lvl.type : 'support';
      return {
        y: clamp(lvl.y, 45, 955),
        type,
        label: cleanLabel(
          lvl.label,
          type === 'resistance' ? 'Resistência' : type === 'target' ? 'Alvo Projetado' : 'Suporte',
          36
        ),
      };
    });

  if (keyLevels.length === 0) {
    if (isBuy) {
      keyLevels.push(
        { y: clamp(zoneY + zoneH - 18, 60, 940), type: 'support', label: 'Suporte Defendido' },
        { y: clamp(zoneY - 80, 50, 900), type: 'target', label: 'Alvo Livre (TP)' }
      );
    } else if (isSell) {
      keyLevels.push(
        { y: clamp(zoneY + 18, 60, 940), type: 'resistance', label: 'Resistência Defendida' },
        { y: clamp(zoneY + zoneH + 80, 80, 950), type: 'target', label: 'Alvo Livre (TP)' }
      );
    } else {
      keyLevels.push(
        { y: clamp(zoneY + 14, 60, 940), type: 'resistance', label: 'Teto do Range' },
        { y: clamp(zoneY + zoneH - 14, 60, 940), type: 'support', label: 'Base do Range' }
      );
    }
  }

  const strategyTitle = cleanLabel(
    raw?.strategyTitle,
    ctx.strategyFallback || cleanLabel(ctx.keyPattern, 'Confluência Price Action + Fluxo', 46),
    54
  );

  const technicalReason = cleanLabel(
    raw?.technicalReason,
    cleanLabel(ctx.recommendedAction, `${ctx.keyPattern} · ${ctx.trend}`, 130),
    140
  );

  const zoneLabel = cleanLabel(rawZone.label, defaultZone.label, 48);
  const triggerLabel = cleanLabel(rawTrigger.label, defaultTrigger.label, 38);
  const timingLabel = cleanLabel(rawTrigger.timingLabel, defaultTrigger.timingLabel, 34);

  const defaultSteps: VisualDecisionStep[] = [
    {
      step: 1,
      title: 'Zona Analisada',
      detail: `${zoneLabel} — Estrutura avaliada: ${cleanLabel(ctx.trend, 'Tendência principal', 56)}`,
    },
    {
      step: 2,
      title: 'Gatilho e Ponto de Entrada',
      detail: `${triggerLabel} · ${cleanLabel(ctx.entryTiming, timingLabel, 64)}`,
    },
    {
      step: 3,
      title: 'Racional da Operação',
      detail: `${strategyTitle}: ${technicalReason}`,
    },
  ];

  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  const steps: VisualDecisionStep[] = defaultSteps.map((def, idx) => {
    const candidate = rawSteps.find((s: any) => Number(s?.step) === def.step) || rawSteps[idx];
    if (!candidate) return def;
    return {
      step: def.step,
      title: cleanLabel(candidate.title, def.title, 34),
      detail: cleanLabel(candidate.detail, def.detail, 130),
    };
  });

  return {
    analyzedZone: {
      x: Math.round(zoneX),
      y: Math.round(zoneY),
      width: Math.round(zoneW),
      height: Math.round(zoneH),
      label: zoneLabel,
    },
    triggerPoint: {
      x: Math.round(triggerX),
      y: Math.round(triggerY),
      label: triggerLabel,
      timingLabel,
    },
    trendArrow: {
      fromX: Math.round(fromX),
      fromY: Math.round(fromY),
      toX: Math.round(toX),
      toY: Math.round(toY),
      label: cleanLabel(rawArrow.label, defaultArrow.label, 40),
    },
    keyLevels,
    strategyTitle,
    technicalReason,
    steps,
  };
}

/**
 * Resolves visual annotations from an existing AnalysisResult, synthesizing a clean
 * fallback overlay for legacy records saved before visual grounding was added.
 */
export function resolveVisualAnnotations(analysis: AnalysisResult): VisualAnnotations {
  return sanitizeVisualAnnotations(analysis.visualAnnotations, {
    verdict: analysis.verdict.verdict,
    timeframe: analysis.entryTimeframe || analysis.timeframe || 'M5',
    keyPattern: analysis.insights?.keyPattern || 'Padrão Estrutural',
    entryTrigger: analysis.insights?.entryTrigger || `Virada ${analysis.entryTimeframe || analysis.timeframe}`,
    entryTiming: analysis.insights?.entryTiming || `Abertura da próxima vela (${analysis.timeframe})`,
    trend: analysis.insights?.trend || 'Estrutura de Preço',
    recommendedAction: analysis.verdict.recommendedAction,
    strategyFallback: analysis.insights?.patternType
      ? `${analysis.insights.patternType} (${analysis.verdict.agreementCount}/5 Agentes)`
      : undefined,
  });
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationCalloutBox extends PixelRect {
  anchorX: number;
  anchorY: number;
  badgeText: string;
  title: string;
  subtitle: string;
}

export interface PixelAnnotationLayout {
  width: number;
  height: number;
  verdict: VoteType;
  zone: PixelRect & { label: string };
  trigger: {
    x: number;
    y: number;
    radius: number;
  };
  trendArrow: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    labelX: number;
    labelY: number;
    label: string;
  };
  levels: Array<{
    y: number;
    type: 'support' | 'resistance' | 'target';
    label: string;
  }>;
  zoneCallout: AnnotationCalloutBox;
  triggerCallout: AnnotationCalloutBox;
  rationaleCallout: AnnotationCalloutBox;
}

function rectsOverlapArea(a: PixelRect, b: PixelRect, pad = 8): number {
  const ax1 = a.x - pad;
  const ay1 = a.y - pad;
  const ax2 = a.x + a.width + pad;
  const ay2 = a.y + a.height + pad;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const oy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  return ox * oy;
}

function clampRect(rect: PixelRect, canvasW: number, canvasH: number, margin = 14): PixelRect {
  const width = Math.min(rect.width, canvasW - margin * 2);
  const height = Math.min(rect.height, canvasH - margin * 2);
  return {
    x: Math.round(clamp(rect.x, margin, Math.max(margin, canvasW - width - margin))),
    y: Math.round(clamp(rect.y, margin, Math.max(margin, canvasH - height - margin))),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function pickBestCandidate(
  candidates: Array<{ x: number; y: number }>,
  boxW: number,
  boxH: number,
  obstacles: PixelRect[],
  canvasW: number,
  canvasH: number,
  targetAnchor: { x: number; y: number }
): PixelRect {
  let bestRect = clampRect({ x: candidates[0].x, y: candidates[0].y, width: boxW, height: boxH }, canvasW, canvasH);
  let bestScore = Number.POSITIVE_INFINITY;

  for (const cand of candidates) {
    const rect = clampRect({ x: cand.x, y: cand.y, width: boxW, height: boxH }, canvasW, canvasH);
    let overlapPenalty = 0;
    for (const obs of obstacles) {
      overlapPenalty += rectsOverlapArea(rect, obs, 10) * 100;
    }
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const dist = Math.hypot(cx - targetAnchor.x, cy - targetAnchor.y);
    const score = overlapPenalty + dist * 0.25;
    if (score < bestScore) {
      bestScore = score;
      bestRect = rect;
    }
  }

  return bestRect;
}

/**
 * Computes exact, collision-aware pixel geometry for SVG overlay and PNG canvas export.
 * Guarantees all callout boxes remain strictly within [14..width-14] and [14..height-14].
 */
export function computeAnnotationLayout(
  annotations: VisualAnnotations,
  canvasWidth: number,
  canvasHeight: number,
  verdict: VoteType
): PixelAnnotationLayout {
  const width = Math.max(360, Math.round(canvasWidth));
  const height = Math.max(220, Math.round(canvasHeight));
  const sx = (nx: number) => (clamp(nx, 0, 1000) / 1000) * width;
  const sy = (ny: number) => (clamp(ny, 0, 1000) / 1000) * height;

  const zone = {
    x: Math.round(sx(annotations.analyzedZone.x)),
    y: Math.round(sy(annotations.analyzedZone.y)),
    width: Math.round(sx(annotations.analyzedZone.width)),
    height: Math.round(sy(annotations.analyzedZone.height)),
    label: annotations.analyzedZone.label,
  };

  const triggerRadius = Math.max(12, Math.min(20, Math.round(Math.min(width, height) * 0.024)));
  const trigger = {
    x: Math.round(sx(annotations.triggerPoint.x)),
    y: Math.round(sy(annotations.triggerPoint.y)),
    radius: triggerRadius,
  };

  const arrowFromX = Math.round(sx(annotations.trendArrow.fromX));
  const arrowFromY = Math.round(sy(annotations.trendArrow.fromY));
  const arrowToX = Math.round(sx(annotations.trendArrow.toX));
  const arrowToY = Math.round(sy(annotations.trendArrow.toY));
  const trendArrow = {
    fromX: arrowFromX,
    fromY: arrowFromY,
    toX: arrowToX,
    toY: arrowToY,
    labelX: Math.round((arrowFromX + arrowToX) / 2),
    labelY: Math.round((arrowFromY + arrowToY) / 2),
    label: annotations.trendArrow.label,
  };

  const levels = annotations.keyLevels.map((lvl) => ({
    y: Math.round(sy(lvl.y)),
    type: lvl.type,
    label: lvl.label,
  }));

  const scale = clamp(width / 1100, 0.78, 1.12);
  const boxW1 = Math.round(290 * scale);
  const boxH1 = Math.round(68 * scale);

  const triggerRectObstacle: PixelRect = {
    x: trigger.x - triggerRadius - 8,
    y: trigger.y - triggerRadius - 8,
    width: (triggerRadius + 8) * 2,
    height: (triggerRadius + 8) * 2,
  };

  // 1. Zone Callout — prefer directly below or above the analyzed zone
  const zoneBoxRect = pickBestCandidate(
    [
      { x: zone.x + zone.width / 2 - boxW1 / 2, y: zone.y + zone.height + 16 },
      { x: zone.x + zone.width / 2 - boxW1 / 2, y: zone.y - boxH1 - 16 },
      { x: zone.x - boxW1 - 18, y: zone.y + zone.height / 2 - boxH1 / 2 },
      { x: 18, y: height - boxH1 - 18 },
    ],
    boxW1,
    boxH1,
    [triggerRectObstacle],
    width,
    height,
    { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
  );

  const zoneAnchorY =
    zoneBoxRect.y >= zone.y + zone.height
      ? zone.y + zone.height
      : zoneBoxRect.y + zoneBoxRect.height <= zone.y
      ? zone.y
      : zone.y + zone.height / 2;

  const zoneCallout: AnnotationCalloutBox = {
    ...zoneBoxRect,
    anchorX: Math.round(clamp(zoneBoxRect.x + zoneBoxRect.width / 2, zone.x + 12, zone.x + zone.width - 12)),
    anchorY: Math.round(zoneAnchorY),
    badgeText: '1 · ZONA ANALISADA',
    title: annotations.analyzedZone.label,
    subtitle: annotations.steps[0]?.detail || '',
  };

  // 2. Trigger Callout — hug closely above/beside the trigger reticle without colliding with zoneCallout
  const boxW2 = Math.round(280 * scale);
  const boxH2 = Math.round(68 * scale);
  const offset = triggerRadius + 24;
  const triggerBoxRect = pickBestCandidate(
    [
      { x: trigger.x + offset, y: trigger.y - boxH2 - offset },
      { x: trigger.x - boxW2 / 2, y: trigger.y - boxH2 - offset - 8 },
      { x: trigger.x - boxW2 - offset, y: trigger.y - boxH2 - offset },
      { x: trigger.x + offset, y: trigger.y + offset },
      { x: trigger.x - boxW2 - offset, y: trigger.y + offset },
      { x: width - boxW2 - 20, y: 18 },
    ],
    boxW2,
    boxH2,
    [zoneCallout, triggerRectObstacle],
    width,
    height,
    { x: trigger.x, y: trigger.y }
  );

  const triggerCallout: AnnotationCalloutBox = {
    ...triggerBoxRect,
    anchorX: trigger.x,
    anchorY: trigger.y,
    badgeText: '2 · GATILHO E ENTRADA',
    title: annotations.triggerPoint.label,
    subtitle: annotations.triggerPoint.timingLabel,
  };

  // 3. Rationale / Strategy Callout — place in clearest corner opposite zone & trigger
  const boxW3 = Math.round(350 * scale);
  const boxH3 = Math.round(84 * scale);
  const rationaleRect = pickBestCandidate(
    [
      { x: 18, y: 18 },
      { x: width - boxW3 - 18, y: 18 },
      { x: 18, y: height - boxH3 - 18 },
      { x: width - boxW3 - 18, y: height - boxH3 - 18 },
    ],
    boxW3,
    boxH3,
    [zoneCallout, triggerCallout, triggerRectObstacle, zone],
    width,
    height,
    { x: 18 + boxW3 / 2, y: 18 + boxH3 / 2 }
  );

  const rationaleCallout: AnnotationCalloutBox = {
    ...rationaleRect,
    anchorX: arrowFromX,
    anchorY: arrowFromY,
    badgeText: '3 · RACIONAL DA OPERAÇÃO',
    title: annotations.strategyTitle,
    subtitle: annotations.technicalReason,
  };

  return {
    width,
    height,
    verdict,
    zone,
    trigger,
    trendArrow,
    levels,
    zoneCallout,
    triggerCallout,
    rationaleCallout,
  };
}
