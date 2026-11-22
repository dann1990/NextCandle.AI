export interface RemainingAccessSnapshot {
  remainingMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export function formatRemainingAccessTime(
  expiresAt: number,
  now: number = Date.now()
): RemainingAccessSnapshot {
  const remainingMs = Math.max(0, expiresAt - now);
  const isExpired = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;

  return {
    remainingMs,
    hours,
    minutes,
    seconds,
    formatted,
    isExpired,
    isExpiringSoon: !isExpired && remainingMs <= 60 * 60 * 1000,
  };
}
