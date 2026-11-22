import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Layers, Crosshair, BookOpen, Sparkles } from 'lucide-react';
import { AnalysisResult, VoteType } from '../types/trading';
import {
  AnnotationCalloutBox,
  computeAnnotationLayout,
  resolveVisualAnnotations,
} from '../utils/visualAnnotationBuilder';

interface AnnotatedChartViewProps {
  analysis: AnalysisResult;
}

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) {
        break;
      }
      current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    if (!last.endsWith('…')) {
      lines[maxLines - 1] =
        last.length > maxCharsPerLine - 1 ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
    }
  }
  return lines;
}

function getVerdictPalette(verdict: VoteType) {
  if (verdict === 'COMPRA') {
    return {
      primary: '#10b981',
      primarySoft: 'rgba(16, 185, 129, 0.18)',
      accentText: '#6ee7b7',
      badgeBg: '#065f46',
    };
  }
  if (verdict === 'VENDA') {
    return {
      primary: '#f43f5e',
      primarySoft: 'rgba(244, 63, 94, 0.18)',
      accentText: '#fda4af',
      badgeBg: '#881337',
    };
  }
  return {
    primary: '#f59e0b',
    primarySoft: 'rgba(245, 158, 11, 0.16)',
    accentText: '#fcd34d',
    badgeBg: '#78350f',
  };
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export const AnnotatedChartView: React.FC<AnnotatedChartViewProps> = React.memo(({ analysis }) => {
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  const [isExporting, setIsExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const imageSrc = analysis.imagePreview;
  const annotations = useMemo(() => resolveVisualAnnotations(analysis), [analysis]);
  const palette = useMemo(() => getVerdictPalette(analysis.verdict.verdict), [analysis.verdict.verdict]);

  const layout = useMemo(
    () =>
      computeAnnotationLayout(
        annotations,
        imgDimensions.w,
        imgDimensions.h,
        analysis.verdict.verdict
      ),
    [annotations, imgDimensions.w, imgDimensions.h, analysis.verdict.verdict]
  );

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    if (target.naturalWidth > 0 && target.naturalHeight > 0) {
      const targetW = Math.max(1100, target.naturalWidth);
      const targetH = Math.max(300, Math.round((target.naturalHeight / target.naturalWidth) * targetW));
      setImgDimensions({
        w: targetW,
        h: targetH,
      });
    }
  }, []);

  const handleDownloadAnnotated = useCallback(async () => {
    if (!imageSrc || isExporting) return;
    setIsExporting(true);
    const canvas = document.createElement('canvas');
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          reject(new Error('Tempo limite excedido ao preparar imagem anotada.'));
        }, 8000);
        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Falha ao carregar imagem para exportação.'));
        };
        img.src = imageSrc;
      });

      const minExportW = 1280;
      const scaleFactor = img.naturalWidth < minExportW ? minExportW / img.naturalWidth : 1;
      const exportW = Math.round(img.naturalWidth * scaleFactor);
      const exportH = Math.round(img.naturalHeight * scaleFactor);

      canvas.width = exportW;
      canvas.height = exportH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, exportW, exportH);
      const exportLayout = computeAnnotationLayout(
        annotations,
        exportW,
        exportH,
        analysis.verdict.verdict
      );

      // Subtle dark vignette around edges for higher contrast
      ctx.fillStyle = 'rgba(6, 10, 20, 0.14)';
      ctx.fillRect(0, 0, exportW, exportH);

      // 1. Key horizontal levels
      for (const lvl of exportLayout.levels) {
        const lineCol =
          lvl.type === 'resistance' ? '#fbbf24' : lvl.type === 'target' ? '#10b981' : '#38bdf8';
        ctx.save();
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(24, lvl.y);
        ctx.lineTo(exportW - 24, lvl.y);
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 13px monospace';
        const pillW = ctx.measureText(lvl.label).width + 18;
        drawRoundedRectPath(ctx, 26, Math.max(12, lvl.y - 24), pillW, 20, 5);
        ctx.fillStyle = 'rgba(9, 14, 26, 0.9)';
        ctx.fill();
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = lineCol;
        ctx.fillText(lvl.label, 35, Math.max(26, lvl.y - 10));
      }

      // 2. Highlighted Analyzed Zone
      const { zone } = exportLayout;
      drawRoundedRectPath(ctx, zone.x, zone.y, zone.width, zone.height, 12);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 6]);
      ctx.stroke();
      ctx.restore();

      // 3. Flow / Strategy Arrow + compact inline pill label
      const { trendArrow } = exportLayout;
      const angle = Math.atan2(trendArrow.toY - trendArrow.fromY, trendArrow.toX - trendArrow.fromX);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(trendArrow.fromX, trendArrow.fromY);
      ctx.lineTo(trendArrow.toX, trendArrow.toY);
      ctx.stroke();

      const headLen = 15;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(trendArrow.toX, trendArrow.toY);
      ctx.lineTo(
        trendArrow.toX - headLen * Math.cos(angle - Math.PI / 6),
        trendArrow.toY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        trendArrow.toX - headLen * Math.cos(angle + Math.PI / 6),
        trendArrow.toY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      if (trendArrow.label) {
        ctx.font = 'bold 11px monospace';
        const arrowLabelW = Math.min(220, ctx.measureText(trendArrow.label).width + 18);
        const pillX = Math.max(18, Math.min(exportW - arrowLabelW - 18, trendArrow.labelX - arrowLabelW / 2));
        const pillY = Math.max(18, trendArrow.labelY - 26);
        drawRoundedRectPath(ctx, pillX, pillY, arrowLabelW, 20, 6);
        ctx.fillStyle = 'rgba(7, 11, 20, 0.92)';
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.fillText(trendArrow.label, pillX + 9, pillY + 14);
      }

      // 4. Trigger reticle
      const { trigger } = exportLayout;
      ctx.beginPath();
      ctx.arc(trigger.x, trigger.y, trigger.radius + 9, 0, Math.PI * 2);
      ctx.fillStyle = palette.primarySoft;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = palette.primary;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(trigger.x, trigger.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = palette.primary;
      ctx.fill();

      // Helper for callout cards on canvas
      const drawCard = (box: AnnotationCalloutBox, color: string, isRationale = false) => {
        if (!isRationale) {
          const edgeX = Math.max(box.x, Math.min(box.x + box.width, box.anchorX));
          const edgeY = Math.max(box.y, Math.min(box.y + box.height, box.anchorY));
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(edgeX, edgeY);
          ctx.lineTo(box.anchorX, box.anchorY);
          ctx.stroke();
          ctx.restore();
        }

        // Card container
        drawRoundedRectPath(ctx, box.x, box.y, box.width, box.height, 10);
        ctx.fillStyle = 'rgba(7, 11, 20, 0.94)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Badge text
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = color;
        ctx.fillText(box.badgeText, box.x + 12, box.y + 18);

        // Title
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#f8fafc';
        const titleLines = wrapTextLines(box.title, isRationale ? 46 : 38, 1);
        ctx.fillText(titleLines[0] || box.title, box.x + 12, box.y + 37);

        // Subtitle
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#cbd5e1';
        const subLines = wrapTextLines(box.subtitle, isRationale ? 50 : 42, isRationale ? 2 : 1);
        subLines.forEach((line, idx) => {
          ctx.fillText(line, box.x + 12, box.y + 54 + idx * 14);
        });
      };

      drawCard(exportLayout.zoneCallout, '#38bdf8');
      drawCard(exportLayout.triggerCallout, palette.primary);
      drawCard(exportLayout.rationaleCallout, '#fbbf24', true);

      const safeAsset = (analysis.asset || 'grafico').replace(/[^a-zA-Z0-9_-]+/g, '_');
      const link = document.createElement('a');
      link.download = `nextcandle-${safeAsset}-anotado.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Erro ao exportar imagem anotada:', err);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      setIsExporting(false);
    }
  }, [imageSrc, isExporting, annotations, analysis.verdict.verdict, analysis.asset, palette]);

  if (!imageSrc) return null;

  const renderSvgCallout = (
    box: AnnotationCalloutBox,
    strokeColor: string,
    accentColor: string,
    isRationale = false
  ) => {
    const edgeX = Math.max(box.x, Math.min(box.x + box.width, box.anchorX));
    const edgeY = Math.max(box.y, Math.min(box.y + box.height, box.anchorY));
    const titleLines = wrapTextLines(box.title, isRationale ? 46 : 38, 1);
    const subLines = wrapTextLines(box.subtitle, isRationale ? 50 : 42, isRationale ? 2 : 1);

    return (
      <g>
        {!isRationale && (
          <>
            <line
              x1={edgeX}
              y1={edgeY}
              x2={box.anchorX}
              y2={box.anchorY}
              stroke={strokeColor}
              strokeWidth={2}
              strokeDasharray="4,4"
              opacity={0.95}
            />
            <circle cx={box.anchorX} cy={box.anchorY} r={3.5} fill={strokeColor} />
          </>
        )}

        {/* Contrasting dark container */}
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={10}
          fill="rgba(7, 11, 20, 0.93)"
          stroke={strokeColor}
          strokeWidth={1.8}
        />
        {/* Left indicator bar */}
        <rect x={box.x} y={box.y} width={5} height={box.height} rx={2.5} fill={strokeColor} />

        <text
          x={box.x + 14}
          y={box.y + 18}
          fill={accentColor}
          fontSize="11"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {box.badgeText}
        </text>
        <text
          x={box.x + 14}
          y={box.y + 36}
          fill="#f8fafc"
          fontSize="13"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {titleLines[0] || box.title}
        </text>
        {subLines.map((line, i) => (
          <text
            key={i}
            x={box.x + 14}
            y={box.y + 53 + i * 14}
            fill="#cbd5e1"
            fontSize="11.5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {line}
          </text>
        ))}
      </g>
    );
  };

  return (
    <section
      aria-label="Mapa Visual da Decisão Multiagente"
      className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 shadow-xl"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80 mb-4">
        <div className="flex items-start sm:items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                Análise Visual Passo a Passo na Imagem Anexada
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                {analysis.asset} · {analysis.entryTimeframe || analysis.timeframe}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Destaques visuais da zona analisada, marcador exato do gatilho de entrada e racional técnico dos 5 agentes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAnnotations((prev) => !prev)}
            aria-pressed={showAnnotations}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showAnnotations
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-500/30'
                : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            {showAnnotations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showAnnotations ? 'Ocultar Anotações' : 'Mostrar Anotações'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAnnotated}
            disabled={isExporting}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-emerald-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exportando...' : 'Baixar PNG Anotado'}</span>
          </button>
        </div>
      </div>

      {/* Annotated Image Canvas Stage */}
      <div className="rounded-xl border border-slate-800 bg-[#070b12] p-2 sm:p-3 flex justify-center overflow-hidden">
        <div className="relative inline-block max-w-full">
          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={handleImgLoad}
            alt={`Gráfico anotado de ${analysis.asset}`}
            className="block max-w-full max-h-[540px] w-auto h-auto rounded-lg select-none"
          />

          {showAnnotations && (
            <svg
              data-testid="annotated-chart-overlay"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 w-full h-full pointer-events-none rounded-lg"
              role="img"
              aria-label="Camada de anotações visuais sobre o gráfico analisado"
            >
              <defs>
                <marker
                  id="nc-flow-arrowhead"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8"
                  refY="4"
                  orient="auto"
                >
                  <polygon points="0 0, 10 4, 0 8" fill="#fbbf24" />
                </marker>
              </defs>

              {/* Subtle backdrop contrast tint */}
              <rect
                x={0}
                y={0}
                width={layout.width}
                height={layout.height}
                fill="rgba(6, 10, 20, 0.14)"
              />

              {/* Horizontal key price levels (Support / Resistance / Target) */}
              {layout.levels.map((lvl, idx) => {
                const color =
                  lvl.type === 'resistance'
                    ? '#fbbf24'
                    : lvl.type === 'target'
                    ? '#10b981'
                    : '#38bdf8';
                const labelY = Math.max(16, lvl.y - 8);
                return (
                  <g key={idx}>
                    <line
                      x1={18}
                      y1={lvl.y}
                      x2={layout.width - 18}
                      y2={lvl.y}
                      stroke={color}
                      strokeWidth={1.8}
                      strokeDasharray="7,5"
                      opacity={0.85}
                    />
                    <rect
                      x={20}
                      y={Math.max(4, labelY - 15)}
                      width={Math.min(220, lvl.label.length * 7.2 + 18)}
                      height={19}
                      rx={4}
                      fill="rgba(7, 11, 20, 0.9)"
                      stroke={color}
                      strokeWidth={1}
                    />
                    <text
                      x={28}
                      y={Math.max(17, labelY - 2)}
                      fill={color}
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="ui-monospace, monospace"
                    >
                      {lvl.label}
                    </text>
                  </g>
                );
              })}

              {/* 1. Highlighted Analyzed Zone */}
              <g>
                <rect
                  x={layout.zone.x}
                  y={layout.zone.y}
                  width={layout.zone.width}
                  height={layout.zone.height}
                  rx={12}
                  fill="rgba(56, 189, 248, 0.13)"
                  stroke="#38bdf8"
                  strokeWidth={2.4}
                  strokeDasharray="8,5"
                />
                {/* Highlight corners for crisp technical framing */}
                <path
                  d={`M ${layout.zone.x} ${layout.zone.y + 18} L ${layout.zone.x} ${layout.zone.y} L ${layout.zone.x + 18} ${layout.zone.y}`}
                  fill="none"
                  stroke="#7dd3fc"
                  strokeWidth={3.5}
                />
                <path
                  d={`M ${layout.zone.x + layout.zone.width - 18} ${layout.zone.y} L ${layout.zone.x + layout.zone.width} ${layout.zone.y} L ${layout.zone.x + layout.zone.width} ${layout.zone.y + 18}`}
                  fill="none"
                  stroke="#7dd3fc"
                  strokeWidth={3.5}
                />
              </g>

              {/* Flow / Structural Movement Arrow + Compact Pill Label */}
              <g>
                <line
                  x1={layout.trendArrow.fromX}
                  y1={layout.trendArrow.fromY}
                  x2={layout.trendArrow.toX}
                  y2={layout.trendArrow.toY}
                  stroke="#fbbf24"
                  strokeWidth={3.2}
                  markerEnd="url(#nc-flow-arrowhead)"
                />
                {layout.trendArrow.label &&
                  (() => {
                    const pillW = Math.min(200, Math.round(layout.trendArrow.label.length * 7.2 + 20));
                    const pillX = Math.max(
                      16,
                      Math.min(layout.width - pillW - 16, Math.round(layout.trendArrow.labelX - pillW / 2))
                    );
                    const pillY = Math.max(16, layout.trendArrow.labelY - 30);
                    return (
                      <g>
                        <rect
                          x={pillX}
                          y={pillY}
                          width={pillW}
                          height={20}
                          rx={6}
                          fill="rgba(7, 11, 20, 0.92)"
                          stroke="#fbbf24"
                          strokeWidth={1.1}
                        />
                        <text
                          x={pillX + 10}
                          y={pillY + 14}
                          fill="#fde68a"
                          fontSize="11"
                          fontWeight="700"
                          fontFamily="ui-monospace, monospace"
                        >
                          {layout.trendArrow.label}
                        </text>
                      </g>
                    );
                  })()}
              </g>

              {/* 2. Trigger & Exact Entry Marker */}
              <g>
                <circle
                  cx={layout.trigger.x}
                  cy={layout.trigger.y}
                  r={layout.trigger.radius + 10}
                  fill={palette.primarySoft}
                  stroke={palette.primary}
                  strokeWidth={1.6}
                  strokeDasharray="4,3"
                />
                <circle
                  cx={layout.trigger.x}
                  cy={layout.trigger.y}
                  r={layout.trigger.radius}
                  fill="rgba(7, 11, 20, 0.72)"
                  stroke={palette.primary}
                  strokeWidth={2.6}
                />
                <circle cx={layout.trigger.x} cy={layout.trigger.y} r={5.5} fill={palette.primary} />
                {/* Crosshair ticks */}
                <line
                  x1={layout.trigger.x - layout.trigger.radius - 6}
                  y1={layout.trigger.y}
                  x2={layout.trigger.x - layout.trigger.radius + 4}
                  y2={layout.trigger.y}
                  stroke={palette.primary}
                  strokeWidth={2}
                />
                <line
                  x1={layout.trigger.x + layout.trigger.radius - 4}
                  y1={layout.trigger.y}
                  x2={layout.trigger.x + layout.trigger.radius + 6}
                  y2={layout.trigger.y}
                  stroke={palette.primary}
                  strokeWidth={2}
                />
              </g>

              {/* Contrasting Callout Boxes */}
              {renderSvgCallout(layout.zoneCallout, '#38bdf8', '#7dd3fc')}
              {renderSvgCallout(layout.triggerCallout, palette.primary, palette.accentText)}
              {renderSvgCallout(layout.rationaleCallout, '#fbbf24', '#fde68a', true)}
            </svg>
          )}
        </div>
      </div>

      {/* Synchronized 3-Step Visual Decision Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-sky-500/30 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center shrink-0 text-sky-300">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block">
              Passo 1 · {annotations.steps[0]?.title || 'Zona Analisada'}
            </span>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
              {annotations.steps[0]?.detail}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-start gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
              analysis.verdict.verdict === 'COMPRA'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : analysis.verdict.verdict === 'VENDA'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider block ${
                analysis.verdict.verdict === 'COMPRA'
                  ? 'text-emerald-400'
                  : analysis.verdict.verdict === 'VENDA'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              Passo 2 · {annotations.steps[1]?.title || 'Gatilho e Entrada'}
            </span>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
              {annotations.steps[1]?.detail}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-300">
            <BookOpen className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
              Passo 3 · {annotations.steps[2]?.title || 'Racional da Operação'}
            </span>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
              {annotations.steps[2]?.detail}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
});
