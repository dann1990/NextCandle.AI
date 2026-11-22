import {
  AnalysisResult,
  AssetTimeframeStats,
  DailyBankrollProtection,
} from '../types/trading.js';
import { detectMarketEnvironment } from './timingEngine.js';

/**
 * Computes assertiveness ranking grouped by normalized Asset + Timeframe + Market Environment.
 */
export function computeAssetTimeframeRanking(records: AnalysisResult[]): AssetTimeframeStats[] {
  const map = new Map<string, AssetTimeframeStats>();

  for (const rec of records) {
    if (rec.outcome !== 'win' && rec.outcome !== 'loss') continue;
    const asset = (rec.asset || 'Ativo').trim();
    const timeframe = (rec.timeframe || 'M5').trim().toUpperCase();
    const marketEnvironment = rec.marketEnvironment || detectMarketEnvironment(asset, rec.additionalContext || '');
    const key = `${asset.toUpperCase()}__${timeframe}__${marketEnvironment}`;

    const existing = map.get(key) || {
      key,
      asset,
      timeframe,
      marketEnvironment,
      wins: 0,
      losses: 0,
      totalDecided: 0,
      winRate: 0,
    };

    if (rec.outcome === 'win') existing.wins += 1;
    else existing.losses += 1;
    existing.totalDecided = existing.wins + existing.losses;
    existing.winRate = Math.round((existing.wins / existing.totalDecided) * 100);
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.totalDecided !== a.totalDecided) return b.totalDecided - a.totalDecided;
    return b.wins - a.wins;
  });
}

function isSameLocalDay(tsA: number, dateB: Date): boolean {
  if (!Number.isFinite(tsA)) return false;
  const d = new Date(tsA);
  return (
    d.getFullYear() === dateB.getFullYear() &&
    d.getMonth() === dateB.getMonth() &&
    d.getDate() === dateB.getDate()
  );
}

/**
 * Evaluates today's wins/losses, consecutive daily loss streak, Stop Diário trigger,
 * and fixed 1% - 2% bankroll stake sizing.
 */
export function computeDailyBankrollProtection(
  records: AnalysisResult[],
  bankrollAmount: number,
  riskPercent: number,
  now: Date = new Date()
): DailyBankrollProtection {
  const safeBankroll = Number.isFinite(bankrollAmount) && bankrollAmount > 0 ? bankrollAmount : 1000;
  const clampedRisk = Math.min(2, Math.max(1, Number.isFinite(riskPercent) ? riskPercent : 1.5));

  const conservativeStake = Number((safeBankroll * 0.01).toFixed(2));
  const maxStake = Number((safeBankroll * 0.02).toFixed(2));
  const suggestedStake = Number((safeBankroll * (clampedRisk / 100)).toFixed(2));

  let todayWins = 0;
  let todayLosses = 0;
  const todayDecided: AnalysisResult[] = [];

  for (const r of records) {
    if ((r.outcome === 'win' || r.outcome === 'loss') && isSameLocalDay(r.timestamp, now)) {
      todayDecided.push(r);
      if (r.outcome === 'win') todayWins += 1;
      else todayLosses += 1;
    }
  }
  todayDecided.sort((a, b) => b.timestamp - a.timestamp);

  let todayConsecutiveLosses = 0;
  for (const rec of todayDecided) {
    if (rec.outcome === 'loss') {
      todayConsecutiveLosses += 1;
    } else {
      break;
    }
  }

  let protectionLevel: 'normal' | 'warning' | 'stop_daily' = 'normal';
  let alertTitle = 'Gestão de Banca Disciplinada (Mão Fixa 1%–2%)';
  let alertMessage = `Entrada recomendada de ${clampedRisk}% (R$ ${suggestedStake.toFixed(2)}). Hoje: ${todayWins}W / ${todayLosses}L.`;

  if (todayConsecutiveLosses >= 3 || todayLosses >= 3) {
    protectionLevel = 'stop_daily';
    alertTitle = `STOP DIÁRIO ATINGIDO (${todayConsecutiveLosses >= 3 ? `${todayConsecutiveLosses} Loss seguidos` : `${todayLosses} Loss no dia`})`;
    alertMessage =
      'Limite de proteção diária alcançado. Encerre as operações de hoje para preservar sua banca contra viés emocional e drawdown.';
  } else if (todayConsecutiveLosses === 2 || todayLosses === 2) {
    protectionLevel = 'warning';
    alertTitle = `Alerta de Proteção (${todayConsecutiveLosses === 2 ? '2 Loss seguidos' : '2 Loss hoje'})`;
    alertMessage = `Atenção redobrada: reduza a mão para o mínimo conservador de 1% (R$ ${conservativeStake.toFixed(2)}) e opere apenas confluências A+.`;
  }

  return {
    bankrollAmount: safeBankroll,
    riskPercent: clampedRisk,
    suggestedStake,
    conservativeStake,
    maxStake,
    todayWins,
    todayLosses,
    todayConsecutiveLosses,
    protectionLevel,
    alertTitle,
    alertMessage,
  };
}

