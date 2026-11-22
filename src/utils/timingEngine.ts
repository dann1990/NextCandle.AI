import { MarketEnvironment, VoteType } from '../types/trading';
import {
  convertUtcEventToTimeZone,
  formatHHMMInTimeZone,
  getTimeZoneDisplayLabel,
  getTimeZoneParts,
  isValidTimeZone,
} from './timezone';

export interface DynamicTimingInput {
  asset: string;
  timeframe: string;
  verdict: VoteType;
  keyPattern: string;
  volatilityScore: number; // 0 - 100
  confidenceScore: number; // 0 - 100
  clientTime?: string; // "HH:MM"
  utcHour?: number; // 0 - 23
  marketEnvironment?: MarketEnvironment;
  timezone?: string;
  nowMs?: number;
}

export interface DynamicTimingOutput {
  idealExpiration: string;
  expirationRationale: string;
  entryTiming: string;
  entryTrigger: string;
  entryTimingRationale: string;
  sessionLiquidity: string;
  sessionAdvisory: string;
  timezone?: string;
  timezoneLabel?: string;
}

/**
 * Automatically detects whether an asset/context belongs to OTC (synthetic/broker-fed)
 * or Open Market (real institutional orderbook & economic calendar).
 */
export function detectMarketEnvironment(asset = '', contextText = ''): MarketEnvironment {
  const combined = `${asset} ${contextText}`.toLowerCase();
  if (
    /\botc\b|\(otc\)|-otc|_otc|mercado_otc|sint[eé]tico|synthetic|volatility\s*\d+|boom\s*\d+|crash\s*\d+/i.test(
      combined
    )
  ) {
    return 'MERCADO_OTC';
  }
  return 'MERCADO_ABERTO';
}

/**
 * Normalizes an explicit trader-selected market environment toggle ('MERCADO_ABERTO' | 'MERCADO_OTC').
 * Returns undefined when omitted or unrecognized.
 */
export function normalizeExplicitMarketEnvironment(raw: unknown): MarketEnvironment | undefined {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.trim().toUpperCase();
  if (upper === 'MERCADO_OTC' || upper === 'OTC') return 'MERCADO_OTC';
  if (upper === 'MERCADO_ABERTO' || upper === 'ABERTO' || upper === 'OPEN') return 'MERCADO_ABERTO';
  return undefined;
}

/**
 * Strictly honors the active market toggle chosen by the user whenever provided,
 * falling back to automatic asset/context detection only when omitted.
 */
export function resolveForcedMarketEnvironment(
  explicitMarket: unknown,
  asset = '',
  contextText = ''
): MarketEnvironment {
  const normalized = normalizeExplicitMarketEnvironment(explicitMarket);
  if (normalized) return normalized;
  return detectMarketEnvironment(asset, contextText);
}

/**
 * Evaluates current global market session liquidity or OTC algorithmic regime
 * based on market environment, UTC hour, and asset class.
 */
