// Algoritmos para acomodar varias imágenes dentro del área útil de una hoja.
// Son funciones puras: reciben las proporciones (ancho/alto) de cada imagen y
// el área disponible, y devuelven el rectángulo final de cada imagen. Cada
// imagen se ajusta SIN deformarse dentro de su celda, reservando abajo el
// espacio de su pie de foto (si lo tiene), para que todo quede dentro de la hoja.
import type { ArrangeLayoutId } from '../types/documentEditor';

/** Alto del pie de foto (36) + separación (8). */
export const CAPTION_SPACE = 44;
const GAP = 12;

export interface LayoutItem {
  /** Proporción ancho/alto de la imagen. */
  ar: number;
  /** Espacio que necesita su pie de foto (0 si no tiene). */
  capH: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ARRANGE_LAYOUTS: { id: ArrangeLayoutId; label: string }[] = [
  { id: 'cols', label: 'Columnas' },
  { id: 'rows', label: 'Filas' },
  { id: 'half-h', label: 'Mitad | Mitad' },
  { id: 'half-v', label: 'Mitad / Mitad' },
  { id: 'h-60-40', label: '60 | 40' },
  { id: 'h-70-30', label: '70 | 30' },
  { id: 'v-60-40', label: '60 / 40' },
  { id: 'v-70-30', label: '70 / 30' },
  { id: 'grid', label: 'Cuadrícula' },
  { id: 'flex', label: 'Flex' },
];

function spreadH(r: Rect, n: number): Rect[] {
  if (n <= 0) return [];
  const w = (r.w - GAP * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: r.x + i * (w + GAP), y: r.y, w, h: r.h }));
}

function stackV(r: Rect, n: number): Rect[] {
  if (n <= 0) return [];
  const h = (r.h - GAP * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: r.x, y: r.y + i * (h + GAP), w: r.w, h }));
}

function gridCells(a: Rect, n: number): Rect[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const w = (a.w - GAP * (cols - 1)) / cols;
  const h = (a.h - GAP * (rows - 1)) / rows;
  const cells: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const col = i % cols;
    const rowWidth = inRow * w + GAP * (inRow - 1);
    const x0 = a.x + (a.w - rowWidth) / 2; // centra la última fila incompleta
    cells.push({ x: x0 + col * (w + GAP), y: a.y + row * (h + GAP), w, h });
  }
  return cells;
}

function pctH(a: Rect, n: number, p: number): Rect[] {
  if (n === 1) return [a];
  const first = { x: a.x, y: a.y, w: a.w * p - GAP / 2, h: a.h };
  const rest = { x: a.x + a.w * p + GAP / 2, y: a.y, w: a.w * (1 - p) - GAP / 2, h: a.h };
  return [first, ...stackV(rest, n - 1)];
}

function pctV(a: Rect, n: number, p: number): Rect[] {
  if (n === 1) return [a];
  const first = { x: a.x, y: a.y, w: a.w, h: a.h * p - GAP / 2 };
  const rest = { x: a.x, y: a.y + a.h * p + GAP / 2, w: a.w, h: a.h * (1 - p) - GAP / 2 };
  return [first, ...spreadH(rest, n - 1)];
}

/** Estilo "flex/galería": filas que llenan el ancho respetando cada proporción. */
function flexCells(items: LayoutItem[], a: Rect): Rect[] {
  const n = items.length;
  const sumAR = items.reduce((s, i) => s + i.ar, 0);
  let best: { cells: Rect[]; score: number } | null = null;

  for (let r = 1; r <= n; r++) {
    const rows: number[][] = [];
    let cur: number[] = [];
    let curSum = 0;
    const target = sumAR / r;
    items.forEach((it, i) => {
      cur.push(i);
      curSum += it.ar;
      const left = n - 1 - i;
      const needed = r - 1 - rows.length;
      if (rows.length < r - 1 && left >= needed && (curSum >= target * 0.98 || left === needed)) {
        rows.push(cur);
        cur = [];
        curSum = 0;
      }
    });
    if (cur.length) rows.push(cur);

    const data = rows.map((idx) => {
      const capW = a.w - GAP * (idx.length - 1);
      const sum = idx.reduce((s, i) => s + items[i].ar, 0);
      const imgH = capW / sum;
      const cap = Math.max(...idx.map((i) => items[i].capH));
      return { idx, capW, imgH, cap };
    });
    const gapsV = GAP * (data.length - 1);
    const sumCap = data.reduce((s, d) => s + d.cap, 0);
    const sumImgH = data.reduce((s, d) => s + d.imgH, 0);
    const s = Math.min(1, (a.h - gapsV - sumCap) / sumImgH);
    if (s <= 0.05) continue;
    const score = data.reduce((acc, d) => acc + s * d.imgH * s * d.capW, 0);

    if (!best || score > best.score) {
      const totalH = data.reduce((acc, d) => acc + s * d.imgH + d.cap, 0) + gapsV;
      let y = a.y + (a.h - totalH) / 2;
      const cells: Rect[] = new Array(n);
      data.forEach((d) => {
        const rowW = s * d.capW + GAP * (d.idx.length - 1);
        let x = a.x + (a.w - rowW) / 2;
        const rowH = s * d.imgH + d.cap;
        d.idx.forEach((i) => {
          const w = s * d.imgH * items[i].ar;
          cells[i] = { x, y, w, h: rowH };
          x += w + GAP;
        });
        y += rowH + GAP;
      });
      best = { cells, score };
    }
  }
  return best ? (best as { cells: Rect[] }).cells : gridCells(a, n);
}

function fit(item: LayoutItem, cell: Rect): Rect {
  const availH = Math.max(cell.h - item.capH, 20);
  const w = Math.max(20, Math.min(cell.w, availH * item.ar));
  const h = w / item.ar;
  const totalH = h + item.capH;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - totalH) / 2, w, h };
}

/** Devuelve el rectángulo final (solo de la imagen) para cada elemento. */
export function computeLayout(id: ArrangeLayoutId, items: LayoutItem[], area: Rect): Rect[] {
  const n = items.length;
  const l = Math.ceil(n / 2);
  let cells: Rect[];
  switch (id) {
    case 'cols':
      cells = spreadH(area, n);
      break;
    case 'rows':
      cells = stackV(area, n);
      break;
    case 'half-h': {
      if (n === 1) { cells = [area]; break; }
      const w = (area.w - GAP) / 2;
      cells = [
        ...stackV({ ...area, w }, l),
        ...stackV({ ...area, x: area.x + w + GAP, w }, n - l),
      ];
      break;
    }
    case 'half-v': {
      if (n === 1) { cells = [area]; break; }
      const h = (area.h - GAP) / 2;
      cells = [
        ...spreadH({ ...area, h }, l),
        ...spreadH({ ...area, y: area.y + h + GAP, h }, n - l),
      ];
      break;
    }
    case 'h-60-40':
      cells = pctH(area, n, 0.6);
      break;
    case 'h-70-30':
      cells = pctH(area, n, 0.7);
      break;
    case 'v-60-40':
      cells = pctV(area, n, 0.6);
      break;
    case 'v-70-30':
      cells = pctV(area, n, 0.7);
      break;
    case 'flex':
      cells = flexCells(items, area);
      break;
    case 'grid':
    default:
      cells = gridCells(area, n);
  }
  return items.map((it, i) => fit(it, cells[i]));
}
