import React, { useEffect, useState } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { formatRemainingAccessTime } from '../utils/accessTimer';
import { formatDateTimeInTimeZone, getBrowserTimeZone, normalizeTimeZone } from '../utils/timezone';

interface TesterAccessBarProps {
  email: string;
  expiresAt: number;
  clockOffsetMs?: number;
  timezone?: string;
  onExpired: () => void;
}

export const TesterAccessBar: React.FC<TesterAccessBarProps> = ({
  email,
  expiresAt,
  clockOffsetMs = 0,
  timezone,
  onExpired,
}) => {
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const checkNow = () => {
      const current = Date.now() + clockOffsetMs;
      setNowTick(Date.now());
      if (current >= expiresAt) {
        onExpired();
      }
    };

    checkNow();
    const intervalId = setInterval(checkNow, 1000);
    return () => clearInterval(intervalId);
  }, [expiresAt, clockOffsetMs, onExpired]);

  const effectiveNow = nowTick + clockOffsetMs;
  const snapshot = formatRemainingAccessTime(expiresAt, effectiveNow);
  const activeTimezone = normalizeTimeZone(timezone, getBrowserTimeZone());

  const expiryText = formatDateTimeInTimeZone(expiresAt, activeTimezone);

  return (
    <div
      data-testid="tester-access-bar"
      className={`border-b px-4 py-2 text-xs ${
        snapshot.isExpiringSoon
          ? 'bg-amber-950/40 border-amber-500/35 text-amber-200'
          : 'bg-slate-900/70 border-slate-800 text-slate-300'
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
        <div className="flex items-center gap-2">
          {snapshot.isExpiringSoon ? (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#8b6dff] shrink-0" aria-hidden="true" />
          )}
          <span>
            Acesso de Teste Temporário (24h) · <span className="text-white font-medium">{email}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span>
            Tempo restante:{' '}
            <strong
              data-testid="tester-remaining-time"
              className={snapshot.isExpiringSoon ? 'text-amber-300' : 'text-emerald-400'}
            >
              {snapshot.formatted}
            </strong>
          </span>
          <span className="text-slate-500 hidden sm:inline">· Expira em {expiryText}</span>
        </div>
      </div>
    </div>
  );
};
