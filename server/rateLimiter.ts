export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  nowFn?: () => number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly nowFn: () => number;
  private readonly buckets = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = Math.max(1000, options.windowMs);
    this.maxAttempts = Math.max(1, options.maxAttempts);
    this.nowFn = options.nowFn || (() => Date.now());
  }

  public check(key: string): RateLimitDecision {
    const now = this.nowFn();
    const cutoff = now - this.windowMs;
    const prev = this.buckets.get(key) || [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= this.maxAttempts) {
      const oldest = active[0];
      const retryAfterMs = Math.max(1000, oldest + this.windowMs - now);
      this.buckets.set(key, active);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    active.push(now);
    this.buckets.set(key, active);

    // Keep memory bounded across distinct keys
    if (this.buckets.size > 2000) {
      for (const [bucketKey, timestamps] of this.buckets) {
        if (timestamps.every((ts) => ts <= cutoff)) {
          this.buckets.delete(bucketKey);
        }
        if (this.buckets.size <= 1500) break;
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxAttempts - active.length),
      retryAfterSeconds: 0,
    };
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }
}
