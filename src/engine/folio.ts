// Foliado (numeración de páginas): configuración, formato del texto, geometría
// y dibujo del "sello". Es código puro (sin React ni motor) para que lo usen
// tanto la hoja abierta en el editor como el foliado por lotes de archivos.

export type FolioVertical = 'top' | 'middle' | 'bottom';
export type FolioHorizontal = 'left' | 'center' | 'right';
export type FolioShape = 'none' | 'rect' | 'rounded' | 'pill' | 'circle';
export type FolioNumerals = 'arabic' | 'roman' | 'roman-lower';

export interface FolioConfig {
  enabled: boolean;
  /** Texto con marcadores: {n} = número de la hoja, {total} = último número. */
  template: string;
  /** asc = 1,2,3… · desc = …3,2,1 (inversa). */
  order: 'asc' | 'desc';
  /** Primer número de la secuencia (en descendente, el último en aparecer). */
  start: number;
  /** Cuántas hojas del inicio no llevan folio (portada, índice…). */
  skipFirst: number;
  /** Ceros a la izquierda: 3 → 001. */
  pad: number;
  numerals: FolioNumerals;
  vertical: FolioVertical;
  horizontal: FolioHorizontal;
  /** Distancia al borde de la hoja, en px (1 px = 0,75 pt). */
  offsetX: number;
  offsetY: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  shape: FolioShape;
  shapeColor: string;
  /** 0–1 (0.5 = 50 % de transparencia). */
  shapeOpacity: number;
  borderColor: string;
  borderWidth: number;
  padX: number;
  padY: number;
}

export const DEFAULT_FOLIO: FolioConfig = {
  enabled: false,
  template: 'Pág. {n}',
  order: 'asc',
  start: 1,
  skipFirst: 0,
  pad: 0,
  numerals: 'arabic',
  vertical: 'bottom',
  horizontal: 'center',
  offsetX: 36,
  offsetY: 24,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  bold: true,
  italic: false,
  color: '#0f172a',
  shape: 'none',
  shapeColor: '#ffffff',
  shapeOpacity: 0.5,
  borderColor: '#0f172a',
  borderWidth: 0,
  padX: 12,
  padY: 6,
};

export interface FolioPreset {
  id: string;
  label: string;
  patch: Partial<FolioConfig>;
}

export const FOLIO_PRESETS: FolioPreset[] = [
  { id: 'simple', label: 'Simple', patch: { template: '{n}', shape: 'none', bold: false, color: '#0f172a', horizontal: 'center', vertical: 'bottom' } },
  { id: 'pag', label: 'Pág. 1', patch: { template: 'Pág. {n}', shape: 'none', bold: true, color: '#0f172a' } },
  { id: 'de', label: 'Pág. 1 de N', patch: { template: 'Pág. {n} de {total}', shape: 'none', bold: false, color: '#334155' } },
  { id: 'dash', label: '— 1 —', patch: { template: '— {n} —', shape: 'none', bold: false, color: '#334155' } },
  { id: 'pill', label: 'Cápsula', patch: { template: 'Pág. {n}', shape: 'pill', shapeColor: '#0f172a', shapeOpacity: 1, color: '#ffffff', bold: true, borderWidth: 0 } },
  { id: 'glass', label: 'Cinta 50 %', patch: { template: 'Pág. {n} de {total}', shape: 'rounded', shapeColor: '#ffffff', shapeOpacity: 0.5, color: '#0f172a', bold: true, borderWidth: 0 } },
  { id: 'circle', label: 'Círculo', patch: { template: '{n}', shape: 'circle', shapeColor: '#2563eb', shapeOpacity: 1, color: '#ffffff', bold: true, horizontal: 'right', vertical: 'bottom', borderWidth: 0 } },
  { id: 'stamp', label: 'Sello', patch: { template: 'FOLIO {n}/{total}', shape: 'rect', shapeColor: '#ffffff', shapeOpacity: 0.5, color: '#b91c1c', borderColor: '#b91c1c', borderWidth: 2, bold: true, horizontal: 'right', vertical: 'top' } },
];

const STORAGE_KEY = 'docucraft.folio.v1';

/** Recuerda el último diseño (nunca el "activado", para no foliar sin querer). */
export function loadFolioConfig(): FolioConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_FOLIO, ...(JSON.parse(raw) as Partial<FolioConfig>), enabled: false };
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
  return { ...DEFAULT_FOLIO };
}

export function saveFolioConfig(cfg: FolioConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, enabled: false }));
  } catch {
    /* ignorar */
  }
}

// ---------------------------------------------------------------- numeración

function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [v, s] of map) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

export function formatFolioNumber(n: number, cfg: Pick<FolioConfig, 'numerals' | 'pad'>): string {
  if (cfg.numerals === 'roman') return toRoman(n);
  if (cfg.numerals === 'roman-lower') return toRoman(n).toLowerCase();
  const s = String(n);
  return cfg.pad > 1 ? s.padStart(cfg.pad, '0') : s;
}

