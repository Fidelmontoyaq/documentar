// Foliado por lotes: toma 1 o 100 archivos (PDF o imágenes), les estampa el
// folio con pdf-lib y devuelve un ZIP (o un solo PDF unido) ya foliado.
import { PDFDocument, degrees, type PDFImage } from 'pdf-lib';
import JSZip from 'jszip';
import {
  computeStampPlacement,
  folioPosition,
  folioText,
  renderFolioBadge,
  type FolioConfig,
} from './folio';
import { fileExtension, readFileAsDataURL, loadImageNaturalSize } from './fileUtils';

export interface FolioBatchOptions {
  /** 'each': cada archivo empieza desde su número inicial · 'continuous': la numeración sigue entre archivos. */
  numbering: 'each' | 'continuous';
  /** 'zip': un PDF por archivo dentro de un ZIP · 'merged': un único PDF con todo. */
  output: 'zip' | 'merged';
}

export interface FolioBatchFileResult {
  name: string;
  ok: boolean;
  pages: number;
  message?: string;
}

export interface FolioBatchResult {
  blob: Blob;
  filename: string;
  results: FolioBatchFileResult[];
}

const A4 = { w: 595.28, h: 841.89 };
const PT = 0.75; // 1 px CSS = 0,75 pt

export const BATCH_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif';

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

async function imageToPdf(file: File): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const ext = fileExtension(file.name);
  let bytes: Uint8Array;
  let embed: 'png' | 'jpg';
  if (ext === 'png') {
    bytes = new Uint8Array(await file.arrayBuffer());
    embed = 'png';
  } else if (ext === 'jpg' || ext === 'jpeg') {
    bytes = new Uint8Array(await file.arrayBuffer());
    embed = 'jpg';
  } else {
    // webp / gif: se convierten a PNG con un canvas.
    const src = await readFileAsDataURL(file);
    const nat = await loadImageNaturalSize(src);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('No se pudo leer la imagen'));
      img.src = src;
    });
    const c = document.createElement('canvas');
    c.width = nat.w;
    c.height = nat.h;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b as Blob), 'image/png'));
    bytes = new Uint8Array(await blob.arrayBuffer());
    embed = 'png';
  }
  const image = embed === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const landscape = image.width > image.height * 1.05;
  const pw = landscape ? A4.h : A4.w;
  const ph = landscape ? A4.w : A4.h;
  const page = doc.addPage([pw, ph]);
  const scale = Math.min(pw / image.width, ph / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return doc;
}

async function loadAsPdf(file: File): Promise<PDFDocument> {
  const ext = fileExtension(file.name);
  if (ext === 'pdf') {
    return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return imageToPdf(file);
  throw new Error('Formato no compatible (usa PDF o imágenes)');
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (b) => {
      if (!b) return reject(new Error('No se pudo generar el sello'));
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, 'image/png');
  });
}

/** Estampa el folio en todas las hojas de `doc`. `globalStart` = índice de la primera hoja dentro de la secuencia. */
async function stampDocument(doc: PDFDocument, cfg: FolioConfig, globalStart: number, seqTotal: number) {
  const pages = doc.getPages();
  const cache = new Map<string, { img: PDFImage; w: number; h: number }>();
  for (let i = 0; i < pages.length; i++) {
    const text = folioText(globalStart + i, seqTotal, cfg);
    if (!text) continue;
    let entry = cache.get(text);
    if (!entry) {
      const badge = await renderFolioBadge(text, cfg, 4);
      const img = await doc.embedPng(await canvasToPngBytes(badge.canvas));
      entry = { img, w: badge.w * PT, h: badge.h * PT };
      cache.set(text, entry);
    }
    const page = pages[i];
    const crop = page.getCropBox();
    const rot = (((page.getRotation().angle % 360) + 360) % 360);
    const visW = rot === 90 || rot === 270 ? crop.height : crop.width;
    const visH = rot === 90 || rot === 270 ? crop.width : crop.height;
    // Los márgenes del diseño están en px; en el PDF se convierten a puntos.
    const pos = folioPosition(
      { ...cfg, offsetX: cfg.offsetX * PT, offsetY: cfg.offsetY * PT },
      visW,
      visH,
      entry.w,
      entry.h
    );
    const p = computeStampPlacement(crop, rot, pos.x, pos.y, entry.w, entry.h);
    page.drawImage(entry.img, { x: p.x, y: p.y, width: entry.w, height: entry.h, rotate: degrees(p.angle) });
  }
}

function uniqueName(used: Set<string>, name: string): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = name.replace(/(\.pdf)$/i, ` (${n}).pdf`);
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function foliateFiles(
  files: File[],
  cfg: FolioConfig,
  opts: FolioBatchOptions,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<FolioBatchResult> {
  const loaded: { file: File; doc: PDFDocument | null; pages: number; error?: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length * 2, `Leyendo ${files[i].name}`);
    try {
      const doc = await loadAsPdf(files[i]);
      loaded.push({ file: files[i], doc, pages: doc.getPageCount() });
    } catch (err) {
      loaded.push({ file: files[i], doc: null, pages: 0, error: err instanceof Error ? err.message : 'No se pudo leer el archivo' });
    }
  }

  const okOnes = loaded.filter((l) => l.doc);
  if (okOnes.length === 0) {
    throw new Error('Ningún archivo se pudo leer. Revisa que sean PDF (sin contraseña) o imágenes.');
  }
  const grandTotal = okOnes.reduce((a, l) => a + l.pages, 0);

  let running = 0;
  for (let i = 0; i < okOnes.length; i++) {
    const item = okOnes[i];
    onProgress?.(files.length + i, files.length * 2, `Foliando ${item.file.name}`);
    try {
      if (opts.numbering === 'continuous') {
        await stampDocument(item.doc!, cfg, running, grandTotal);
      } else {
        await stampDocument(item.doc!, cfg, 0, item.pages);
      }
    } catch (err) {
      item.error = err instanceof Error ? err.message : 'Error al foliar';
      item.doc = null;
    }
    running += item.pages;
  }

  const results: FolioBatchFileResult[] = loaded.map((l) => ({
    name: l.file.name,
    ok: !!l.doc,
    pages: l.pages,
    message: l.error,
  }));
  const good = loaded.filter((l) => l.doc);
  if (good.length === 0) throw new Error('No se pudo foliar ningún archivo.');

  if (opts.output === 'merged' || good.length === 1) {
    if (good.length === 1) {
      const bytes = await good[0].doc!.save();
      return {
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        filename: `${baseName(good[0].file.name)}_foliado.pdf`,
        results,
      };
    }
    const merged = await PDFDocument.create();
    for (const g of good) {
      const copied = await merged.copyPages(g.doc!, g.doc!.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
    }
    const bytes = await merged.save();
    return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), filename: 'documentos_foliados.pdf', results };
  }

  const zip = new JSZip();
  const used = new Set<string>();
  for (const g of good) {
    zip.file(uniqueName(used, `${baseName(g.file.name)}_foliado.pdf`), await g.doc!.save());
  }
  onProgress?.(files.length * 2, files.length * 2, 'Comprimiendo ZIP');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: 'documentos_foliados.zip', results };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
