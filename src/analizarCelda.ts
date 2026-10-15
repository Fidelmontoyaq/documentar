import type { BoundingBox, EstadoCelda } from '../types/acta';

// Todo el análisis es relativo al brillo mediano de la hoja (papel rosado, gris, escaneo claro u oscuro).
export function medianaLuma(canvas: HTMLCanvasElement): number {
  const w = 240;
  const h = Math.max(1, Math.round((240 * canvas.height) / canvas.width));
  const s = document.createElement('canvas');
  s.width = w;
  s.height = h;
  const ctx = s.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= (w * h) / 2) return v;
  }
  return 200;
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
// Tinta de lapicero: oscura, o azulada (la tinta azul sobre papel rosado tiene B > R).
const esTinta = (r: number, g: number, b: number, m: number) => {
  const l = luma(r, g, b);
  return l < m * 0.7 || (b - r > 28 && l < m * 0.92);
};
const esNegro = (r: number, g: number, b: number, m: number) => luma(r, g, b) < m * 0.42;

// Región interior de la celda (se descarta un margen para no leer las líneas de la cuadrícula).
function region(canvas: HTMLCanvasElement, box: BoundingBox, inset: number) {
  const x = Math.max(0, Math.floor(box.x + box.w * inset));
  const y = Math.max(0, Math.floor(box.y + box.h * inset));
  const w = Math.min(canvas.width - x, Math.floor(box.w * (1 - 2 * inset)));
  const h = Math.min(canvas.height - y, Math.floor(box.h * (1 - 2 * inset)));
  return { x, y, w, h };
}

export interface AnalisisCelda {
  estado: EstadoCelda;
  tinta: number;
  oscuro: number;
  confianza: number;
}

// Clasifica una celda: ANULADA (relleno negro) / VACIA (sin tinta) / MANUSCRITO (hay número).
export function analizarCelda(canvas: HTMLCanvasElement, box: BoundingBox, m: number): AnalisisCelda {
  const r = region(canvas, box, 0.12);
  if (r.w <= 2 || r.h <= 2) return { estado: 'VACIA', tinta: 0, oscuro: 0, confianza: 0 };
  const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(r.x, r.y, r.w, r.h).data;
  let t = 0;
  let o = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (esTinta(d[i], d[i + 1], d[i + 2], m)) t++;
    if (esNegro(d[i], d[i + 1], d[i + 2], m)) o++;
  }
  const n = r.w * r.h;
  const tinta = t / n;
  const oscuro = o / n;
  if (oscuro > 0.5 || tinta > 0.8) return { estado: 'ANULADA', tinta, oscuro, confianza: oscuro > 0.7 ? 0.95 : 0.7 };
  if (tinta < 0.006) return { estado: 'VACIA', tinta, oscuro, confianza: 0.95 };
  if (tinta < 0.015) return { estado: 'VACIA', tinta, oscuro, confianza: 0.5 }; // marca mínima: dudoso
  return { estado: 'MANUSCRITO', tinta, oscuro, confianza: 0 };
}

// Deja SOLO la tinta (negro sobre blanco) y amplía: mucho mejor para OCR de dígitos manuscritos
// que la imagen a color sobre fondo rosado.
export function binarizarCelda(canvas: HTMLCanvasElement, box: BoundingBox, m: number): HTMLCanvasElement {
  const r = region(canvas, box, 0.08);
  const w = Math.max(1, r.w);
  const h = Math.max(1, r.h);
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, r.x, r.y, w, h, 0, 0, w, h);
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = esTinta(d[i], d[i + 1], d[i + 2], m) ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  const escala = Math.min(4, Math.max(1, 80 / h));
  const pad = 24;
  const out = document.createElement('canvas');
  out.width = Math.round(w * escala) + 2 * pad;
  out.height = Math.round(h * escala) + 2 * pad;
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true;
  octx.drawImage(src, 0, 0, w, h, pad, pad, Math.round(w * escala), Math.round(h * escala));
  return out;
}
