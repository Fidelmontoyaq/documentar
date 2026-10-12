// Herramientas directas sobre PDF (sin abrir el lienzo): unir y dividir. Todo en el navegador con pdf-lib.
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
const isImg = (f: File) => /\.(png|jpe?g)$/i.test(f.name) || /^image\/(png|jpeg)$/.test(f.type);
export const isMergeable = (f: File) => isPdf(f) || isImg(f);

const toBlob = (bytes: Uint8Array, type = 'application/pdf') => new Blob([bytes as unknown as BlobPart], { type });

/** Convierte cualquier imagen del navegador a PNG (para webp/gif, que pdf-lib no entiende). */
async function imageToPng(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Une PDF e imágenes (en el orden dado) en un solo PDF. Las imágenes ocupan una hoja del tamaño de la imagen. */
export async function mergeFiles(files: File[], onProgress?: (i: number, n: number) => void): Promise<Blob> {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const f = files[i];
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (isPdf(f)) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else {
      let img;
      if (/\.png$/i.test(f.name) || f.type === 'image/png') img = await out.embedPng(bytes);
      else if (/\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg') img = await out.embedJpg(bytes);
      else img = await out.embedPng(await imageToPng(f));
      // Imagen grande: se limita a un lado de 842 pt (≈ A4) manteniendo la proporción.
      const k = Math.min(1, 842 / Math.max(img.width, img.height));
      const w = img.width * k;
      const h = img.height * k;
      const page = out.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    }
  }
  onProgress?.(files.length, files.length);
  return toBlob(await out.save());
}

export async function countPdfPages(file: File): Promise<number> {
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  return src.getPageCount();
}

/** "1-3, 5, 8-" → [[0,1,2],[4],[7,…]] (cada grupo separado por coma). Devuelve null si algo no es válido. */
export function parseRanges(text: string, total: number): number[][] | null {
  const groups: number[][] = [];
  for (const raw of text.split(/[,;]/).map((t) => t.trim()).filter(Boolean)) {
    const m = raw.match(/^(\d*)\s*-\s*(\d*)$/) ?? raw.match(/^(\d+)$/);
    if (!m) return null;
    let a: number, b: number;
    if (m.length === 2) { a = b = Number(m[1]); }
    else { a = m[1] ? Number(m[1]) : 1; b = m[2] ? Number(m[2]) : total; }
    if (!a || !b || a > total || b > total) return null;
    const g: number[] = [];
    if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1);
    else for (let i = a; i >= b; i--) g.push(i - 1);
    groups.push(g);
  }
  return groups.length ? groups : null;
}

export type SplitMode = { kind: 'each' } | { kind: 'every'; n: number } | { kind: 'ranges'; text: string } | { kind: 'extract'; text: string };

async function sub(src: PDFDocument, idx: number[]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  (await d.copyPages(src, idx)).forEach((p) => d.addPage(p));
  return d.save();
}

/**
 * Divide un PDF. Devuelve uno o varios PDF con nombre; si son varios, `zip` ya los trae empaquetados.
 */
export async function splitPdf(file: File, mode: SplitMode): Promise<{ parts: { name: string; blob: Blob }[]; zip: Blob | null }> {
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const total = src.getPageCount();
  const base = file.name.replace(/\.pdf$/i, '');
  let groups: number[][];
  if (mode.kind === 'each') groups = src.getPageIndices().map((i) => [i]);
  else if (mode.kind === 'every') {
    const n = Math.max(1, Math.floor(mode.n));
    groups = [];
    for (let i = 0; i < total; i += n) groups.push(src.getPageIndices().slice(i, i + n));
  } else {
    const g = parseRanges(mode.text, total);
    if (!g) throw new Error(`Revisa los rangos: usa números entre 1 y ${total}, por ejemplo 1-3, 5, 8-${total}.`);
    groups = mode.kind === 'extract' ? [g.flat()] : g;
  }
  const parts: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const label = mode.kind === 'extract' ? 'paginas_extraidas' : g.length === 1 ? `pag_${g[0] + 1}` : `pags_${g[0] + 1}-${g[g.length - 1] + 1}`;
    parts.push({ name: `${base}_${label}.pdf`, blob: toBlob(await sub(src, g)) });
  }
  let zip: Blob | null = null;
  if (parts.length > 1) {
    const z = new JSZip();
    parts.forEach((p) => z.file(p.name, p.blob));
    zip = await z.generateAsync({ type: 'blob' });
  }
  return { parts, zip };
}

/** Corta el PDF en dos: las páginas 1..after y el resto. */
export async function cutPdf(file: File, after: number): Promise<{ name: string; blob: Blob }[]> {
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const total = src.getPageCount();
  if (after < 1 || after >= total) throw new Error(`Elige una página entre 1 y ${total - 1}: el corte se hace después de ella.`);
  const base = file.name.replace(/\.pdf$/i, '');
  const idx = src.getPageIndices();
  return [
    { name: `${base}_parte1_pags_1-${after}.pdf`, blob: toBlob(await sub(src, idx.slice(0, after))) },
    { name: `${base}_parte2_pags_${after + 1}-${total}.pdf`, blob: toBlob(await sub(src, idx.slice(after))) },
  ];
}

/** Quita las páginas indicadas ("2, 5-7"). */
export async function deletePages(file: File, text: string): Promise<Blob> {
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const total = src.getPageCount();
  const g = parseRanges(text, total);
  if (!g) throw new Error(`Revisa las páginas: usa números entre 1 y ${total}, por ejemplo 2, 5-7.`);
  const del = new Set(g.flat());
  const keep = src.getPageIndices().filter((i) => !del.has(i));
  if (!keep.length) throw new Error('No puedes eliminar todas las páginas.');
  return toBlob(await sub(src, keep));
}

/**
 * Añade páginas a un PDF: en blanco o tomadas de otro PDF/imágenes, al inicio, al final o después de la página `at`.
 */
export async function addPages(file: File, opts: { at: number; blank: number; from?: File[] }): Promise<Blob> {
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true });
  const total = src.getPageCount();
  const at = Math.min(Math.max(opts.at, 0), total);
  const first = src.getPage(Math.min(at, total - 1));
  const { width, height } = first.getSize();
  let pos = at;
  for (let i = 0; i < opts.blank; i++) src.insertPage(pos++, [width, height]);
  if (opts.from?.length) {
    const extra = await PDFDocument.load(new Uint8Array(await (await mergeFiles(opts.from)).arrayBuffer()));
    const pages = await src.copyPages(extra, extra.getPageIndices());
    pages.forEach((p) => src.insertPage(pos++, p));
  }
  return toBlob(await src.save());
}

export { downloadBlob } from './folioBatch';
