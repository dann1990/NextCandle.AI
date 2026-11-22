import { AnalysisResult } from '../types/trading';

export const TIMEZONE_STORAGE_KEY = 'nextcandle_timezone_v1';
export const DEFAULT_FALLBACK_TIMEZONE = 'America/Sao_Paulo';

export interface TimezoneOption {
  id: string;
  city: string;
  country: string;
  regionGroup: 'América do Sul' | 'Europa' | 'América do Norte' | 'África' | 'Ásia & Pacífico' | 'Global';
}

export const PRESET_TIMEZONES: TimezoneOption[] = [
  { id: 'America/Sao_Paulo', city: 'Brasília / São Paulo', country: 'Brasil', regionGroup: 'América do Sul' },
  { id: 'America/Manaus', city: 'Manaus', country: 'Brasil', regionGroup: 'América do Sul' },
  { id: 'America/Rio_Branco', city: 'Rio Branco', country: 'Brasil', regionGroup: 'América do Sul' },
  { id: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', country: 'Argentina', regionGroup: 'América do Sul' },
  { id: 'America/Santiago', city: 'Santiago', country: 'Chile', regionGroup: 'América do Sul' },
  { id: 'America/Bogota', city: 'Bogotá / Lima', country: 'Colômbia / Peru', regionGroup: 'América do Sul' },
  { id: 'America/Mexico_City', city: 'Cidade do México', country: 'México', regionGroup: 'América do Sul' },
  { id: 'Europe/Lisbon', city: 'Lisboa', country: 'Portugal', regionGroup: 'Europa' },
  { id: 'Europe/London', city: 'Londres', country: 'Reino Unido', regionGroup: 'Europa' },
  { id: 'Europe/Madrid', city: 'Madri / Paris / Berlim', country: 'União Europeia', regionGroup: 'Europa' },
  { id: 'Europe/Zurich', city: 'Zurique', country: 'Suíça', regionGroup: 'Europa' },
  { id: 'America/New_York', city: 'Nova York', country: 'EUA', regionGroup: 'América do Norte' },
  { id: 'America/Chicago', city: 'Chicago', country: 'EUA', regionGroup: 'América do Norte' },
  { id: 'America/Los_Angeles', city: 'Los Angeles', country: 'EUA', regionGroup: 'América do Norte' },
  { id: 'Africa/Luanda', city: 'Luanda', country: 'Angola', regionGroup: 'África' },
  { id: 'Africa/Maputo', city: 'Maputo', country: 'Moçambique', regionGroup: 'África' },
  { id: 'Asia/Dubai', city: 'Dubai', country: 'Emirados Árabes', regionGroup: 'Ásia & Pacífico' },
  { id: 'Asia/Singapore', city: 'Singapura', country: 'Singapura', regionGroup: 'Ásia & Pacífico' },
  { id: 'Asia/Tokyo', city: 'Tóquio', country: 'Japão', regionGroup: 'Ásia & Pacífico' },
  { id: 'Australia/Sydney', city: 'Sydney', country: 'Austrália', regionGroup: 'Ásia & Pacífico' },
  { id: 'UTC', city: 'Tempo Universal (UTC)', country: 'Internacional', regionGroup: 'Global' },
];

export interface TimeZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Checks whether an arbitrary string is a valid IANA time zone identifier.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the host browser's detected IANA time zone, falling back to America/Sao_Paulo.
 */
export function getBrowserTimeZone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(detected)) return detected;
  } catch {
    // Ignore Intl errors in restricted runtimes
  }
  return DEFAULT_FALLBACK_TIMEZONE;
}

/**
 * Normalizes a candidate time zone string to a valid IANA identifier.
 */
export function normalizeTimeZone(raw: unknown, fallback = DEFAULT_FALLBACK_TIMEZONE): string {
  if (isValidTimeZone(raw)) return raw.trim();
  if (isValidTimeZone(fallback)) return fallback;
  return DEFAULT_FALLBACK_TIMEZONE;
}

