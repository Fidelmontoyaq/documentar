// Texto de las páginas de un PDF importado: se extrae con pdf.js (posición, tamaño y
// fuente de cada trozo), se agrupa en "bloques" de una línea y se guarda en memoria
// para poder editarlo luego en el sitio.
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { allFonts, ensureFontLoaded, type LibFont } from './fontLibrary';

/** Un bloque de texto de una línea, en píxeles de la imagen de la página. */
export interface PdfRun {
  id: string;
  text: string;
  /** Esquina izquierda y línea base. */
  x: number;
  y: number;
  w: number;
  /** Tamaño de letra. */
  fs: number;
  /** Nombre interno de la fuente en pdf.js (g_d0_f1…): la fuente incrustada ya está cargada con ese nombre. */
  font: string;
  asc: number;
  desc: number;
  /** Área original del texto (la que hay que tapar al editar). */
  box: [number, number, number, number];
  edited?: boolean;
  /** Estilo con el que se editó por última vez. */
  style?: { stack: string; color: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; fs: number; center: boolean };
}

export interface PdfFontInfo {
  real: string;
  bold: boolean;
  italic: boolean;
  generic: 'serif' | 'sans' | 'mono';
}

export interface PdfPageData {
  docId: string;
  pageNum: number;
  scale: number;
  w: number;
  h: number;
  runs: PdfRun[];
  fonts: Record<string, PdfFontInfo>;
}

// ---- registros en memoria (los documentos y las versiones del texto de cada página)
const docs = new Map<string, PDFDocumentProxy>();
const pages = new Map<string, PdfPageData>();
let seq = 0;

export const newPdfId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
export function registerPdfDoc(id: string, doc: PDFDocumentProxy) {
  docs.set(id, doc);
}
export function registerPdfPage(id: string, data: PdfPageData) {
  pages.set(id, data);
}
export function getPdfPage(id: string | undefined | null): PdfPageData | undefined {
  return id ? pages.get(id) : undefined;
}
export async function getPdfPageProxy(data: PdfPageData): Promise<PDFPageProxy | null> {
  const doc = docs.get(data.docId);
  return doc ? doc.getPage(data.pageNum) : null;
}

// ---- extracción -----------------------------------------------------------------------

interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  fs: number;
  font: string;
}

function safeFontObj(page: PDFPageProxy, id: string): { name?: string; bold?: boolean; italic?: boolean; black?: boolean } | null {
  try {
    const objs = page.commonObjs as unknown as { has: (k: string) => boolean; get: (k: string) => unknown };
    return objs.has(id) ? (objs.get(id) as { name?: string }) : null;
  } catch {
    return null;
  }
}

const genericOf = (name: string, css?: string): 'serif' | 'sans' | 'mono' => {
  const n = (name || css || '').toLowerCase();
  if (/mono|courier|consolas|typewriter|code/.test(n)) return 'mono';
  if (/serif(?!.*sans)|times|georgia|garamond|palatino|cambria|roman|book|minion|baskerville|didot|caslon/.test(n) && !/sans/.test(n)) return 'serif';
  return 'sans';
};

/**
 * Agrupa los trozos de texto de pdf.js en bloques de una línea. Ignora el texto
 * girado (no se puede editar en el sitio).
 */
export async function extractPageText(
  page: PDFPageProxy,
  viewport: { transform: number[]; scale: number; width: number; height: number },
  docId: string,
  pageNum: number
): Promise<PdfPageData> {
  const content = await page.getTextContent();
  const styles = content.styles as Record<string, { fontFamily?: string; ascent?: number; descent?: number }>;
  const raw: RawItem[] = [];
  const fonts: Record<string, PdfFontInfo> = {};
  const Util = (pdfjsLib as unknown as { Util: { transform: (a: number[], b: number[]) => number[] } }).Util;

  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue;
    const tx = Util.transform(viewport.transform, it.transform as number[]);
    const fs = Math.hypot(tx[2], tx[3]);
    const angle = Math.atan2(tx[1], tx[0]);
    if (!fs || Math.abs(angle) > 0.06) continue;
    raw.push({ str: it.str, x: tx[4], y: tx[5], w: (it.width as number) * viewport.scale, fs, font: it.fontName as string });
    if (!fonts[it.fontName as string]) {
      const fo = safeFontObj(page, it.fontName as string);
      const real = (fo?.name ?? '').toString();
      const st = styles[it.fontName as string];
      fonts[it.fontName as string] = {
        real,
        bold: !!fo?.bold || !!fo?.black || /bold|black|heavy|semibold|demi/i.test(real),
        italic: !!fo?.italic || /italic|oblique/i.test(real),
        generic: genericOf(real, st?.fontFamily),
      };
    }
  }

  // Ordenar por línea (base) y luego por x.
  raw.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.fs, b.fs) * 0.35 ? a.x - b.x : a.y - b.y));

  const runs: PdfRun[] = [];
  let cur: { items: RawItem[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const first = cur.items[0];
    const last = cur.items[cur.items.length - 1];
    const text = cur.items.reduce((acc, it, i) => {
      if (i === 0) return it.str;
      const prev = cur!.items[i - 1];
      const gap = it.x - (prev.x + prev.w);
      const needSpace = gap > it.fs * 0.14 && !/\s$/.test(acc) && !/^\s/.test(it.str);
      return acc + (needSpace ? ' ' : '') + it.str;
    }, '');
    const trimmed = text.replace(/\s+$/g, '');
    if (trimmed.trim()) {
      const st = styles[first.font];
      const asc = Math.max(0.8, st?.ascent ?? 0.9);
      const desc = Math.max(0.22, Math.abs(st?.descent ?? 0.22));
      const x0 = first.x;
      const w = Math.max(1, last.x + last.w - first.x);
      runs.push({
        id: `r${runs.length}`,
        text: trimmed,
        x: x0,
        y: first.y,
        w,
        fs: first.fs,
        font: first.font,
        asc,
        desc,
        box: [x0 - 2, first.y - asc * first.fs, x0 + w + 2, first.y + desc * first.fs],
      });
    }
    cur = null;
  };
  for (const it of raw) {
    if (!cur) {
      cur = { items: [it] };
      continue;
    }
    const prev = cur.items[cur.items.length - 1];
    const sameLine = Math.abs(prev.y - it.y) < Math.min(prev.fs, it.fs) * 0.35;
    const gap = it.x - (prev.x + prev.w);
    const sameStyle = prev.font === it.font && Math.abs(prev.fs - it.fs) < prev.fs * 0.15;
    if (sameLine && sameStyle && gap < it.fs * 0.9 && gap > -it.fs * 0.5) cur.items.push(it);
    else {
      flush();
      cur = { items: [it] };
    }
  }
  flush();

  return { docId, pageNum, scale: viewport.scale, w: viewport.width, h: viewport.height, runs, fonts };
}

