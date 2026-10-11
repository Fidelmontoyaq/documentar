// Quitar el fondo de una imagen: varita por color, fondo liso automático, pincel
// de borrar/restaurar, afinar/suavizar bordes y recorte con IA (carga bajo demanda).
//
// Todo trabaja sobre una "máscara" (opacidad 0–255 por píxel) separada de los
// colores originales: así se puede borrar y restaurar sin perder nada.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface MaskImage {
  w: number;
  h: number;
  /** RGBA original (no se modifica). */
  rgba: Uint8ClampedArray;
  /** Opacidad de salida por píxel. */
  mask: Uint8ClampedArray;
  /** Opacidad que tenía la imagen original (para "restaurar"). */
  origAlpha: Uint8ClampedArray;
}

export function createMaskImage(data: ImageData): MaskImage {
  const n = data.width * data.height;
  const origAlpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) origAlpha[i] = data.data[i * 4 + 3];
  return { w: data.width, h: data.height, rgba: new Uint8ClampedArray(data.data), mask: new Uint8ClampedArray(origAlpha), origAlpha };
}

/** Imagen RGBA lista para pintar/exportar: colores originales + máscara actual. */
export function composeRgba(m: MaskImage, out?: Uint8ClampedArray): Uint8ClampedArray {
  const o = out ?? new Uint8ClampedArray(m.rgba.length);
  for (let i = 0, n = m.w * m.h; i < n; i++) {
    o[i * 4] = m.rgba[i * 4];
    o[i * 4 + 1] = m.rgba[i * 4 + 1];
    o[i * 4 + 2] = m.rgba[i * 4 + 2];
    o[i * 4 + 3] = m.mask[i];
  }
  return o;
}

const MAX_DIST = Math.sqrt(3 * 255 * 255);

/** Umbral² de distancia de color a partir de una tolerancia 0–100. */
const thr2 = (tol: number) => {
  const t = (Math.max(0, Math.min(100, tol)) / 100) * MAX_DIST;
  return t * t;
};

function colorAt(m: MaskImage, i: number): Rgb {
  return { r: m.rgba[i * 4], g: m.rgba[i * 4 + 1], b: m.rgba[i * 4 + 2] };
}

function near(m: MaskImage, i: number, ref: Rgb, t2: number): boolean {
  const dr = m.rgba[i * 4] - ref.r;
  const dg = m.rgba[i * 4 + 1] - ref.g;
  const db = m.rgba[i * 4 + 2] - ref.b;
  return dr * dr + dg * dg + db * db <= t2;
}

/**
 * Varita: quita los píxeles parecidos al color del punto (x, y).
 * `contiguous`: solo la zona conectada; si no, todos los píxeles de ese color.
 * Devuelve cuántos píxeles se quitaron.
 */
export function wandRemove(m: MaskImage, x: number, y: number, tol: number, contiguous: boolean): number {
  x = Math.max(0, Math.min(m.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(m.h - 1, Math.round(y)));
  const ref = colorAt(m, y * m.w + x);
  return removeMatching(m, ref, tol, contiguous ? [[x, y]] : null);
}

function removeMatching(m: MaskImage, ref: Rgb, tol: number, seeds: [number, number][] | null): number {
  const t2 = thr2(tol);
  const { w, h } = m;
  let removed = 0;
  if (!seeds) {
    for (let i = 0, n = w * h; i < n; i++) {
      if (m.mask[i] && near(m, i, ref, t2)) {
        m.mask[i] = 0;
        removed++;
      }
    }
    return removed;
  }
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const [sx, sy] of seeds) {
    const i = sy * w + sx;
    if (!seen[i] && near(m, i, ref, t2)) {
      seen[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    if (m.mask[i]) {
      m.mask[i] = 0;
      removed++;
    }
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && !seen[i - 1] && near(m, i - 1, ref, t2)) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && !seen[i + 1] && near(m, i + 1, ref, t2)) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - w] && near(m, i - w, ref, t2)) { seen[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && !seen[i + w] && near(m, i + w, ref, t2)) { seen[i + w] = 1; stack.push(i + w); }
  }
  return removed;
}