export function evaluateMarketSession(
  utcHour: number | undefined,
  asset: string,
  marketEnvironment?: MarketEnvironment,
  timeZone?: string
): { sessionLiquidity: string; sessionAdvisory: string } {
  const resolvedMarket = marketEnvironment || detectMarketEnvironment(asset);
  if (resolvedMarket === 'MERCADO_OTC') {
    return {
      sessionLiquidity: 'Mercado OTC · Fluxo Algorítmico 24/7',
      sessionAdvisory:
        'Calendário econômico e sessões institucionais desconsiderados. Critérios focados em Price Action puro, padrões de repetição algorítmica e zonas de suporte/resistência.',
    };
  }

  const isCrypto = /btc|eth|sol|xrp|bnb|ada|doge|crypto|usdt/i.test(asset || '');
  if (isCrypto) {
    return {
      sessionLiquidity: 'Cripto 24/7 · Liquidez Contínua',
      sessionAdvisory:
        'Ativos cripto operam 24h; atenção redobrada em viradas de candle H4/D1 e picos de volatilidade.',
    };
  }

  const hour =
    typeof utcHour === 'number' && !Number.isNaN(utcHour)
      ? ((Math.floor(utcHour) % 24) + 24) % 24
      : new Date().getUTCHours();

  if (hour >= 12 && hour < 16) {
    return {
      sessionLiquidity: 'Alta · Sobreposição Londres / NY',
      sessionAdvisory:
        'Melhor janela institucional do dia: menor risco de falso rompimento e maior precisão direcional.',
    };
  }
  if (hour >= 7 && hour < 12) {
    return {
      sessionLiquidity: 'Alta · Sessão de Londres',
      sessionAdvisory:
        'Forte volume europeu em pares EUR/GBP/XAU; ideal para rompimentos de abertura e pullbacks limpos.',
    };
  }
  if (hour >= 16 && hour < 21) {
    const nyCloseLocal = isValidTimeZone(timeZone)
      ? (() => {
          const converted = convertUtcEventToTimeZone('19:00 UTC', timeZone);
          return `${converted.timeLocal} (${converted.offsetLabel})`;
        })()
      : '19h UTC';
    return {
      sessionLiquidity: 'Moderada · Sessão de Nova York',
      sessionAdvisory: `Fluxo americano ativo; observe perda gradual de liquidez após as ${nyCloseLocal}.`,
    };
  }
  return {
    sessionLiquidity: 'Baixa · Sessão Asiática / Rollover',
    sessionAdvisory:
      'Liquidez reduzida em Forex/Índices fora de Londres/NY: exija confluência máxima e evite mercados laterais.',
  };
}

/**
 * Converts a trading timeframe string (e.g. "M1", "M5", "M15", "H1", "H4", "D1")
 * into its equivalent duration in minutes.
 */
export function parseTimeframeToMinutes(timeframe: string): number {
  const tf = (timeframe || 'M5').trim().toUpperCase();
  const match = tf.match(/^([MHDW])(\d+)$/) || tf.match(/^(\d+)([MHDW])$/);

  if (match) {
    const isPrefixUnit = /^[MHDW]$/.test(match[1]);
    const unit = isPrefixUnit ? match[1] : match[2];
    const value = parseInt(isPrefixUnit ? match[2] : match[1], 10);
    if (!Number.isNaN(value) && value > 0) {
      if (unit === 'M') return value;
      if (unit === 'H') return value * 60;
      if (unit === 'D') return value * 1440;
      if (unit === 'W') return value * 10080;
    }
  }

  if (tf === '1M' || tf === 'M1') return 1;
  if (tf === '5M' || tf === 'M5') return 5;
  if (tf === '15M' || tf === 'M15') return 15;
  if (tf === '30M' || tf === 'M30') return 30;
  if (tf === '1H' || tf === 'H1') return 60;
  if (tf === '4H' || tf === 'H4') return 240;
  if (tf === '1D' || tf === 'D1') return 1440;

  return 5;
}

/**
 * Formats a candle duration count and timeframe into human-readable Portuguese text.
 */
