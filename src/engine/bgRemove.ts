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
/** «portrait»: primero el modelo hecho para personas (mejor con el cabello); «general»: objetos y cosas. */
export type AiKind = 'general' | 'portrait';
const modelsFor = (k: AiKind) => (k === 'portrait' ? [AI_MODELS[1], AI_MODELS[0]] : AI_MODELS);

type Segmenter = (input: string) => Promise<Array<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>>;
const segmenterPromises: Partial<Record<AiKind, Promise<Segmenter>>> = {};

export type AiProgress = (text: string, pct?: number) => void;

async function loadSegmenter(onProgress: AiProgress, kind: AiKind): Promise<Segmenter> {
  if (!segmenterPromises[kind]) {
    const pr = (async () => {
      onProgress('Descargando el motor de IA…');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib: any = await import(/* @vite-ignore */ TRANSFORMERS_URL);
      let lastError: unknown = null;
      for (const model of modelsFor(kind)) {
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
    segmenterPromises[kind] = pr;
    pr.catch(() => {
      delete segmenterPromises[kind]; // permite reintentar
    });
  }
  return segmenterPromises[kind]!;
}

/**
 * Recorte con IA: calcula la silueta y la deja en la máscara. Se trabaja sobre
 * una copia reducida (máx. 1024 px) y la silueta se amplía a la imagen completa.
 */
export async function aiRemoveBackground(m: MaskImage, onProgress: AiProgress, kind: AiKind = 'general'): Promise<void> {
  const seg = await loadSegmenter(onProgress, kind);
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


// ===================== FONDOS DIFÍCILES =====================

/**
 * Quita un color en TODA la imagen (no solo la zona conectada), con borde suave:
 * sirve para el cielo que se ve entre las hojas de un árbol, el fondo entre los dedos, etc.
 */
export function colorKeyRemove(m: MaskImage, x: number, y: number, tol: number, softness = 0.6): number {
  x = Math.max(0, Math.min(m.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(m.h - 1, Math.round(y)));
  const ref = colorAt(m, y * m.w + x);
  const t0 = (tol / 100) * MAX_DIST;
  const t1 = t0 * (1 + Math.max(0.05, softness));
  let n = 0;
  for (let i = 0, N = m.w * m.h; i < N; i++) {
    const o = i * 4;
    const d = Math.hypot(m.rgba[o] - ref.r, m.rgba[o + 1] - ref.g, m.rgba[o + 2] - ref.b);
    if (d >= t1) continue;
    const a = d <= t0 ? 0 : (d - t0) / (t1 - t0);
    const v = Math.round(a * 255);
    if (v < m.mask[i]) {
      m.mask[i] = Math.min(m.mask[i], v);
      n++;
    }
  }
  return n;
}

/** Suma acumulada (imagen integral) para promediar rápido en ventanas. */
function integral(w: number, h: number, f: (i: number) => number): Float64Array {
  const W = w + 1;
  const out = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += f(y * w + x);
      out[(y + 1) * W + x + 1] = out[y * W + x + 1] + row;
    }
  }
  return out;
}
const boxSum = (I: Float64Array, w: number, h: number, x: number, y: number, r: number) => {
  const W = w + 1;
  const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
};

/**
 * Cabello y bordes finos: en una franja alrededor del contorno, la opacidad se recalcula con el color real de
 * cada píxel entre el color de fondo cercano y el del objeto cercano (matting por «línea de color»).
 * Recupera mechones y puntas que el recorte duro dejó fuera o con halo.
 */
export function refineFineEdges(m: MaskImage, band = 6, passes = 4): number {
  let total = 0;
  for (let p = 0; p < passes; p++) {
    const n = refinePass(m, band);
    total += n;
    if (!n) break;
  }
  return total;
}

function refinePass(m: MaskImage, band: number): number {
  const { w, h } = m;
  const R = Math.max(3, band + 2);
  const inM = (i: number) => (m.mask[i] >= 128 ? 1 : 0);
  const out = (i: number) => 1 - inM(i);
  const cnt = (f: (i: number) => number) => integral(w, h, f);
  const Iin = cnt(inM), Iout = cnt(out);
  const chan = (c: number, f: (i: number) => number) => integral(w, h, (i) => m.rgba[i * 4 + c] * f(i));
  const Fin = [0, 1, 2].map((c) => chan(c, inM));
  const Fout = [0, 1, 2].map((c) => chan(c, out));
  const Imask = integral(w, h, (i) => m.mask[i] / 255);
  const next = new Uint8ClampedArray(m.mask);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const win = (2 * band + 1) * (2 * band + 1);
      const avg = boxSum(Imask, w, h, x, y, band) / Math.min(win, (Math.min(w, x + band + 1) - Math.max(0, x - band)) * (Math.min(h, y + band + 1) - Math.max(0, y - band)));
      if (avg < 0.03 || avg > 0.97) continue; // lejos del contorno
      const nIn = boxSum(Iin, w, h, x, y, R), nOut = boxSum(Iout, w, h, x, y, R);
      if (nIn < 6 || nOut < 6) continue;
      const o = i * 4;
      let dd = 0, dp = 0;
      for (let c = 0; c < 3; c++) {
        const fg = boxSum(Fin[c], w, h, x, y, R) / nIn;
        const bg = boxSum(Fout[c], w, h, x, y, R) / nOut;
        dd += (fg - bg) * (fg - bg);
        dp += (m.rgba[o + c] - bg) * (fg - bg);
      }
      if (dd < 400) continue; // fondo y objeto muy parecidos: no se puede separar por color
      const a = Math.max(0, Math.min(1, dp / dd));
      // Suaviza: solo corrige dentro de la franja y respeta el borde duro lejano.
      const v = Math.round(255 * (a < 0.08 ? 0 : a > 0.92 ? 1 : a));
      const nv = Math.min(m.origAlpha[i], v);
      if (nv !== next[i]) { next[i] = nv; changed++; }
    }
  }
  m.mask.set(next);
  return changed;
}

// ===================== LOTES (sin abrir el lienzo) =====================

export type BatchBgMode = 'ai-general' | 'ai-portrait' | 'auto';

/** Quita el fondo de un archivo de imagen y devuelve un PNG transparente. Pensado para procesar varias imágenes seguidas. */
export async function removeBgFromFile(
  file: Blob,
  mode: BatchBgMode,
  opts: { tol?: number; cropToContent?: boolean; maxSide?: number } = {},
  onProgress: AiProgress = () => undefined
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const side = opts.maxSide ?? 2048;
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const mi = createMaskImage(ctx.getImageData(0, 0, w, h));
    if (mode === 'auto') {
      autoRemoveBackground(mi, opts.tol ?? 18, false);
    } else {
      await aiRemoveBackground(mi, onProgress, mode === 'ai-portrait' ? 'portrait' : 'general');
      if (mode === 'ai-portrait') refineFineEdges(mi, 6);
    }
    const outData = new ImageData(w, h);
    composeRgba(mi, outData.data);
    const out = outData;
    let ow = w, oh = h;
    const b = opts.cropToContent ? visibleBounds(mi) : null;
    const target = document.createElement('canvas');
    if (b && b.w > 0 && b.h > 0) {
      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      full.getContext('2d')!.putImageData(out, 0, 0);
      ow = b.w; oh = b.h;
      target.width = ow;
      target.height = oh;
      target.getContext('2d')!.drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    } else {
      target.width = ow;
      target.height = oh;
      target.getContext('2d')!.putImageData(out, 0, 0);
    }
    return await new Promise<Blob>((res, rej) => target.toBlob((bl) => (bl ? res(bl) : rej(new Error('No se pudo crear el PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Pincel inteligente: respeta los cambios de color entre el fondo y el objeto.
// ---------------------------------------------------------------------------

/** Promedio de color (3×3 alrededor del punto) usado como referencia del trazo. */
export function sampleColor(m: MaskImage, cx: number, cy: number): Rgb {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const i = (y * m.w + x) * 4;
      r += m.rgba[i]; g += m.rgba[i + 1]; b += m.rgba[i + 2]; n++;
    }
  }
  n = n || 1;
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Punto de pincel que solo afecta a los píxeles parecidos al color de referencia
 * (el del inicio del trazo) y conectados con el centro: al llegar a un borde con
 * otro color, el pincel se detiene solo. `tol` 1–100.
 */
export function smartDot(m: MaskImage, cx: number, cy: number, radius: number, hardness: number, mode: 'erase' | 'restore', ref: Rgb, tol: number) {
  const { w, h } = m;
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const t = (Math.max(1, tol) / 100) * MAX_DIST;
  const t2 = t * t;
  const ok = new Uint8Array(bw * bh);
  const seen = new Uint8Array(bw * bh);
  const dist2 = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const dr = m.rgba[i] - ref.r, dg = m.rgba[i + 1] - ref.g, db = m.rgba[i + 2] - ref.b;
    return dr * dr + dg * dg + db * db;
  };
  // Relleno por inundación desde el centro, solo dentro del disco y del color de referencia.
  const sx = Math.min(x1, Math.max(x0, Math.round(cx))), sy = Math.min(y1, Math.max(y0, Math.round(cy)));
  const stack: number[] = [];
  // Si el centro no se parece a la referencia (trazo que cruza un borde), se busca la semilla más cercana válida.
  let seeded = false;
  for (let rad = 0; rad <= 3 && !seeded; rad++) {
    for (let dy = -rad; dy <= rad && !seeded; dy++) for (let dx = -rad; dx <= rad && !seeded; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (dist2(x, y) <= t2) { stack.push((y - y0) * bw + (x - x0)); seen[(y - y0) * bw + (x - x0)] = 1; seeded = true; }
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % bw, py = (p / bw) | 0;
    const x = px + x0, y = py + y0;
    if (Math.hypot(x - cx, y - cy) > r) continue;
    ok[p] = 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const q = ny * bw + nx;
      if (seen[q]) continue;
      seen[q] = 1;
      if (dist2(nx + x0, ny + y0) <= t2) stack.push(q);
    }
  }
  const inner = r * Math.max(0, Math.min(0.99, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!ok[(y - y0) * bw + (x - x0)]) continue;
      const d = Math.hypot(x - cx, y - cy);
      const s = d <= inner ? 1 : 1 - (d - inner) / (r - inner || 1);
      if (s <= 0) continue;
      const i = y * w + x;
      if (mode === 'erase') m.mask[i] = Math.min(m.mask[i], Math.round(m.mask[i] * (1 - s)));
      else m.mask[i] = Math.max(m.mask[i], Math.round(m.origAlpha[i] * s));
    }
  }
}

export function smartLine(m: MaskImage, x0: number, y0: number, x1: number, y1: number, radius: number, hardness: number, mode: 'erase' | 'restore', ref: Rgb, tol: number) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, radius / 3);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    smartDot(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, hardness, mode, ref, tol);
  }
}

// ---------------------------------------------------------------------------
// Quitar objeto: se marca lo que sobra (máscara = 0) y se rellena con el entorno.
// ---------------------------------------------------------------------------

/**
 * Rellena las zonas marcadas (mask < 128) con el color de alrededor: capa a capa desde
 * el borde hacia dentro y luego un suavizado. Es un relleno sencillo (no inventa
 * texturas): funciona bien en fondos lisos, cielos, paredes, césped, etc.
 * Devuelve un RGBA nuevo con la opacidad original.
 */
export function inpaintObject(m: MaskImage, grow = 2): Uint8ClampedArray {
  const { w, h } = m;
  const n = w * h;
  const out = new Uint8ClampedArray(m.rgba);
  let hole = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) if (m.mask[i] < 128 && m.origAlpha[i] > 0) { hole[i] = 1; count++; }
  if (!count) return out;
  // Agranda el hueco unos píxeles para no dejar halos del objeto.
  for (let g = 0; g < grow; g++) {
    const nh = new Uint8Array(hole);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (hole[i]) continue;
      if ((x > 0 && hole[i - 1]) || (x < w - 1 && hole[i + 1]) || (y > 0 && hole[i - w]) || (y < h - 1 && hole[i + w])) nh[i] = 1;
    }
    hole = nh;
  }
  const holeIdx: number[] = [];
  for (let i = 0; i < n; i++) if (hole[i]) holeIdx.push(i);
  const known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = hole[i] ? 0 : 1;
  // 1) Capas desde el borde hacia dentro: promedio de los vecinos ya conocidos.
  let frontier = holeIdx;
  let guard = 0;
  while (frontier.length && guard++ < Math.max(w, h)) {
    const next: number[] = [];
    const fill: { i: number; r: number; g: number; b: number }[] = [];
    for (const i of frontier) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!known[j]) continue;
        r += out[j * 4]; g += out[j * 4 + 1]; b += out[j * 4 + 2]; c++;
      }
      if (c) fill.push({ i, r: r / c, g: g / c, b: b / c });
      else next.push(i);
    }
    if (!fill.length) break;
    for (const f of fill) { out[f.i * 4] = f.r; out[f.i * 4 + 1] = f.g; out[f.i * 4 + 2] = f.b; known[f.i] = 1; }
    frontier = next;
  }
  // 2) Suavizado de Gauss-Seidel solo dentro del hueco (el color se reparte sin cortes).
  const iters = Math.min(60, 12 + Math.round(Math.sqrt(holeIdx.length) / 4));
  for (let it = 0; it < iters; it++) {
    for (const i of holeIdx) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, g = 0, b = 0, c = 0;
      if (x > 0) { r += out[(i - 1) * 4]; g += out[(i - 1) * 4 + 1]; b += out[(i - 1) * 4 + 2]; c++; }
      if (x < w - 1) { r += out[(i + 1) * 4]; g += out[(i + 1) * 4 + 1]; b += out[(i + 1) * 4 + 2]; c++; }
      if (y > 0) { r += out[(i - w) * 4]; g += out[(i - w) * 4 + 1]; b += out[(i - w) * 4 + 2]; c++; }
      if (y < h - 1) { r += out[(i + w) * 4]; g += out[(i + w) * 4 + 1]; b += out[(i + w) * 4 + 2]; c++; }
      if (c) { out[i * 4] = r / c; out[i * 4 + 1] = g / c; out[i * 4 + 2] = b / c; }
    }
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = m.origAlpha[i];
  return out;
}
