/** Images : passage par le proxy local + extraction de la couleur dominante. */

export function imgUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  return `/img?u=${encodeURIComponent(url)}`;
}

/** Dégradé génératif de secours quand un anime n'a pas d'image. */
export function fallbackArt(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `radial-gradient(120% 90% at 80% 10%, hsl(${hue} 70% 55% / .9), transparent 60%),
          radial-gradient(90% 80% at 10% 100%, hsl(${(hue + 60) % 360} 60% 35%), transparent 70%),
          hsl(${(hue + 200) % 360} 25% 12%)`;
}

export type RGB = [number, number, number];
const DEFAULT_TINT: RGB = [255, 106, 61];
const colorCache = new Map<string, Promise<RGB>>();

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Couleur la plus « vivante » de l'image, ramenée à une luminosité lisible
 * sur fond sombre. Sert à teinter la page de chaque anime.
 */
export function dominantColor(url: string | null): Promise<RGB> {
  const src = imgUrl(url);
  if (!src) return Promise.resolve(DEFAULT_TINT);
  const cached = colorCache.get(src);
  if (cached) return cached;

  const job = new Promise<RGB>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 40;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(DEFAULT_TINT);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Histogramme par teinte, pondéré par la saturation.
        const buckets = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < data.length; i += 4) {
          const rgb: RGB = [data[i]!, data[i + 1]!, data[i + 2]!];
          const [hh, s, l] = rgbToHsl(rgb);
          if (l < 0.12 || l > 0.92 || s < 0.18) continue;
          const w = s * s * (1 - Math.abs(l - 0.55));
          const bucket = buckets[Math.floor(hh * 24) % 24]!;
          bucket.w += w;
          bucket.r += rgb[0] * w;
          bucket.g += rgb[1] * w;
          bucket.b += rgb[2] * w;
        }
        const top = buckets.reduce((a, b) => (b.w > a.w ? b : a));
        if (top.w < 0.5) return resolve(DEFAULT_TINT);
        const [hh, s] = rgbToHsl([top.r / top.w, top.g / top.w, top.b / top.w]);
        resolve(hslToRgb(hh, Math.min(0.85, Math.max(0.45, s)), 0.62));
      } catch {
        resolve(DEFAULT_TINT);
      }
    };
    img.onerror = () => resolve(DEFAULT_TINT);
    img.src = src;
  });
  colorCache.set(src, job);
  return job;
}

export const applyTint = (el: HTMLElement, rgb: RGB) => el.style.setProperty('--tint', rgb.join(' '));

/** <img> qui apparaît en fondu une fois chargée. */
export function lazyImg(url: string | null, alt: string, cls = ''): HTMLImageElement | null {
  const src = imgUrl(url);
  if (!src) return null;
  const img = document.createElement('img');
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  if (cls) img.className = cls;
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
  img.src = src;
  if (img.complete) img.classList.add('is-loaded');
  return img;
}