/** Número que le toca a la hoja `index` (0-based) de `total`, o null si no lleva folio. */
export function folioNumberFor(index: number, total: number, cfg: FolioConfig): number | null {
  const skip = Math.max(0, Math.floor(cfg.skipFirst));
  const count = total - skip;
  const pos = index - skip;
  if (pos < 0 || count <= 0) return null;
  return cfg.order === 'desc' ? cfg.start + (count - 1 - pos) : cfg.start + pos;
}

/** Último número de la secuencia (lo que vale {total}). */
export function folioLastNumber(total: number, cfg: FolioConfig): number {
  const count = Math.max(0, total - Math.max(0, Math.floor(cfg.skipFirst)));
  return cfg.order === 'desc' ? cfg.start + Math.max(count - 1, 0) : cfg.start + Math.max(count - 1, 0);
}

/** Texto final del folio de una hoja (null = sin folio). */
export function folioText(index: number, total: number, cfg: FolioConfig): string | null {
  const n = folioNumberFor(index, total, cfg);
  if (n === null) return null;
  const nTxt = formatFolioNumber(n, cfg);
  const totalTxt = formatFolioNumber(folioLastNumber(total, cfg), cfg);
  return (cfg.template || '{n}').replace(/\{n\}/g, nTxt).replace(/\{total\}/g, totalTxt);
}

// ---------------------------------------------------------------- sello (canvas)

export interface FolioBadge {
  canvas: HTMLCanvasElement;
  /** Tamaño en px CSS (1 px = 0,75 pt). */
  w: number;
  h: number;
}

function fontString(cfg: FolioConfig): string {
  return `${cfg.italic ? 'italic ' : ''}${cfg.bold ? '700' : '400'} ${cfg.fontSize}px ${cfg.fontFamily}`;
}

async function ensureFont(cfg: FolioConfig, text: string) {
  try {
    await document.fonts.load(fontString(cfg), text);
  } catch {
    /* si no carga, el navegador usa la fuente de respaldo */
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Dibuja el sello (forma + texto) en un canvas con fondo transparente. */
export async function renderFolioBadge(text: string, cfg: FolioConfig, scale = 3): Promise<FolioBadge> {
  await ensureFont(cfg, text);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontString(cfg);
  const textW = Math.ceil(measure.measureText(text).width);
  const lineH = Math.ceil(cfg.fontSize * 1.25);
  const hasShape = cfg.shape !== 'none';
  const bw = hasShape ? cfg.borderWidth : 0;
  let w = textW + (hasShape ? cfg.padX * 2 : 0) + bw * 2;
  let h = lineH + (hasShape ? cfg.padY * 2 : 0) + bw * 2;
  if (cfg.shape === 'circle') w = h = Math.max(w, h);
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  if (hasShape) {
    const inset = bw / 2;
    const x = inset, y = inset, ww = w - bw, hh = h - bw;
    const radius = cfg.shape === 'circle' ? Math.max(ww, hh) / 2 : cfg.shape === 'pill' ? hh / 2 : cfg.shape === 'rounded' ? 8 : 0;
    roundRectPath(ctx, x, y, ww, hh, radius);
    ctx.globalAlpha = Math.min(1, Math.max(0, cfg.shapeOpacity));
    ctx.fillStyle = cfg.shapeColor;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (bw > 0) {
      ctx.lineWidth = bw;
      ctx.strokeStyle = cfg.borderColor;
      ctx.stroke();
    }
  }
  ctx.font = fontString(cfg);
  ctx.fillStyle = cfg.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + cfg.fontSize * 0.04);
  return { canvas, w, h };
}

/** Esquina superior izquierda del sello dentro de una hoja de `pageW × pageH` (px o pt, mismas unidades). */
export function folioPosition(
  cfg: Pick<FolioConfig, 'vertical' | 'horizontal' | 'offsetX' | 'offsetY'>,
  pageW: number,
  pageH: number,
  w: number,
  h: number
): { x: number; y: number } {
  const x = cfg.horizontal === 'left' ? cfg.offsetX : cfg.horizontal === 'right' ? pageW - w - cfg.offsetX : (pageW - w) / 2;
  const y = cfg.vertical === 'top' ? cfg.offsetY : cfg.vertical === 'bottom' ? pageH - h - cfg.offsetY : (pageH - h) / 2;
  return { x, y };
}

/**
 * Convierte "esquina superior izquierda visual (vx, vy) + tamaño" a las
 * coordenadas que necesita PDF para dibujar una imagen en una hoja que puede
 * estar girada (/Rotate) y/o recortada (CropBox). Todo en puntos.
 */
export function computeStampPlacement(
  crop: { x: number; y: number; width: number; height: number },
  rotation: number,
  vx: number,
  vy: number,
  bw: number,
  bh: number
): { x: number; y: number; angle: number } {
  const r = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  const w = crop.width;
  const h = crop.height;
  const visH = r === 90 || r === 270 ? w : h;
  const vYb = visH - vy - bh; // esquina inferior izquierda visual
  let ux: number, uy: number;
  if (r === 0) { ux = vx; uy = vYb; }
  else if (r === 90) { ux = w - vYb; uy = vx; }
  else if (r === 180) { ux = w - vx; uy = h - vYb; }
  else { ux = vYb; uy = h - vx; }
  return { x: crop.x + ux, y: crop.y + uy, angle: r };
}