/**
 * Extracts calendar and clock components for a Date strictly inside the given IANA time zone.
 */
export function getTimeZoneParts(date: Date, timeZone: string): TimeZoneParts {
  const tz = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      const parsed = parseInt(part.value, 10);
      if (Number.isFinite(parsed)) {
        lookup[part.type] = parsed;
      }
    }
  }

  return {
    year: lookup.year ?? date.getUTCFullYear(),
    month: lookup.month ?? date.getUTCMonth() + 1,
    day: lookup.day ?? date.getUTCDate(),
    hour: (lookup.hour ?? date.getUTCHours()) % 24,
    minute: lookup.minute ?? date.getUTCMinutes(),
    second: lookup.second ?? date.getUTCSeconds(),
  };
}

/**
 * Computes exact signed offset from UTC in minutes for an IANA time zone at a given instant (DST-aware).
 * Example: America/Sao_Paulo -> -180, Europe/Lisbon (winter) -> 0, Asia/Tokyo -> +540, Asia/Kolkata -> +330.
 */
export function getTimeZoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  const tz = normalizeTimeZone(timeZone);
  if (tz === 'UTC' || tz === 'Etc/UTC') return 0;

  const p = getTimeZoneParts(date, tz);
  const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const wholeSecondsUtcMs = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtcMs - wholeSecondsUtcMs) / 60000);
}

/**
 * Formats an offset in minutes as a compact UTC label (e.g., "UTC-3", "UTC+0", "UTC+5:30").
 */
export function formatUtcOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC+0';
  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(Math.round(offsetMinutes));
  const hrs = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins === 0
    ? `UTC${sign}${hrs}`
    : `UTC${sign}${hrs}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Returns "HH:MM" formatted in the selected time zone.
 */
export function formatHHMMInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`;
}

/**
 * Returns "HH:MM:SS" formatted in the selected time zone.
 */
