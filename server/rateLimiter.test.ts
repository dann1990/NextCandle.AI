import test from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowRateLimiter } from './rateLimiter.js';

test('SlidingWindowRateLimiter allows up to maxAttempts within window and blocks excess attempts with retryAfter', () => {
  let fakeNow = 1_700_000_000_000;
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 60_000,
    maxAttempts: 3,
    nowFn: () => fakeNow,
  });

  const r1 = limiter.check('127.0.0.1');
  const r2 = limiter.check('127.0.0.1');
  const r3 = limiter.check('127.0.0.1');
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  const blocked = limiter.check('127.0.0.1');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 60);

  // Separate client key remains unaffected
  assert.equal(limiter.check('10.0.0.5').allowed, true);

  // Advance past window -> attempts expire cleanly
  fakeNow += 60_001;
  const afterWindow = limiter.check('127.0.0.1');
  assert.equal(afterWindow.allowed, true);
  assert.equal(afterWindow.remaining, 2);
});

test('SlidingWindowRateLimiter reset clears attempts immediately upon successful login', () => {
  let fakeNow = 1_700_000_000_000;
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 60_000,
    maxAttempts: 2,
    nowFn: () => fakeNow,
  });

  assert.equal(limiter.check('user-ip').allowed, true);
  assert.equal(limiter.check('user-ip').allowed, true);
  assert.equal(limiter.check('user-ip').allowed, false);

  limiter.reset('user-ip');
  const afterReset = limiter.check('user-ip');
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, 1);
});
