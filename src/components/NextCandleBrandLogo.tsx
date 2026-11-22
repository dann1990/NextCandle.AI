import React, { useEffect, useState } from 'react';
import { stripCheckerboardAndComputeBounds } from '../utils/logoProcessor';

export const ATTACHED_NEXTCANDLE_LOGO_PATH =
  '/assets/aistudio/Gemini_Generated_Image_lk704wlk704wlk70_22e07f9e.jfif';

let cachedCleanLogoPromise: Promise<string | null> | null = null;

function getCleanLogoDataUrl(): Promise<string | null> {
  if (cachedCleanLogoPromise) return cachedCleanLogoPromise;

  cachedCleanLogoPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          resolve(null);
          return;
        }

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const bounds = stripCheckerboardAndComputeBounds(imageData.data, w, h);
        ctx.putImageData(imageData, 0, 0);

        if (!bounds) {
          resolve(null);
          return;
        }

        const pad = 6;
        const sx = Math.max(0, bounds.minX - pad);
        const sy = Math.max(0, bounds.minY - pad);
        const sw = Math.min(w - sx, bounds.width + pad * 2);
        const sh = Math.min(h - sy, bounds.height + pad * 2);

        const cropped = document.createElement('canvas');
        cropped.width = sw;
        cropped.height = sh;
        const croppedCtx = cropped.getContext('2d');
        if (!croppedCtx) {
          resolve(null);
          return;
        }

        croppedCtx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(cropped.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = ATTACHED_NEXTCANDLE_LOGO_PATH;
  });

  return cachedCleanLogoPromise;
}

interface NextCandleBrandLogoProps {
  variant?: 'icon' | 'watermark';
  className?: string;
  alt?: string;
}

export const NextCandleBrandLogo: React.FC<NextCandleBrandLogoProps> = ({
  variant = 'icon',
  className = 'w-9 h-9',
  alt = 'Logo NextCandle',
}) => {
  const [cleanSrc, setCleanSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getCleanLogoDataUrl().then((result) => {
      if (active && result) {
        setCleanSrc(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <div
        aria-hidden={variant === 'watermark'}
        className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-amber-500/20 ${className}`}
      />
    );
  }

  return (
    <img
      src={cleanSrc || ATTACHED_NEXTCANDLE_LOGO_PATH}
      alt={variant === 'watermark' ? '' : alt}
      aria-hidden={variant === 'watermark'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-contain select-none transition-opacity duration-150 ${
        cleanSrc ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    />
  );
};