/** Color de fondo más probable: el más frecuente en el borde de la imagen (cuantizado). */
export function detectBorderColor(m: MaskImage): Rgb {
  const { w, h } = m;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = y * w + x;
    if (m.origAlpha[i] < 128) return;
    const r = m.rgba[i * 4], g = m.rgba[i * 4 + 1], b = m.rgba[i * 4 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  buckets.forEach((e) => { if (!best || e.n > best.n) best = e; });
  const b = best as { n: number; r: number; g: number; b: number } | null;
  return b ? { r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n) } : { r: 255, g: 255, b: 255 };
}

/**
 * Fondo liso automático: parte del borde de la imagen y quita todo lo conectado
 * que se parezca al color del fondo. `holes` también quita ese color dentro del
 * dibujo (huecos de letras, asas…).
 */
export function autoRemoveBackground(m: MaskImage, tol: number, holes: boolean): { removed: number; color: Rgb } {
  const ref = detectBorderColor(m);
  const { w, h } = m;
  if (holes) return { removed: removeMatching(m, ref, tol, null), color: ref };
  const t2 = thr2(tol);
  const seeds: [number, number][] = [];
  const push = (x: number, y: number) => {
    if (near(m, y * w + x, ref, t2)) seeds.push([x, y]);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  return { removed: removeMatching(m, ref, tol, seeds), color: ref };
}

/** Pincel: borra (o restaura) un círculo con borde suave. `hardness` 0–1. */
export function paintDot(m: MaskImage, cx: number, cy: number, radius: number, hardness: number, mode: 'erase' | 'restore') {
  const { w, h } = m;
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const inner = r * Math.max(0, Math.min(0.99, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const s = d <= inner ? 1 : 1 - (d - inner) / (r - inner || 1);
      const i = y * w + x;
      if (mode === 'erase') m.mask[i] = Math.min(m.mask[i], Math.round(m.mask[i] * (1 - s)));
      else m.mask[i] = Math.max(m.mask[i], Math.round(m.origAlpha[i] * s));
    }
  }
}

/** Pincel continuo entre dos puntos (sin huecos). */
export function paintLine(m: MaskImage, x0: number, y0: number, x1: number, y1: number, radius: number, hardness: number, mode: 'erase' | 'restore') {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius / 4);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    paintDot(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, hardness, mode);
  }
}

/** Afina el borde: se come `px` píxeles hacia dentro (quita halos de color del fondo). */
export function shrinkEdge(m: MaskImage, px: number) {
  const { w, h } = m;
  for (let pass = 0; pass < px; pass++) {
    const src = new Uint8ClampedArray(m.mask);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!src[i]) continue;
        let mn = src[i];
        if (x > 0) mn = Math.min(mn, src[i - 1]);
        if (x < w - 1) mn = Math.min(mn, src[i + 1]);
        if (y > 0) mn = Math.min(mn, src[i - w]);
        if (y < h - 1) mn = Math.min(mn, src[i + w]);
        // Los bordes de la imagen no cuentan como "vacío".
        m.mask[i] = mn;
      }
    }
  }
}

/** Suaviza el borde: desenfoca solo la máscara (el contorno queda menos dentado). */
export function featherEdge(m: MaskImage, radius: number) {
  const { w, h } = m;
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += m.mask[y * w + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / win;
      sum += m.mask[y * w + Math.min(w - 1, x + r + 1)] - m.mask[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  // Solo se suaviza donde había transición; el interior opaco y el vacío quedan intactos.
  for (let i = 0, n = w * h; i < n; i++) {
    const a = m.mask[i];
    m.mask[i] = a === 255 && out[i] > 250 ? 255 : a === 0 && out[i] < 5 ? 0 : Math.round(out[i]);
  }
}

/** Quita motas sueltas: islas de píxeles visibles más pequeñas que `minPx`. */
export function removeSpecks(m: MaskImage, minPx: number): number {
  const { w, h } = m;
  const seen = new Uint8Array(w * h);
  let removed = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || m.mask[s] < 128) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && m.mask[j] >= 128) { seen[j] = 1; stack.push(j); }
    }
    if (comp.length < minPx) {
      for (const i of comp) m.mask[i] = 0;
      removed += comp.length;
    }
  }
  return removed;
}

