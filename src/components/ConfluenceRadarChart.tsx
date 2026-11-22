import React, { useMemo } from 'react';
import { RadarMetrics } from '../types/trading';
import { Target } from 'lucide-react';

interface ConfluenceRadarChartProps {
  metrics: RadarMetrics;
}

const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = SIZE * 0.38;
const NUM_AXES = 5;
const ANGLE_SLICE = (Math.PI * 2) / NUM_AXES;
const GRID_LEVELS = [0.2, 0.4, 0.6, 0.8, 1.0];

const getCoordinates = (axisIndex: number, value: number) => {
  const angle = axisIndex * ANGLE_SLICE - Math.PI / 2;
  const r = (value / 100) * RADIUS;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
};

const STATIC_SPOKES = Array.from({ length: NUM_AXES }, (_, i) => {
  const angle = i * ANGLE_SLICE - Math.PI / 2;
  return {
    x2: CENTER + RADIUS * Math.cos(angle),
    y2: CENTER + RADIUS * Math.sin(angle),
  };
});

const STATIC_GRID_POLYGONS = GRID_LEVELS.map((level) => ({
  level,
  points: Array.from({ length: NUM_AXES }, (_, i) => {
    const angle = i * ANGLE_SLICE - Math.PI / 2;
    const x = CENTER + RADIUS * level * Math.cos(angle);
    const y = CENTER + RADIUS * level * Math.sin(angle);
    return `${x},${y}`;
  }).join(' '),
}));

export const ConfluenceRadarChart: React.FC<ConfluenceRadarChartProps> = React.memo(({ metrics }) => {
  const { dataCoords, points, avgScore, labelCoords } = useMemo(() => {
    const computedAxes = [
      { key: 'priceAction', label: 'Price Action', value: metrics.priceAction || 75 },
      { key: 'technicals', label: 'Indicadores', value: metrics.technicals || 75 },
      { key: 'flowVolatility', label: 'Fluxo / Volatilidade', value: metrics.flowVolatility || 75 },
      { key: 'predictiveML', label: 'Preditivo ML', value: metrics.predictiveML || 75 },
      { key: 'riskManagement', label: 'Gestão de Risco', value: metrics.riskManagement || 75 },
    ];

    const coords = computedAxes.map((a, i) => getCoordinates(i, a.value));
    const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const avg = Math.round(computedAxes.reduce((acc, curr) => acc + curr.value, 0) / computedAxes.length);
    const labels = computedAxes.map((a, i) => {
      const angle = i * ANGLE_SLICE - Math.PI / 2;
      const labelRadius = RADIUS + 22;
      return {
        label: a.label,
        value: a.value,
        lx: CENTER + labelRadius * Math.cos(angle),
        ly: CENTER + labelRadius * Math.sin(angle) + 3,
      };
    });

    return { dataCoords: coords, points: polyPoints, avgScore: avg, labelCoords: labels };
  }, [metrics]);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Radar de Confluência Multiagente
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {avgScore}% Alinhamento
          </span>
        </div>

        {/* SVG Radar */}
        <div className="relative flex items-center justify-center py-2 overflow-hidden">
          <svg
            viewBox="-62 -20 424 340"
            className="w-full max-w-[360px] h-auto mx-auto"
            role="img"
            aria-label="Radar de Confluência Multiagente"
          >
            {/* Background concentric polygons (20%, 40%, 60%, 80%, 100%) */}
            {STATIC_GRID_POLYGONS.map((grid, lIdx) => (
              <polygon
                key={lIdx}
                points={grid.points}
                fill={grid.level === 1.0 ? 'rgba(15, 23, 42, 0.6)' : 'none'}
                stroke="#334155"
                strokeWidth={grid.level === 0.8 ? '1.5' : '1'}
                strokeDasharray={grid.level === 0.8 ? '4,4' : undefined}
              />
            ))}

            {/* Axis spokes from center to perimeter */}
            {STATIC_SPOKES.map((spoke, i) => (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={spoke.x2}
                y2={spoke.y2}
                stroke="#334155"
                strokeWidth="1"
              />
            ))}

            {/* Data Polygon */}
            <polygon
              points={points}
              fill="rgba(16, 185, 129, 0.25)"
              stroke="#10b981"
              strokeWidth="2.5"
            />

            {/* Data Points */}
            {dataCoords.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r="4"
                fill="#10b981"
                stroke="#0b0f19"
                strokeWidth="2"
              />
            ))}

            {/* Labels */}
            {labelCoords.map((lbl, i) => (
              <text
                key={i}
                x={lbl.lx}
                y={lbl.ly}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="monospace"
                className="select-none"
              >
                {lbl.label} ({lbl.value}%)
              </text>
            ))}
          </svg>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
        <p>
          O radar exibe a simetria de validação. Quanto mais expansivo o polígono verde, maior a blindagem estatística contra ruído.
        </p>
      </div>
    </div>
  );
});