/**
 * Validates and sanitizes raw parsed localStorage history so corrupt or partial records
 * cannot trigger runtime crashes during dashboard or drawer rendering.
 */
export function sanitizeStoredHistory(raw: unknown): AnalysisResult[] {
  if (!Array.isArray(raw)) return [];

  const sanitized: AnalysisResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<AnalysisResult>;
    if (typeof rec.id !== 'string' || !rec.id.trim()) continue;
    if (!rec.verdict || typeof rec.verdict !== 'object') continue;

    const vote = rec.verdict.verdict;
    if (vote !== 'COMPRA' && vote !== 'VENDA' && vote !== 'AGUARDAR') continue;

    const agents = Array.isArray(rec.agents)
      ? rec.agents.filter(
          (a) =>
            a &&
            typeof a === 'object' &&
            typeof a.id === 'string' &&
            (a.vote === 'COMPRA' || a.vote === 'VENDA' || a.vote === 'AGUARDAR')
        )
      : [];

    const clampMetric = (val: unknown, fallback = 75) =>
      typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(100, Math.round(val))) : fallback;

    const rm = rec.radarMetrics || ({} as AnalysisResult['radarMetrics']);
    const outcome = rec.outcome === 'win' || rec.outcome === 'loss' ? rec.outcome : 'pending';

    sanitized.push({
      ...(rec as AnalysisResult),
      id: rec.id,
      timestamp: typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp) ? rec.timestamp : Date.now(),
      asset: typeof rec.asset === 'string' && rec.asset.trim() ? rec.asset : 'Ativo',
      timeframe: typeof rec.timeframe === 'string' && rec.timeframe.trim() ? rec.timeframe : 'M5',
      agents,
      radarMetrics: {
        priceAction: clampMetric(rm.priceAction, 75),
        technicals: clampMetric(rm.technicals, 75),
        flowVolatility: clampMetric(rm.flowVolatility, 75),
        predictiveML: clampMetric(rm.predictiveML, 75),
        riskManagement: clampMetric(rm.riskManagement, 75),
      },
      candles: Array.isArray(rec.candles) ? rec.candles : [],
      levels: Array.isArray(rec.levels) ? rec.levels : [],
      outcome,
    });

    if (sanitized.length >= 50) break;
  }

  return sanitized;
}

/**
 * Safely normalizes stored bankroll preferences from localStorage.
 */
export function sanitizeBankrollSettings(raw: unknown): {
  bankrollAmount: number;
  riskPercent: 1 | 1.5 | 2;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { bankrollAmount?: unknown; riskPercent?: unknown };
  if (typeof obj.bankrollAmount !== 'number' || !Number.isFinite(obj.bankrollAmount) || obj.bankrollAmount < 10) {
    return null;
  }
  const riskPercent = obj.riskPercent === 1 || obj.riskPercent === 2 ? obj.riskPercent : 1.5;
  return {
    bankrollAmount: Number(obj.bankrollAmount.toFixed(2)),
    riskPercent,
  };
}