/** Recorte de transparencia sobrante: caja que contiene todo lo visible. */
export function visibleBounds(m: MaskImage, threshold = 8): { x: number; y: number; w: number; h: number } | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.mask[y * m.w + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------------------------------------------------------------- IA (bajo demanda)

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm';
// Modelos de recorte; se prueban en orden hasta que uno cargue.
const AI_MODELS = ['onnx-community/ISNet-ONNX', 'Xenova/modnet'];

type Segmenter = (input: string) => Promise<Array<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>>;
let segmenterPromise: Promise<Segmenter> | null = null;

export type AiProgress = (text: string, pct?: number) => void;

async function loadSegmenter(onProgress: AiProgress): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      onProgress('Descargando el motor de IA…');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib: any = await import(/* @vite-ignore */ TRANSFORMERS_URL);
      let lastError: unknown = null;
      for (const model of AI_MODELS) {
        try {
          onProgress('Descargando el modelo (solo la primera vez)…');
          const seg = await lib.pipeline('background-removal', model, {
            progress_callback: (p: { status?: string; progress?: number }) => {
              if (p.status === 'progress' && typeof p.progress === 'number') onProgress('Descargando el modelo (solo la primera vez)…', p.progress);
            },
          });
          return seg as Segmenter;
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError ?? new Error('No se pudo cargar ningún modelo');
    })();
    segmenterPromise.catch(() => {
      segmenterPromise = null; // permite reintentar
    });
  }
  return segmenterPromise;
}

/**
 * Recorte con IA: calcula la silueta y la deja en la máscara. Se trabaja sobre
 * una copia reducida (máx. 1024 px) y la silueta se amplía a la imagen completa.
 */
export async function aiRemoveBackground(m: MaskImage, onProgress: AiProgress): Promise<void> {
  const seg = await loadSegmenter(onProgress);
  onProgress('Detectando el objeto…');
  const MAX = 1024;
  const k = Math.min(1, MAX / Math.max(m.w, m.h));
  const sw = Math.max(1, Math.round(m.w * k)), sh = Math.max(1, Math.round(m.h * k));
  const full = document.createElement('canvas');
  full.width = m.w;
  full.height = m.h;
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(m.rgba), m.w, m.h), 0, 0);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  small.getContext('2d')!.drawImage(full, 0, 0, sw, sh);
  const blob: Blob = await new Promise((res, rej) => small.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  const url = URL.createObjectURL(blob);
  try {
    const [out] = await seg(url);
    // Alfa del resultado → canvas pequeño → ampliado al tamaño real.
    const maskSmall = document.createElement('canvas');
    maskSmall.width = out.width;
    maskSmall.height = out.height;
    const mc = maskSmall.getContext('2d')!;
    const id = mc.createImageData(out.width, out.height);
    for (let i = 0, n = out.width * out.height; i < n; i++) {
      const a = out.channels === 4 ? out.data[i * 4 + 3] : out.data[i];
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 0;
      id.data[i * 4 + 3] = a;
    }
    mc.putImageData(id, 0, 0);
    const big = document.createElement('canvas');
    big.width = m.w;
    big.height = m.h;
    const bc = big.getContext('2d')!;
    bc.imageSmoothingQuality = 'high';
    bc.drawImage(maskSmall, 0, 0, m.w, m.h);
    const bd = bc.getImageData(0, 0, m.w, m.h).data;
    for (let i = 0, n = m.w * m.h; i < n; i++) m.mask[i] = Math.round((bd[i * 4 + 3] * m.origAlpha[i]) / 255);
  } finally {
    URL.revokeObjectURL(url);
  }
}
