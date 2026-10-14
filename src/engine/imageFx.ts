// Ajustes de color de imágenes y hojas de PDF: saturación, brillo, contraste, matiz,
// escala de grises, blanco y negro y una rampa de tono (sepia, azul…). Se aplican de verdad
// a los píxeles (así salen igual al exportar) y la imagen original se conserva para poder volver.

export interface Fx {
  sat: number; // 0–300 (100 = igual)
  bri: number; // 30–200
  con: number; // 30–200
  hue: number; // -180–180
  gray: boolean;
  bw: number; // 0 = apagado; 1–254 = umbral de blanco y negro
  tone: string; // '' = sin tono; si no, color de la rampa
  toneAmt: number; // 0–100
}

export const FX_DEFAULT: Fx = { sat: 100, bri: 100, con: 100, hue: 0, gray: false, bw: 0, tone: '', toneAmt: 70 };

export const isDefaultFx = (f: Fx) =>
  f.sat === 100 && f.bri === 100 && f.con === 100 && f.hue === 0 && !f.gray && !f.bw && !(f.tone && f.toneAmt > 0);

export function parseFx(text: string | undefined | null): Fx {
  if (!text) return { ...FX_DEFAULT };
  try {
    return { ...FX_DEFAULT, ...(JSON.parse(text) as Partial<Fx>) };
  } catch {
    return { ...FX_DEFAULT };
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se pudo leer la imagen'));
    i.src = src;
  });
}

/** Aplica los ajustes a una imagen y devuelve la nueva (PNG si el original es PNG, si no JPEG). */
export async function renderFx(src: string, fx: Fx, maxSide = 3000): Promise<{ url: string; w: number; h: number }> {
  const img = await loadImg(src);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;

  const b = fx.bri / 100;
  const cn = fx.con / 100;
  const sat = fx.sat / 100;
  const doHue = fx.hue !== 0;
  const rad = (fx.hue * Math.PI) / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);
  // Matriz de rotación de matiz (la misma que usa CSS hue-rotate).
  const m = [
    0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
    0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
    0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072,
  ];
  const tone = fx.tone ? hexToRgb(fx.tone) : null;
  const ta = fx.toneAmt / 100;
  const needLum = fx.gray || fx.bw > 0 || (tone && ta > 0);

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i], g = d[i + 1], bl = d[i + 2];
    if (doHue) {
      const nr = r * m[0] + g * m[1] + bl * m[2];
      const ng = r * m[3] + g * m[4] + bl * m[5];
      const nb = r * m[6] + g * m[7] + bl * m[8];
      r = nr; g = ng; bl = nb;
    }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat;
    }
    if (b !== 1 || cn !== 1) {
      r = (r * b - 128) * cn + 128; g = (g * b - 128) * cn + 128; bl = (bl * b - 128) * cn + 128;
    }
    r = clamp(r); g = clamp(g); bl = clamp(bl);
    if (needLum) {
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      if (fx.bw > 0) {
        const v = l >= fx.bw ? 255 : 0;
        r = g = bl = v;
      } else {
        if (fx.gray || tone) { r = g = bl = l; }
        if (tone && ta > 0) {
          // Rampa: negro → color del tono → blanco, según la luz de cada punto.
          const t = l / 255;
          const f = t < 0.5 ? t * 2 : 1;
          const w2 = t < 0.5 ? 0 : (t - 0.5) * 2;
          const tr = tone[0] * f + (255 - tone[0] * f) * w2;
          const tg = tone[1] * f + (255 - tone[1] * f) * w2;
          const tb = tone[2] * f + (255 - tone[2] * f) * w2;
          r = r + (tr - r) * ta; g = g + (tg - g) * ta; bl = bl + (tb - bl) * ta;
        }
      }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = bl;
  }
  ctx.putImageData(data, 0, 0);
  const png = /^data:image\/(png|webp|gif)/.test(src);
  const url = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  c.width = c.height = 0;
  return { url, w, h };
}
