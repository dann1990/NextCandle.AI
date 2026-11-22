export interface CroppedLogoBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function isNeutralCheckerboardGray(
  r: number,
  g: number,
  b: number,
  maxLuminance: number,
  maxSpread: number
): boolean {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return maxC <= maxLuminance && maxC - minC <= maxSpread;
}

/**
 * Removes baked dark-gray checkerboard backgrounds from raster logos while preserving
 * colored elements (cyan/blue/orange/gold) and bright white highlights (e.g. sparkles).
 * Returns tight cropped bounds around remaining opaque pixels.
 */
export function stripCheckerboardAndComputeBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): CroppedLogoBounds | null {
  const totalPixels = width * height;
  if (totalPixels <= 0 || rgba.length < totalPixels * 4) return null;

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const tryEnqueueBorder = (idx: number) => {
    if (visited[idx]) return;
    const offset = idx * 4;
    if (isNeutralCheckerboardGray(rgba[offset], rgba[offset + 1], rgba[offset + 2], 145, 22)) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    tryEnqueueBorder(x);
    tryEnqueueBorder((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    tryEnqueueBorder(y * width);
    tryEnqueueBorder(y * width + (width - 1));
  }

  // BFS flood-fill from image borders to remove outer checkerboard canvas
  while (head < tail) {
    const idx = queue[head++];
    const offset = idx * 4;
    rgba[offset + 3] = 0;

    const x = idx % width;
    const y = (idx - x) / width;

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx >= 0 && !visited[nIdx]) {
        const nOff = nIdx * 4;
        if (isNeutralCheckerboardGray(rgba[nOff], rgba[nOff + 1], rgba[nOff + 2], 145, 22)) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
  }

  // Clean enclosed neutral-gray checkerboard cavities trapped inside geometric shapes
  // while keeping saturated colors and bright white highlights untouched
  for (let idx = 0; idx < totalPixels; idx++) {
    const offset = idx * 4;
    if (rgba[offset + 3] === 0) continue;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    if (isNeutralCheckerboardGray(r, g, b, 118, 16)) {
      rgba[offset + 3] = 0;
    }
  }

  // Softly feather dark-gray edge pixels adjacent to transparency to prevent dark fringes
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const offset = idx * 4;
      if (rgba[offset + 3] === 0) continue;

      const hasTransparentNeighbor =
        rgba[(idx - 1) * 4 + 3] === 0 ||
        rgba[(idx + 1) * 4 + 3] === 0 ||
        rgba[(idx - width) * 4 + 3] === 0 ||
        rgba[(idx + width) * 4 + 3] === 0;

      if (!hasTransparentNeighbor) continue;

      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const spread = maxC - minC;

      if (maxC <= 135 && spread <= 28) {
        rgba[offset + 3] = Math.round(rgba[offset + 3] * 0.25);
      }
    }
  }

  // Compute tight bounding box of remaining visible pixels
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
