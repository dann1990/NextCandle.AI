import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRemainingAccessTime } from './accessTimer';

test('formatRemainingAccessTime formats hours, minutes, seconds and detects expiring/expired windows', () => {
  const now = 1_700_000_000_000;
  const full24h = formatRemainingAccessTime(now + 24 * 60 * 60 * 1000, now);
  assert.equal(full24h.formatted, '24h 00m 00s');
  assert.equal(full24h.isExpired, false);
  assert.equal(full24h.isExpiringSoon, false);

  const almostGone = formatRemainingAccessTime(now + (42 * 60 + 9) * 1000, now);
  assert.equal(almostGone.formatted, '00h 42m 09s');
  assert.equal(almostGone.isExpired, false);
  assert.equal(almostGone.isExpiringSoon, true);

  const expired = formatRemainingAccessTime(now - 5000, now);
  assert.equal(expired.formatted, '00h 00m 00s');
  assert.equal(expired.isExpired, true);
  assert.equal(expired.isExpiringSoon, false);
});
