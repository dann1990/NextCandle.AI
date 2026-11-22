import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { EconomicCalendarCheck, EconomicNewsEvent, MarketEnvironment } from '../src/types/trading.js';
import { extractJsonObject } from '../src/utils/consensusEngine.js';
import { evaluateEconomicNewsBlackout } from '../src/utils/riskGuardrails.js';

const CALENDAR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FOREX_FACTORY_FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

interface CachedCalendar {
  fetchedAt: number;
  events: EconomicNewsEvent[];
  sources: Array<{ title: string; uri: string }>;
}

let calendarCache: CachedCalendar | null = null;
let calendarFetchInFlight: Promise<{
  events: EconomicNewsEvent[];
  sources: Array<{ title: string; uri: string }>;
}> | null = null;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function formatUtcTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function normalizeImpact(raw: unknown): 'High' | 'Medium' | 'Low' {
  const s = String(raw || '').toLowerCase();
  if (/high|alto|red|3/.test(s)) return 'High';
  if (/med|m[eé]dio|orange|2/.test(s)) return 'Medium';
  return 'Low';
}

async function fetchDirectForexFactoryFeed(): Promise<EconomicNewsEvent[] | null> {
  try {
    const response = await fetch(FOREX_FACTORY_FEED_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NextCandleAI-Terminal/1.0',
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!response.ok) return null;
    const raw = await response.json();
    if (!Array.isArray(raw)) return null;

    const nowMs = Date.now();
    const events: EconomicNewsEvent[] = [];

    for (const item of raw) {
      if (!item || !item.date || !item.title || !item.country) continue;
      const timestampMs = Date.parse(String(item.date));
      if (!Number.isFinite(timestampMs)) continue;

      const impact = normalizeImpact(item.impact);
      if (impact !== 'High' && impact !== 'Medium') continue;

      events.push({
        title: String(item.title).trim(),
        currency: String(item.country).trim().toUpperCase(),
        impact,
        timeUtc: formatUtcTime(timestampMs),
        timestampMs,
        minutesDelta: Math.round((timestampMs - nowMs) / 60_000),
        source: 'ForexFactory Live Feed',
      });
    }

    return events;
  } catch (err: any) {
    console.warn('Feed direto ForexFactory indisponível:', err?.message || err);
    return null;
  }
}

async function fetchCalendarViaGeminiSearch(
  aiClient: GoogleGenAI
): Promise<{ events: EconomicNewsEvent[]; sources: Array<{ title: string; uri: string }> }> {
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const utcTime = now.toISOString().slice(11, 16);

  const prompt = `Search the live economic calendar for TODAY (${isoDate}, current UTC time ${utcTime}).
List all HIGH-IMPACT macroeconomic news events scheduled for today affecting major currencies (USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD) such as CPI, NFP, FOMC, Interest Rate Decision, ECB, BOE, GDP, Unemployment, Retail Sales, PMI.
Return strictly valid JSON (no markdown fences) in this format:
{
  "events": [
    {
      "title": "US CPI m/m",
      "currency": "USD",
      "impact": "High",
      "isoTimestampUtc": "${isoDate}T12:30:00Z"
    }
  ]
}`;

  const response: any = await withTimeout(
    aiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    }),
    9000,
    'Timeout na busca de calendário econômico'
  );

  const sources: Array<{ title: string; uri: string }> = [];
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const ch of chunks) {
      if (ch?.web?.uri && /^https?:\/\//i.test(String(ch.web.uri))) {
        sources.push({
          title: String(ch.web.title || 'Fonte Econômica Verificada').slice(0, 120),
          uri: String(ch.web.uri),
        });
      }
    }
  }

  const events: EconomicNewsEvent[] = [];
  if (response?.text) {
    const parsed = extractJsonObject(response.text);
    const list = Array.isArray(parsed?.events) ? parsed.events : [];
    const nowMs = Date.now();
    for (const item of list) {
      const ts = Date.parse(String(item.isoTimestampUtc || ''));
      if (!Number.isFinite(ts) || !item.title || !item.currency) continue;
      events.push({
        title: String(item.title).trim(),
        currency: String(item.currency).trim().toUpperCase(),
        impact: normalizeImpact(item.impact || 'High'),
        timeUtc: formatUtcTime(ts),
        timestampMs: ts,
        minutesDelta: Math.round((ts - nowMs) / 60_000),
        source: 'Google Search Grounding',
      });
    }
  }

  return { events, sources: sources.slice(0, 4) };
}

function refreshEventDeltas(events: EconomicNewsEvent[], nowMs = Date.now()): EconomicNewsEvent[] {
  return events.map((ev) => ({
    ...ev,
    minutesDelta: Math.round((ev.timestampMs - nowMs) / 60_000),
  }));
}

export async function getLiveEconomicEvents(
  aiClient: GoogleGenAI | null,
  forceRefresh = false
): Promise<{ events: EconomicNewsEvent[]; sources: Array<{ title: string; uri: string }> }> {
  const nowMs = Date.now();

  if (!forceRefresh && calendarCache && nowMs - calendarCache.fetchedAt < CALENDAR_CACHE_TTL_MS) {
    return { events: refreshEventDeltas(calendarCache.events, nowMs), sources: calendarCache.sources };
  }

  if (calendarFetchInFlight && !forceRefresh) {
    const shared = await calendarFetchInFlight;
    return { events: refreshEventDeltas(shared.events), sources: shared.sources };
  }

  const fetchPromise = (async () => {
    const fetchTimeMs = Date.now();
    const ffEvents = await fetchDirectForexFactoryFeed();
    if (ffEvents !== null) {
      const sources = [{ title: 'ForexFactory Economic Calendar Feed', uri: 'https://www.forexfactory.com/calendar' }];
      calendarCache = { fetchedAt: fetchTimeMs, events: ffEvents, sources };
      return { events: refreshEventDeltas(ffEvents, fetchTimeMs), sources };
    }

    if (aiClient) {
      try {
        const grounded = await fetchCalendarViaGeminiSearch(aiClient);
        calendarCache = { fetchedAt: fetchTimeMs, events: grounded.events, sources: grounded.sources };
        return { events: refreshEventDeltas(grounded.events, fetchTimeMs), sources: grounded.sources };
      } catch {
        // Fall back gracefully to cached events if Search Grounding hits rate limit or timeout
      }
    }

    return {
      events: refreshEventDeltas(calendarCache?.events || [], fetchTimeMs),
      sources: calendarCache?.sources || [],
    };
  })();

  calendarFetchInFlight = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    if (calendarFetchInFlight === fetchPromise) {
      calendarFetchInFlight = null;
    }
  }
}

/**
 * Evaluates real economic calendar exposure for Open Market vs exempt OTC Market.
 */
export async function getEconomicCalendarStatus(input: {
  asset: string;
  marketEnvironment: MarketEnvironment;
  aiClient: GoogleGenAI | null;
  nowMs?: number;
}): Promise<EconomicCalendarCheck> {
  if (input.marketEnvironment === 'MERCADO_OTC') {
    return evaluateEconomicNewsBlackout({
      asset: input.asset,
      marketEnvironment: 'MERCADO_OTC',
      events: [],
      nowMs: input.nowMs,
    });
  }

  const { events, sources } = await getLiveEconomicEvents(input.aiClient);
  return evaluateEconomicNewsBlackout({
    asset: input.asset,
    marketEnvironment: 'MERCADO_ABERTO',
    events,
    nowMs: input.nowMs,
    sources,
  });
}