export function formatExpirationDuration(candlesCount: number, tfMinutes: number): string {
  const totalMinutes = candlesCount * tfMinutes;
  const velaLabel = candlesCount === 1 ? '1 vela' : `${candlesCount} velas`;

  if (totalMinutes < 60) {
    return `${velaLabel} (${totalMinutes} min)`;
  }
  if (totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return `${velaLabel} (${hours}h)`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${velaLabel} (${hours}h ${mins}m)`;
}

/**
 * Verifies whether an AI-provided expiration string like "2 velas (10 min)" matches the
 * duration scale of the target entry timeframe (e.g. M1 = 1 min/vela, M5 = 5 min/vela).
 */
export function isExpirationCoherentWithTimeframe(idealExpiration: unknown, timeframe: string): boolean {
  if (typeof idealExpiration !== 'string') return false;
  const trimmed = idealExpiration.trim();
  if (!trimmed) return false;

  const tfMinutes = parseTimeframeToMinutes(timeframe);
  const velaMatch = trimmed.match(/(\d+)\s*vela/i);
  const minMatch = trimmed.match(/(\d+)\s*min/i);
  const hourMatch = trimmed.match(/(\d+)\s*h\b/i);

  if (!velaMatch) {
    // Reject obvious mismatched timeframes mentioned explicitly (e.g. "(M15)" when entry is M1)
    if (/\b(M1|M3|M5|M15|M30|H1|H4)\b/i.test(trimmed)) {
      const explicitTf = trimmed.match(/\b(M1|M3|M5|M15|M30|H1|H4)\b/i)?.[1];
      if (explicitTf && parseTimeframeToMinutes(explicitTf) !== tfMinutes) return false;
    }
    return true;
  }

  const candles = parseInt(velaMatch[1], 10);
  if (!Number.isFinite(candles) || candles <= 0) return false;

  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return Math.abs(mins - candles * tfMinutes) <= 1;
  }

  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return Math.abs(hours * 60 - candles * tfMinutes) <= tfMinutes;
  }

  return true;
}

/**
 * Formats total minutes from midnight as HH:MM wrapping at 24h.
 */
export function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mm = (normalized % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Parses "HH:MM" into minutes since midnight and computes the next two candle boundaries.
 */
export function computeCandleBoundaries(
  clientTime: string | undefined,
  tfMinutes: number
): { currentHHMM: string; nextBoundary: string; followingBoundary: string; minutesToNext: number } {
  let currentMinutes: number;

  const match = typeof clientTime === 'string' ? clientTime.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (match) {
    const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
    currentMinutes = h * 60 + m;
  } else {
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  // Round strictly forward to the next candle interval boundary
  const step = Math.max(1, tfMinutes);
  const nextBoundaryMin = (Math.floor(currentMinutes / step) + 1) * step;
  const followingBoundaryMin = nextBoundaryMin + step;

  return {
    currentHHMM: formatMinutesToHHMM(currentMinutes),
    nextBoundary: formatMinutesToHHMM(nextBoundaryMin),
    followingBoundary: formatMinutesToHHMM(followingBoundaryMin),
    minutesToNext: nextBoundaryMin - currentMinutes,
  };
}

/**
 * Computes exact remaining seconds to the next candle close/open boundary
 * for real-time execution timing in the Horário de Entrada tab.
 */
export function getSecondsToNextCandle(
  timeframe: string,
  now: Date = new Date(),
  timeZone?: string
): { secondsLeft: number; formattedCountdown: string; nextCandleHHMM: string } {
  const tfMinutes = parseTimeframeToMinutes(timeframe);
  const stepSeconds = Math.max(60, tfMinutes * 60);
  const parts = isValidTimeZone(timeZone)
    ? getTimeZoneParts(now, timeZone)
    : {
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
      };
  const totalSecToday = parts.hour * 3600 + parts.minute * 60 + parts.second;
  const remainder = totalSecToday % stepSeconds;
  const secondsLeft = remainder === 0 ? stepSeconds : stepSeconds - remainder;

  const nextBoundaryMin = Math.floor((totalSecToday + secondsLeft) / 60);
  const hours = Math.floor(secondsLeft / 3600);
  const mins = Math.floor((secondsLeft % 3600) / 60);
  const secs = secondsLeft % 60;

  const formattedCountdown =
    hours > 0
      ? `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return {
    secondsLeft,
    formattedCountdown,
    nextCandleHHMM: formatMinutesToHHMM(nextBoundaryMin),
  };
}

/**
 * Calculates strictly individual, non-generic Ideal Expiration and Entry Timing
 * calibrated by volatility, timeframe, price-action pattern, and temporal candle alignment.
 */
export function computeDynamicTimingInsights(input: DynamicTimingInput): DynamicTimingOutput {
  const {
    asset = 'Ativo',
    timeframe = 'M5',
    verdict,
    keyPattern = '',
    volatilityScore = 75,
    confidenceScore = 80,
    clientTime,
    utcHour,
    marketEnvironment,
    timezone,
    nowMs,
  } = input;

  const resolvedMarket = marketEnvironment || detectMarketEnvironment(asset, keyPattern);
  const tfMinutes = parseTimeframeToMinutes(timeframe);
  const patternLower = keyPattern.toLowerCase();
  const refDate = typeof nowMs === 'number' && Number.isFinite(nowMs) ? new Date(nowMs) : new Date();
  const hasExplicitTz = isValidTimeZone(timezone);
  const effectiveClientTime =
    clientTime || (hasExplicitTz ? formatHHMMInTimeZone(refDate, timezone!) : undefined);
  const boundaries = computeCandleBoundaries(effectiveClientTime, tfMinutes);
  const session = evaluateMarketSession(utcHour, asset, resolvedMarket, timezone);
  const timezoneLabel = hasExplicitTz ? getTimeZoneDisplayLabel(timezone!, refDate) : undefined;

  const isRejectionOrQuickReversal =
    /pinbar|martelo|hammer|estrela|shooting|rejei|pavio|wick|sweep|topo duplo|fundo duplo|comando|exaust[aã]o/i.test(
      patternLower
    );
  const isBreakoutOrImpulse =
    /rompimento|breakout|engolfo|marubozu|piv[oô]|impuls|repeti[cç][aã]o|simetria|altern[aâ]ncia/i.test(
      patternLower
    );
  const isPullbackOrTrend =
    /pullback|reteste|lta|ltb|canal|tend[eê]ncia|m[eé]dia|suporte|resist[eê]ncia/i.test(patternLower);
  const isConsolidationOrTrap =
    /lateral|range|doji|indecis|consolid|trap|armadilha|caixote|compress/i.test(patternLower);

  const isHighVol = volatilityScore >= 85;
  const isLowVol = volatilityScore < 65;

  // Handle AGUARDAR / Blocked entries cleanly
  if (verdict === 'AGUARDAR') {
    const expCandles = tfMinutes <= 5 ? 3 : 2;
    const minWait = formatExpirationDuration(expCandles, tfMinutes);
    const marketNote =
      resolvedMarket === 'MERCADO_OTC'
        ? 'Em Mercado OTC, exija toque limpo em suporte/resistência ou simetria algorítmica clara antes de operar.'
        : 'Em Mercado Aberto, monitore liquidez de sessão e evite falsos rompimentos ou ruído de notícias.';
    return {
      idealExpiration: `Aguardar rompimento · Ref. ${minWait}`,
      expirationRationale: `Sem gatilho ativo em ${asset} (${timeframe}). Volatilidade aparente (${volatilityScore}/100) e padrão "${keyPattern || 'Consolidação'}" elevam risco de ruído. ${marketNote}`,
      entryTiming: `Aguardar fechamento às ${boundaries.nextBoundary} (ou ${boundaries.followingBoundary})`,
      entryTrigger: 'Bloqueado · Sem Consenso ≥ 80%',
      entryTimingRationale: `Leitura temporal (${boundaries.currentHHMM}) indica ausência de confluência de 80%. Monitore o fechamento da vela atual às ${boundaries.nextBoundary} e só considere entrada se houver definição estrutural no ciclo seguinte (${boundaries.followingBoundary}).`,
      ...session,
    };
  }

  // Base candle count strictly adapted to pattern family, timeframe & volatility
  let baseCandles = 3;
  let patternRegimeLabel = 'Expansão Direcional';

  if (isRejectionOrQuickReversal && !isBreakoutOrImpulse) {
    baseCandles = tfMinutes <= 1 ? 3 : tfMinutes <= 15 ? 2 : 2;
    patternRegimeLabel =
      resolvedMarket === 'MERCADO_OTC'
        ? 'Rejeição em S/R / Exaustão OTC'
        : 'Reversão Rápida por Rejeição';
  } else if (isBreakoutOrImpulse) {
    baseCandles = tfMinutes <= 1 ? 4 : tfMinutes <= 15 ? 3 : 2;
    patternRegimeLabel =
      resolvedMarket === 'MERCADO_OTC'
        ? 'Repetição Algorítmica / Price Action Puro'
        : 'Rompimento / Impulsão de Fluxo';
  } else if (isPullbackOrTrend) {
    baseCandles = tfMinutes <= 5 ? 4 : 3;
    patternRegimeLabel = 'Continuação em Pullback Estrutural';
  } else if (isConsolidationOrTrap) {
    baseCandles = tfMinutes <= 5 ? 3 : 2;
    patternRegimeLabel = 'Saída de Compressão / Range';
  } else {
    baseCandles = tfMinutes <= 5 ? 3 : 2;
  }

  // Volatility adaptation
  let volNote = 'volatilidade equilibrada';
  if (isHighVol) {
    baseCandles = Math.max(tfMinutes <= 1 ? 2 : 1, baseCandles - 1);
    volNote = `alta volatilidade (${volatilityScore}/100), encurtando a expiração para proteger contra retração brusca`;
  } else if (isLowVol) {
    baseCandles = Math.min(6, baseCandles + 1);
    volNote = `volatilidade moderada/baixa (${volatilityScore}/100), ampliando o prazo para maturação do alvo`;
  } else {
    volNote = `volatilidade controlada (${volatilityScore}/100)`;
  }

  // Long timeframes (H1+) naturally cap candle counts tighter
  if (tfMinutes >= 60 && baseCandles > 3) {
    baseCandles = 3;
  }

  const idealExpiration = formatExpirationDuration(baseCandles, tfMinutes);
  const marketTag = resolvedMarket === 'MERCADO_OTC' ? 'Mercado OTC' : 'Mercado Aberto';
  const expirationRationale = `Calibrada individualmente para ${asset} (${timeframe} · ${marketTag}): regime de ${patternRegimeLabel} com ${volNote} indica ${idealExpiration} como janela ótima de assertividade.`;

  // Entry timing decision based on urgency, pattern type, and next candle boundary
  const isImmediateCloseTrigger = confidenceScore >= 86 || isRejectionOrQuickReversal || isBreakoutOrImpulse;

  const entryTiming = isImmediateCloseTrigger
    ? `Às ${boundaries.nextBoundary} (Abertura da próxima vela ${timeframe})`
    : `Janela ${boundaries.nextBoundary} – ${boundaries.followingBoundary} (Reteste em ${timeframe})`;

  const entryTrigger = isImmediateCloseTrigger
    ? `Virada de Vela · ${boundaries.nextBoundary}`
    : `Pullback Pós-Fechamento · ${boundaries.nextBoundary}`;

  const directionAction = verdict === 'COMPRA' ? 'compra' : 'venda';
  const entryTimingRationale = isImmediateCloseTrigger
    ? `Análise visual e temporal (${boundaries.currentHHMM} · ${marketTag}): o padrão "${keyPattern || patternRegimeLabel}" favorece execução na ${directionAction} exatamente na virada do próximo candle às ${boundaries.nextBoundary} (${timeframe}), capturando a abertura de movimento com expiração de ${idealExpiration}.`
    : `Análise visual e temporal (${boundaries.currentHHMM} · ${marketTag}): aguarde a conclusão da vela às ${boundaries.nextBoundary} e entre na ${directionAction} durante o reteste de zona até ${boundaries.followingBoundary} (${timeframe}), evitando entrar esticado com expiração de ${idealExpiration}.`;

  return {
    idealExpiration,
    expirationRationale,
    entryTiming,
    entryTrigger,
    entryTimingRationale,
    ...session,
    ...(hasExplicitTz ? { timezone: timezone!, timezoneLabel } : {}),
  };
}
