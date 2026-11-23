import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Globe2, RotateCcw } from 'lucide-react';
import {
  buildTimezoneSelectOptions,
  formatHHMMSSInTimeZone,
  formatUtcOffsetLabel,
  getBrowserTimeZone,
  getTimeZoneOffsetMinutes,
  normalizeTimeZone,
} from '../utils/timezone';

interface TimezoneSelectorProps {
  value: string;
  onChange: (nextTimezone: string) => void;
  variant?: 'bar' | 'compact';
  disabled?: boolean;
}

const REGION_ORDER = [
  'América do Sul',
  'Europa',
  'América do Norte',
  'África',
  'Ásia & Pacífico',
  'Global',
];

const LiveTimezoneClock: React.FC<{ timeZone: string; variant: 'bar' | 'compact' }> = React.memo(
  ({ timeZone, variant }) => {
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
      const id = setInterval(() => {
        setNow(new Date());
      }, 1000);
      return () => clearInterval(id);
    }, []);

    const liveClock = formatHHMMSSInTimeZone(now, timeZone);

    if (variant === 'compact') {
      return (
        <span
          data-testid="timezone-live-clock-compact"
          className="text-[11px] font-mono text-slate-400 border-l border-slate-700 pl-2 tabular-nums hidden sm:inline"
        >
          {liveClock.slice(0, 5)}
        </span>
      );
    }

    return (
      <div
        data-testid="timezone-live-clock"
        title={`Hora atual em ${timeZone}`}
        className="px-2.5 h-9 rounded-lg bg-[#0b0f19] border border-slate-800 text-xs font-mono text-emerald-300 flex items-center gap-1.5 tabular-nums shrink-0"
      >
        <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
        <span>{liveClock}</span>
      </div>
    );
  }
);

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = React.memo(
  ({ value, onChange, variant = 'bar', disabled = false }) => {
    const activeTz = normalizeTimeZone(value);
    const browserTz = useMemo(() => getBrowserTimeZone(), []);
    const options = useMemo(() => buildTimezoneSelectOptions(activeTz, new Date()), [activeTz]);
    const offsetLabel = useMemo(
      () => formatUtcOffsetLabel(getTimeZoneOffsetMinutes(activeTz, new Date())),
      [activeTz]
    );

    const groupedOptions = useMemo(() => {
      const map = new Map<string, typeof options>();
      for (const opt of options) {
        const list = map.get(opt.regionGroup) || [];
        list.push(opt);
        map.set(opt.regionGroup, list);
      }
      return REGION_ORDER.filter((group) => map.has(group)).map((group) => ({
        group,
        items: map.get(group)!,
      }));
    }, [options]);

    if (variant === 'compact') {
      return (
        <div className="inline-flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-lg px-2.5 py-1">
          <Globe2 className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <label htmlFor="nc-timezone-compact" className="sr-only">
            Fuso horário de exibição
          </label>
          <select
            id="nc-timezone-compact"
            data-testid="timezone-selector-compact"
            value={activeTz}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Fuso horário de exibição"
            className="bg-transparent text-xs font-mono font-semibold text-sky-200 focus:outline-none cursor-pointer max-w-[200px] truncate"
          >
            {groupedOptions.map(({ group, items }) => (
              <optgroup key={group} label={group} className="bg-slate-950 text-slate-300">
                {items.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-slate-950 text-white">
                    {opt.shortLabel}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <LiveTimezoneClock timeZone={activeTz} variant="compact" />
        </div>
      );
    }

    return (
      <div
        data-testid="timezone-selector-bar"
        className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 sm:px-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center shrink-0">
            <Globe2 className="w-4 h-4 text-sky-300" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="nc-timezone-select"
                className="text-xs font-bold text-white cursor-pointer"
              >
                Fuso Horário (País / Região)
              </label>
              <span
                data-testid="timezone-offset-badge"
                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30"
              >
                {offsetLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Todos os horários de entrada, virada de vela, notícias e histórico são convertidos automaticamente para este país.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 w-full lg:w-auto">
          <LiveTimezoneClock timeZone={activeTz} variant="bar" />

          <select
            id="nc-timezone-select"
            data-testid="timezone-selector"
            value={activeTz}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Selecionar fuso horário por país ou cidade"
            className="flex-1 sm:flex-initial min-w-0 sm:min-w-[270px] h-9 px-3 rounded-lg bg-[#0b0f19] border border-slate-700 hover:border-sky-500/50 focus:border-sky-400 focus:outline-none text-xs font-mono text-white cursor-pointer disabled:opacity-50"
          >
            {groupedOptions.map(({ group, items }) => (
              <optgroup key={group} label={group} className="bg-slate-950 text-slate-300">
                {items.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-slate-950 text-white">
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {activeTz !== browserTz && (
            <button
              type="button"
              onClick={() => onChange(browserTz)}
              title="Restaurar fuso horário automático do navegador"
              aria-label="Usar fuso local do dispositivo"
              className="h-9 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-sky-400" aria-hidden="true" />
              <span className="hidden sm:inline">Local</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);