export function formatHHMMSSInTimeZone(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.hour.toString().padStart(2, '0')}:${parts.minute
    .toString()
    .padStart(2, '0')}:${parts.second.toString().padStart(2, '0')}`;
}

/**
 * Formats an epoch timestamp in pt-BR strictly in the selected time zone.
 */
export function formatDateTimeInTimeZone(
  timestampMs: number,
  timeZone: string,
  includeYear = false
): string {
  if (!Number.isFinite(timestampMs)) return includeYear ? '--/--/---- --:--' : '--/-- --:--';
  const tz = normalizeTimeZone(timeZone);
  return new Date(timestampMs).toLocaleString('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Builds a concise human-readable label like "UTC-3 · Brasília / São Paulo (Brasil)".
 */
export function getTimeZoneDisplayLabel(
  timeZone: string,
  date: Date = new Date(),
  includeCountry = false
): string {
  const tz = normalizeTimeZone(timeZone);
  const offsetLabel = formatUtcOffsetLabel(getTimeZoneOffsetMinutes(tz, date));
  const preset = PRESET_TIMEZONES.find((item) => item.id === tz);
  if (preset) {
    return includeCountry
      ? `${offsetLabel} · ${preset.city} (${preset.country})`
      : `${offsetLabel} · ${preset.city}`;
  }
  const cityName = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
  return `${offsetLabel} · ${cityName}`;
}

/**
 * Builds preset list guaranteed to include the active timezone if it isn't in PRESET_TIMEZONES.
 */
export function buildTimezoneSelectOptions(activeTimezone: string, date: Date = new Date()): Array<{
  id: string;
  label: string;
  shortLabel: string;
  offsetLabel: string;
  regionGroup: string;
}> {
  const normalized = normalizeTimeZone(activeTimezone);
  const hasPreset = PRESET_TIMEZONES.some((p) => p.id === normalized);
  const list: TimezoneOption[] = hasPreset
    ? PRESET_TIMEZONES
    : [
        {
          id: normalized,
          city: normalized.split('/').pop()?.replace(/_/g, ' ') || normalized,
          country: 'Fuso Detectado',
          regionGroup: 'Global',
        },
        ...PRESET_TIMEZONES,
      ];

  return list.map((item) => {
    const offsetLabel = formatUtcOffsetLabel(getTimeZoneOffsetMinutes(item.id, date));
    return {
      id: item.id,
      offsetLabel,
      shortLabel: `${offsetLabel} · ${item.city}`,
      label: `${offsetLabel} · ${item.city} (${item.country})`,
      regionGroup: item.regionGroup,
    };
  });
}

/**
 * Shifts a 24h "HH:MM" clock value by signed deltaMinutes, wrapping cleanly around midnight.
 */
export function shiftHHMM(hhmm: string, deltaMinutes: number): string {
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return hhmm;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return hhmm;

  const shifted = (((h * 60 + m + Math.round(deltaMinutes)) % 1440) + 1440) % 1440;
  const outH = Math.floor(shifted / 60)
    .toString()
    .padStart(2, '0');
  const outM = (shifted % 60).toString().padStart(2, '0');
  return `${outH}:${outM}`;
}

/**
 * Safely shifts all 24-hour clock timestamps ("HH:MM") inside natural language strings
 * by deltaMinutes without altering Risk:Reward ratios (e.g. "1:2.5", "1:15", "R:R 10:20").
 */
export function shiftClockTimesInText(text: string | undefined, deltaMinutes: number): string {
  if (!text || !Number.isFinite(deltaMinutes) || Math.round(deltaMinutes) === 0) {
    return text || '';
  }

  return text.replace(/(?<![\d.:])([01]\d|2[0-3]):([0-5]\d)(?!(?:\.\d|\d))/g, (full, hh, mm, offset) => {
    const prefix = text.slice(Math.max(0, offset - 12), offset);
    if (/(?:R:R|risco|retorno|ratio)\s*$/i.test(prefix)) {
      return full;
    }
    return shiftHHMM(`${hh}:${mm}`, deltaMinutes);
  });
}

/**
 * Checks whether an AI-generated entryTiming text contains a clock time ("HH:MM")
 * reasonably close to the trader's current time in their selected timezone.
 * Helps detect and override when Vision accidentally echoes the broker screenshot's raw clock.
 */
export function isEntryClockNearCurrentTime(
  text: unknown,
  currentHHMM: string,
  maxAheadMinutes = 40,
  maxBehindMinutes = 5
): boolean {
  if (typeof text !== 'string') return false;
  const clockMatch = text.match(/(?<![\d.])([01]\d|2[0-3]):([0-5]\d)(?![\d.])/);
  const nowMatch = currentHHMM.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!clockMatch || !nowMatch) return false;

  const entryTotal = parseInt(clockMatch[1], 10) * 60 + parseInt(clockMatch[2], 10);
  const nowTotal = parseInt(nowMatch[1], 10) * 60 + parseInt(nowMatch[2], 10);

  // Shortest signed circular difference in [-720, +720]
  let diff = entryTotal - nowTotal;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;

  return diff >= -maxBehindMinutes && diff <= maxAheadMinutes;
}

/**
 * Converts a UTC event timestamp (or "HH:MM UTC" fallback string) to the user's selected time zone.
 */
export function convertUtcEventToTimeZone(
  timeUtc: string,
  targetTimezone: string,
  timestampMs?: number
): { timeLocal: string; offsetLabel: string } {
  const tz = normalizeTimeZone(targetTimezone);
  const refDate = typeof timestampMs === 'number' && Number.isFinite(timestampMs) ? new Date(timestampMs) : new Date();
  const offsetMinutes = getTimeZoneOffsetMinutes(tz, refDate);
  const offsetLabel = formatUtcOffsetLabel(offsetMinutes);

  if (typeof timestampMs === 'number' && Number.isFinite(timestampMs)) {
    return {
      timeLocal: formatHHMMInTimeZone(refDate, tz),
      offsetLabel,
    };
  }

  const match = (timeUtc || '').match(/([01]?\d|2[0-3]):([0-5]\d)/);
  if (match) {
    const padded = `${match[1].padStart(2, '0')}:${match[2]}`;
    return {
      timeLocal: shiftHHMM(padded, offsetMinutes),
      offsetLabel,
    };
  }

  return {
    timeLocal: timeUtc || '--:--',
    offsetLabel,
  };
}

/**
 * Dynamically converts all entry and analysis times of an existing AnalysisResult
 * from its origin timezone into targetTimezone whenever the user changes the timezone selector.
 */
export function convertAnalysisForTimezone(
  analysis: AnalysisResult,
  targetTimezone: string
): AnalysisResult {
  const targetTz = normalizeTimeZone(targetTimezone);
  const refDate = Number.isFinite(analysis.timestamp) ? new Date(analysis.timestamp) : new Date();
  const originTz = normalizeTimeZone(
    analysis.timezone || analysis.insights?.timezone || getBrowserTimeZone()
  );

  const originOffset = getTimeZoneOffsetMinutes(originTz, refDate);
  const targetOffset = getTimeZoneOffsetMinutes(targetTz, refDate);
  const deltaMinutes = targetOffset - originOffset;
  const targetOffsetLabel = formatUtcOffsetLabel(targetOffset);
  const targetDisplayLabel = getTimeZoneDisplayLabel(targetTz, refDate);

  const nextInsights = analysis.insights
    ? {
        ...analysis.insights,
        entryTiming: shiftClockTimesInText(analysis.insights.entryTiming, deltaMinutes),
        entryTrigger: shiftClockTimesInText(analysis.insights.entryTrigger, deltaMinutes),
        entryTimingRationale: shiftClockTimesInText(
          analysis.insights.entryTimingRationale,
          deltaMinutes
        ),
        sessionAdvisory: shiftClockTimesInText(analysis.insights.sessionAdvisory, deltaMinutes),
        timezone: targetTz,
        timezoneLabel: targetDisplayLabel,
      }
    : undefined;

  const nextVisualAnnotations = analysis.visualAnnotations
    ? {
        ...analysis.visualAnnotations,
        triggerPoint: {
          ...analysis.visualAnnotations.triggerPoint,
          timingLabel: shiftClockTimesInText(
            analysis.visualAnnotations.triggerPoint.timingLabel,
            deltaMinutes
          ),
        },
        steps: Array.isArray(analysis.visualAnnotations.steps)
          ? analysis.visualAnnotations.steps.map((step) => ({
              ...step,
              detail: shiftClockTimesInText(step.detail, deltaMinutes),
            }))
          : [],
      }
    : undefined;

  // Also refresh NY cutoff advisory / economic calendar event clocks into targetTz when present
  const nextGuardrails = analysis.guardrails
    ? {
        ...analysis.guardrails,
        economicCalendar: analysis.guardrails.economicCalendar
          ? {
              ...analysis.guardrails.economicCalendar,
              upcomingEvents: Array.isArray(analysis.guardrails.economicCalendar.upcomingEvents)
                ? analysis.guardrails.economicCalendar.upcomingEvents.map((ev) => ({
                    ...ev,
                    timeUtc: `${convertUtcEventToTimeZone(ev.timeUtc, targetTz, ev.timestampMs).timeLocal} (${targetOffsetLabel})`,
                  }))
                : undefined,
            }
          : analysis.guardrails.economicCalendar,
      }
    : undefined;

  return {
    ...analysis,
    timezone: targetTz,
    ...(nextInsights ? { insights: nextInsights } : {}),
    ...(nextVisualAnnotations ? { visualAnnotations: nextVisualAnnotations } : {}),
    ...(nextGuardrails ? { guardrails: nextGuardrails } : {}),
  };
}
