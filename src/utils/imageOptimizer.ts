/**
 * Browser-side image optimization helpers to speed up mobile/camera uploads
 * and prevent localStorage QuotaExceededError when saving analysis history.
 */

function loadImage(dataUrl: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Image load timeout'));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };
    img.src = dataUrl;
  });
}

async function resizeDataUrl(
  dataUrl: string,
  maxDimension: number,
  quality: number
): Promise<string> {
  try {
    if (typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) {
      return dataUrl;
    }
    // Keep crisp SVGs as-is when small
    if (dataUrl.startsWith('data:image/svg+xml') && dataUrl.length < 180_000) {
      return dataUrl;
    }

    const img = await loadImage(dataUrl);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    if (!origW || !origH) {
      return dataUrl;
    }

    const scale = Math.min(1, maxDimension / Math.max(origW, origH));
    // Keep crisp chart screenshots lossless when already compact so ticker text & thin wicks remain sharp
    if (scale === 1 && dataUrl.length < 650_000) {
      return dataUrl;
    }

    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;

      // Dark chart background prevents transparent PNG alpha turning black oddly
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      return compressed.length < dataUrl.length ? compressed : dataUrl;
    } finally {
      // Release GPU/bitmap backing buffer immediately
      canvas.width = 0;
      canvas.height = 0;
    }
  } catch {
    return dataUrl;
  }
}

/**
 * Compresses large smartphone camera photos or 4K chart screenshots down to max 1920px
 * for fast upload and crisp Gemini Vision recognition of small ticker tags and candle wicks.
 */
export function compressImageForAnalysis(dataUrl: string): Promise<string> {
  return resizeDataUrl(dataUrl, 1920, 0.92);
}

/**
 * Generates a lightweight thumbnail (max 320px) for localStorage history persistence
 * so storing up to 50 analyses stays safely below browser quota limits.
 */
export function createHistoryThumbnail(dataUrl: string): Promise<string> {
  return resizeDataUrl(dataUrl, 320, 0.65);
}