// ---- equivalencia de tipografías ---------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Nombre "limpio" de la fuente de un PDF: sin prefijo de subconjunto ni estilo (ABCDEF+Arial-BoldMT → Arial). */
export function cleanFontName(real: string): string {
  let n = real.replace(/^[A-Z]{6}\+/, '');
  n = n.split(/[-,]/)[0];
  n = n.replace(/(MT|PS|PSMT|Std|Pro)$/i, '');
  return n.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

const ALIAS: Record<string, string> = {
  arial: 'Arial', helvetica: 'Arial', helveticaneue: 'Arial', liberationsans: 'Arial', arimo: 'Arial', nimbussans: 'Arial',
  timesnewroman: 'Times New Roman', times: 'Times New Roman', timesroman: 'Times New Roman', liberationserif: 'Times New Roman', nimbusroman: 'Times New Roman',
  couriernew: 'Courier New', courier: 'Courier New', liberationmono: 'Courier New',
  calibri: 'Calibri', carlito: 'Calibri', candara: 'Calibri', cambria: 'Cambria', caladea: 'Cambria',
  georgia: 'Georgia', garamond: 'Garamond', palatino: 'Book Antiqua / Palatino', palatinolinotype: 'Book Antiqua / Palatino', bookantiqua: 'Book Antiqua / Palatino',
  constantia: 'Constantia', bookmanoldstyle: 'Bookman Old Style', centuryschoolbook: 'Century Schoolbook',
  verdana: 'Open Sans', tahoma: 'Open Sans', segoeui: 'Open Sans', trebuchetms: 'Open Sans', dejavusans: 'Open Sans', opensans: 'Open Sans',
};

export interface FontMatch {
  /** Valor CSS listo para usar: la fuente original del PDF primero y la equivalente de respaldo. */
  stack: string;
  /** Solo la equivalente (sin la original), para mostrarla en el selector. */
  fallback: string;
  label: string;
  /** Se encontró una fuente con ese mismo nombre (subida por el usuario o del catálogo). */
  exact: boolean;
  bold: boolean;
  italic: boolean;
}

export function matchPdfFont(data: PdfPageData, run: PdfRun): FontMatch {
  const info = data.fonts[run.font] ?? { real: '', bold: false, italic: false, generic: 'sans' as const };
  const clean = cleanFontName(info.real);
  const n = norm(clean);
  const lib = allFonts();
  let found: LibFont | undefined;
  let exact = false;
  if (n) {
    found = lib.find((f) => norm(f.family) === n || norm(f.label) === n);
    if (found) exact = true;
    if (!found && ALIAS[n]) found = lib.find((f) => f.label === ALIAS[n]);
    if (!found && n.length >= 5) found = lib.find((f) => norm(f.family).length >= 5 && (n.startsWith(norm(f.family)) || norm(f.family).startsWith(n)));
  }
  if (!found) {
    const label = info.generic === 'serif' ? 'Times New Roman' : info.generic === 'mono' ? 'Courier New' : 'Arial';
    found = lib.find((f) => f.label === label);
  }
  const fallback = found?.value ?? (info.generic === 'serif' ? 'serif' : info.generic === 'mono' ? 'monospace' : 'sans-serif');
  if (found) ensureFontLoaded(found.family);
  // Las letras que el PDF ya trae se dibujan con su fuente original; las nuevas, con la equivalente.
  const stack = `'${run.font}', ${fallback}`;
  return { stack, fallback, label: found?.label ?? clean ?? 'Fuente', exact, bold: info.bold, italic: info.italic };
}

/** ¿Es un nombre interno de pdf.js (g_d0_f1)? */
export const isPdfInternalFont = (family: string) => /^g_d\d+_f\d+$/.test(family);
