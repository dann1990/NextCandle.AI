import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCheckerboardAndComputeBounds } from './logoProcessor';

test('stripCheckerboardAndComputeBounds removes neutral gray background while keeping colored shapes and white sparkles', () => {
  const width = 8;
  const height = 8;
  const rgba = new Uint8ClampedArray(width * height * 4);

  // Fill entire canvas with dark gray checkerboard (#2b2b2b and #424242)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      const shade = (x + y) % 2 === 0 ? 43 : 66;
      rgba[off] = shade;
      rgba[off + 1] = shade;
      rgba[off + 2] = shade;
      rgba[off + 3] = 255;
    }
  }

  // Draw a cyan logo candle pixel block at (3..5, 3..5)
  for (let y = 3; y <= 5; y++) {
    for (let x = 3; x <= 5; x++) {
      const off = (y * width + x) * 4;
      rgba[off] = 20;
      rgba[off + 1] = 210;
      rgba[off + 2] = 240;
      rgba[off + 3] = 255;
    }
  }

  // Draw a bright white sparkle at (6, 1) surrounded by checkerboard
  const sparkleOff = (1 * width + 6) * 4;
  rgba[sparkleOff] = 255;
  rgba[sparkleOff + 1] = 255;
  rgba[sparkleOff + 2] = 255;
  rgba[sparkleOff + 3] = 255;

  const bounds = stripCheckerboardAndComputeBounds(rgba, width, height);
  assert.ok(bounds);
  assert.equal(rgba[3], 0); // outer checkerboard pixel cleared
  assert.equal(rgba[(3 * width + 3) * 4 + 3], 255); // cyan candle preserved
  assert.equal(rgba[sparkleOff + 3], 255); // bright white sparkle preserved
  assert.equal(bounds.minX, 3);
  assert.equal(bounds.maxX, 6);
  assert.equal(bounds.minY, 1);
  assert.equal(bounds.maxY, 5);
});
