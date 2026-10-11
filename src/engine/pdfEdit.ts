// Edición de texto en el sitio sobre las páginas de un PDF importado.
//
// Cada página es una imagen. Al tocar un texto se abre una capa de edición invisible
// (misma fuente, tamaño y color) justo encima. Al confirmar, el texto viejo se tapa con
// el fondo real de la página (la página dibujada sin texto) o, si no se puede, con un
// relleno que continúa el fondo (degradados incluidos), y el texto nuevo se dibuja encima.
import {
  getPdfPage,
  getPdfPageProxy,
  matchPdfFont,
  newPdfId,
  registerPdfPage,
  type PdfPageData,
  type PdfRun,
} from './pdfText';

type Box = [number, number, number, number];

export interface PdfEditHost {
  pagesWrapper: HTMLElement;
  showToolbar(el: HTMLElement): void;
  hideToolbar(): void;
  refreshToolbar(): void;
  commit(): void;
  notify(msg: string): void;
  onModeChange(on: boolean): void;
}

// ================================================================= trabajo sobre píxeles

const clampBox = (b: Box, w: number, h: number): Box => [
  Math.max(0, Math.floor(b[0])),
  Math.max(0, Math.floor(b[1])),
  Math.min(w, Math.ceil(b[2])),
  Math.min(h, Math.ceil(b[3])),
];
const unionBox = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

async function imageToCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  if (!img.complete) await new Promise((r) => { img.onload = () => r(null); img.onerror = () => r(null); });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
  return c;
}

/**
 * Relleno que continúa el fondo alrededor de la caja: mezcla los cuatro bordes
 * (interpolación de Coons), así un degradado horizontal, vertical o en esquina se
 * continúa sin que se note el parche.
 */
function coonsPatch(src: HTMLCanvasElement, box: Box): ImageData {
  const [x0, y0, x1, y1] = clampBox(box, src.width, src.height);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  const T = 2; // grosor del anillo que se muestrea
  const sx0 = Math.max(0, x0 - T), sy0 = Math.max(0, y0 - T);
  const sx1 = Math.min(src.width, x1 + T), sy1 = Math.min(src.height, y1 + T);
  const ring = ctx.getImageData(sx0, sy0, sx1 - sx0, sy1 - sy0);
  const rw = sx1 - sx0;
  const px = (x: number, y: number): [number, number, number] => {
    const cx = Math.min(sx1 - 1, Math.max(sx0, x)) - sx0;
    const cy = Math.min(sy1 - 1, Math.max(sy0, y)) - sy0;
    const i = (cy * rw + cx) * 4;
    return [ring.data[i], ring.data[i + 1], ring.data[i + 2]];
  };
  const avg = (list: [number, number, number][]): [number, number, number] => {
    const n = list.length || 1;
    return [0, 1, 2].map((k) => list.reduce((a, c) => a + c[k], 0) / n) as [number, number, number];
  };
  const L: [number, number, number][] = [], R: [number, number, number][] = [];
  for (let y = 0; y < h; y++) {
    L.push(avg([px(x0 - 1, y0 + y), px(x0 - 2, y0 + y)]));
    R.push(avg([px(x1, y0 + y), px(x1 + 1, y0 + y)]));
  }
  const Tp: [number, number, number][] = [], Bp: [number, number, number][] = [];
  for (let x = 0; x < w; x++) {
    Tp.push(avg([px(x0 + x, y0 - 1), px(x0 + x, y0 - 2)]));
    Bp.push(avg([px(x0 + x, y1), px(x0 + x, y1 + 1)]));
  }
  const TL = px(x0 - 1, y0 - 1), TR = px(x1, y0 - 1), BL = px(x0 - 1, y1), BR = px(x1, y1);
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const ty = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const tx = (x + 0.5) / w;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const v =
          (1 - tx) * L[y][k] + tx * R[y][k] + (1 - ty) * Tp[x][k] + ty * Bp[x][k] -
          ((1 - tx) * (1 - ty) * TL[k] + tx * (1 - ty) * TR[k] + (1 - tx) * ty * BL[k] + tx * ty * BR[k]);
        out.data[o + k] = Math.max(0, Math.min(255, v));
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

const cleanCache = new Map<string, HTMLCanvasElement | null>();

/** La página tal como se ve, pero sin su texto (si pdf.js lo permite). */
async function renderClean(data: PdfPageData): Promise<HTMLCanvasElement | null> {
  const key = `${data.docId}:${data.pageNum}`;
  if (cleanCache.has(key)) return cleanCache.get(key)!;
  let result: HTMLCanvasElement | null = null;
  try {
    const page = await getPdfPageProxy(data);
    if (page) {
      const viewport = page.getViewport({ scale: data.scale });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      // pdf.js dibuja casi todo el texto con fillText/strokeText: si se anulan, queda el fondo solo.
      ctx.fillText = () => undefined;
      ctx.strokeText = () => undefined;
      await page.render({ canvasContext: ctx, viewport }).promise;
      result = c;
    }
  } catch {
    result = null;
  }
  if (cleanCache.size > 4) cleanCache.delete(cleanCache.keys().next().value as string);
  cleanCache.set(key, result);
  return result;
}

interface Patch {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** 'page' = fondo real de la página; 'fill' = relleno que continúa el fondo. */
  source: 'page' | 'fill';
  /** Color del texto original (el que más se aleja del fondo). */
  ink: string | null;
}

const dist2 = (a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number) => {
  const dr = a[i] - b[j], dg = a[i + 1] - b[j + 1], db = a[i + 2] - b[j + 2];
  return dr * dr + dg * dg + db * db;
};

async function buildPatch(pageCanvas: HTMLCanvasElement, data: PdfPageData, box: Box, origBox: Box): Promise<Patch> {
  const b = clampBox(box, pageCanvas.width, pageCanvas.height);
  const w = Math.max(1, b[2] - b[0]);
  const h = Math.max(1, b[3] - b[1]);
  const pctx = pageCanvas.getContext('2d', { willReadFrequently: true })!;
  const cur = pctx.getImageData(b[0], b[1], w, h);
  const fill = coonsPatch(pageCanvas, b);

  // Tinta del texto original: los píxeles que más se alejan del relleno, dentro de la caja original.
  const ob = clampBox(origBox, pageCanvas.width, pageCanvas.height);
  let inkR = 0, inkG = 0, inkB = 0, inkN = 0;
  const inkIdx: number[] = [];
  let maxD = 0;
  for (let y = Math.max(ob[1], b[1]); y < Math.min(ob[3], b[3]); y++) {
    for (let x = Math.max(ob[0], b[0]); x < Math.min(ob[2], b[2]); x++) {
      const i = ((y - b[1]) * w + (x - b[0])) * 4;
      const d = dist2(cur.data, i, fill.data, i);
      if (d > 60 * 60) {
        inkIdx.push(i);
        if (d > maxD) maxD = d;
      }
    }
  }
  for (const i of inkIdx) {
    if (dist2(cur.data, i, fill.data, i) >= maxD * 0.65) {
      inkR += cur.data[i]; inkG += cur.data[i + 1]; inkB += cur.data[i + 2]; inkN++;
    }
  }
  const ink = inkN ? `rgb(${Math.round(inkR / inkN)},${Math.round(inkG / inkN)},${Math.round(inkB / inkN)})` : null;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;

  // 1) Fondo real de la página (sin texto), si de verdad quitó el texto.
  const clean = await renderClean(data);
  if (clean && clean.width === pageCanvas.width && clean.height === pageCanvas.height) {
    const cd = clean.getContext('2d', { willReadFrequently: true })!.getImageData(b[0], b[1], w, h);
    // ¿Sigue habiendo texto en la versión "limpia"? Comparamos los píxeles de tinta originales.
    let remain = 0;
    for (const i of inkIdx) if (dist2(cd.data, i, cur.data, i) < 30 * 30) remain++;
    const stillThere = inkIdx.length > 12 && remain / inkIdx.length > 0.5;
    // El borde exterior de la zona limpia debe coincidir con la página actual.
    let edgeBad = 0, edgeN = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      if (dist2(cd.data, i, fill.data, i) > 90 * 90) edgeBad++;
      edgeN++;
    }
    if (!stillThere && edgeBad / Math.max(1, edgeN) < 0.35) {
      octx.putImageData(cd, 0, 0);
      return { canvas: out, x: b[0], y: b[1], source: 'page', ink };
    }
  }
  // 2) Relleno que continúa el fondo.
  octx.putImageData(fill, 0, 0);
  return { canvas: out, x: b[0], y: b[1], source: 'fill', ink };
}

// ================================================================= controlador

interface Editing {
  page: HTMLElement;
  img: HTMLImageElement;
  data: PdfPageData;
  run: PdfRun;
  el: HTMLDivElement;
  patch: Patch;
  /** Caracteres que la fuente original del PDF ya trae. */
  have: Set<string>;
  fallback: string;
  fallbackLabel: string;
  infoBold: boolean;
  infoItalic: boolean;
  center: boolean;
  /** El usuario eligió fuente/estilo a mano: ya no se decide solo. */
  manual: boolean;
  startText: string;
  startSig: string;
  warned: boolean;
  // geometría: píxeles de imagen → CSS de la página
  k: number;
  ox: number;
  oy: number;
}

export class PdfEditController {
  private on = false;
  private editing: Editing | null = null;
  private hover: HTMLElement | null = null;
  private busy = false;
  private boundDown = (e: PointerEvent) => void this.onDown(e);
  private boundMove = (e: PointerEvent) => this.onMove(e);

  constructor(private host: PdfEditHost) {}

  isOn() {
    return this.on;
  }

  isEditingEl(el: Element | null | undefined) {
    return !!el && !!this.editing && this.editing.el === el;
  }

  async setMode(on: boolean) {
    if (on === this.on) return;
    if (!on) await this.commit();
    this.on = on;
    this.host.pagesWrapper.classList.toggle('pdf-edit-mode', on);
    if (on) {
      document.addEventListener('pointerdown', this.boundDown, true);
      document.addEventListener('pointermove', this.boundMove, true);
      if (!this.host.pagesWrapper.querySelector('img[data-pdf-id]')) {
        this.host.notify('Sube un PDF para poder editar su texto.');
      }
    } else {
      document.removeEventListener('pointerdown', this.boundDown, true);
      document.removeEventListener('pointermove', this.boundMove, true);
      this.clearHover();
    }
    this.host.onModeChange(on);
  }

  destroy() {
    document.removeEventListener('pointerdown', this.boundDown, true);
    document.removeEventListener('pointermove', this.boundMove, true);
  }

  // ---------------------------------------------------------- geometría y localización

  private geom(page: HTMLElement, img: HTMLImageElement) {
    const pr = page.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const zf = pr.width / Math.max(1, page.offsetWidth);
    const W = img.naturalWidth || 1, H = img.naturalHeight || 1;
    const s = Math.min(ir.width / W, ir.height / H); // píxeles de pantalla por píxel de imagen
    const offX = (ir.width - W * s) / 2, offY = (ir.height - H * s) / 2;
    return {
      zf,
      sScreen: s,
      k: s / zf,
      ox: (ir.left + offX - pr.left) / zf,
      oy: (ir.top + offY - pr.top) / zf,
      left: ir.left + offX,
      top: ir.top + offY,
    };
  }

  private hit(page: HTMLElement, img: HTMLImageElement, clientX: number, clientY: number): PdfRun | null {
    const data = getPdfPage(img.dataset.pdfId);
    if (!data) return null;
    const g = this.geom(page, img);
    const ix = (clientX - g.left) / g.sScreen;
    const iy = (clientY - g.top) / g.sScreen;
    let best: PdfRun | null = null;
    let bestArea = Infinity;
    for (const r of data.runs) {
      const tol = r.fs * 0.12;
      const [x0, y0, x1, y1] = r.box;
      if (ix >= x0 - tol && ix <= x1 + tol && iy >= y0 - tol && iy <= y1 + tol) {
        const area = (x1 - x0) * (y1 - y0);
        if (area < bestArea) {
          best = r;
          bestArea = area;
        }
      }
    }
    return best;
  }

  private pdfImgAt(clientX: number, clientY: number): { page: HTMLElement; img: HTMLImageElement } | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const page = el?.closest<HTMLElement>('.a4-page[data-pdf-page="true"]') ?? null;
    const img = page?.querySelector<HTMLImageElement>('img[data-pdf-id]') ?? null;
    return page && img ? { page, img } : null;
  }

  // ---------------------------------------------------------- eventos

  private clearHover() {
    this.hover?.remove();
    this.hover = null;
  }

  private onMove(e: PointerEvent) {
    if (!this.on || e.pointerType === 'touch') return;
    const t = e.target as HTMLElement;
    if (this.editing && this.editing.el.contains(t)) return this.clearHover();
    if (t.closest?.('[data-element-toolbar],[data-keep-selection]')) return this.clearHover();
    const at = this.pdfImgAt(e.clientX, e.clientY);
    const run = at ? this.hit(at.page, at.img, e.clientX, e.clientY) : null;
    if (!at || !run) return this.clearHover();
    if (this.editing?.run === run && this.editing.img === at.img) return this.clearHover();
    const g = this.geom(at.page, at.img);
    if (!this.hover || this.hover.parentElement !== at.page) {
      this.clearHover();
      this.hover = document.createElement('div');
      this.hover.className = 'pdf-hover';
      at.page.appendChild(this.hover);
    }
    const [x0, y0, x1, y1] = run.box;
    Object.assign(this.hover.style, {
      left: `${g.ox + x0 * g.k}px`,
      top: `${g.oy + y0 * g.k}px`,
      width: `${(x1 - x0) * g.k}px`,
      height: `${(y1 - y0) * g.k}px`,
    });
  }

  private async onDown(e: PointerEvent) {
    if (!this.on || this.busy) return;
    const t = e.target as HTMLElement;
    if (!t?.closest) return;
    if (this.editing && this.editing.el.contains(t)) return; // colocar el cursor
    if (t.closest('[data-element-toolbar],[data-keep-selection]')) return;
    const at = this.pdfImgAt(e.clientX, e.clientY);
    const run = at ? this.hit(at.page, at.img, e.clientX, e.clientY) : null;
    if (this.editing) await this.commit();
    if (!at) return;
    if (!run) {
      const d = getPdfPage(at.img.dataset.pdfId);
      if (d && d.runs.length === 0) this.host.notify('Esta página no tiene texto seleccionable (parece una imagen escaneada).');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.clearHover();
    await this.open(at.page, at.img, run);
  }

  // ---------------------------------------------------------- abrir / alinear

  private fontSpec(ed: Editing, fsImg: number, bold: boolean, italic: boolean, stack: string) {
    return `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${fsImg}px ${stack}`;
  }

  private async open(page: HTMLElement, img: HTMLImageElement, run: PdfRun) {
    const data = getPdfPage(img.dataset.pdfId);
    if (!data) return;
    this.busy = true;
    try {
      const pageCanvas = await imageToCanvas(img);
      const patch = await buildPatch(pageCanvas, data, run.box, run.box);
      const match = matchPdfFont(data, run);
      const have = new Set<string>();
      data.runs.filter((r) => r.font === run.font && !r.edited).forEach((r) => [...r.text].forEach((c) => have.add(c)));
      const g = this.geom(page, img);
      const st = run.style;
      const center = st ? st.center : Math.abs(run.x + run.w / 2 - data.w / 2) < data.w * 0.012 && run.w > data.w * 0.12;

      const el = document.createElement('div');
      el.className = 'pdf-edit-overlay';
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.dataset.pdfRun = run.id;
      el.textContent = run.text;
      el.dataset.auto = st ? '0' : '1';
      el.dataset.fallback = match.fallback;
      const fsCss = (st?.fs ?? run.fs) * g.k;
      Object.assign(el.style, {
        position: 'absolute',
        zIndex: '30',
        margin: '0',
        padding: '0',
        whiteSpace: 'pre',
        outline: 'none',
        caretColor: patch.ink ?? '#000',
        color: st?.color ?? patch.ink ?? '#000',
        fontFamily: st?.stack ?? match.stack,
        fontSize: `${fsCss}px`,
        fontWeight: st ? (st.bold ? '700' : '400') : '400',
        fontStyle: st ? (st.italic ? 'italic' : 'normal') : 'normal',
        textDecoration: [st?.underline ? 'underline' : '', st?.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
        lineHeight: `${(run.asc + run.desc) * fsCss}px`,
        textAlign: center ? 'center' : 'left',
        minWidth: '4px',
        background: 'transparent',
      } as Partial<CSSStyleDeclaration>);
      page.appendChild(el);

      const ed: Editing = {
        page, img, data, run, el, patch, have,
        fallback: match.fallback, fallbackLabel: match.label,
        infoBold: match.bold, infoItalic: match.italic,
        center, manual: !!st, startText: run.text, startSig: '', warned: false,
        k: g.k, ox: g.ox, oy: g.oy,
      };
      this.editing = ed;
      ed.startSig = this.signature(ed);
      this.paintPatchBg(ed);
      this.applyAuto(ed);
      this.align(ed);

      el.addEventListener('input', () => {
        if (el.textContent?.includes('\n')) el.textContent = el.textContent.replace(/\n/g, ' ');
        this.applyAuto(ed);
        this.align(ed);
      });
      el.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
          ev.preventDefault();
          void this.commit();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          this.cancel();
        }
      });
      el.addEventListener('paste', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const text = (ev.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ');
        document.execCommand('insertText', false, text);
      });
      el.addEventListener('copy', (ev) => ev.stopPropagation());
      el.addEventListener('cut', (ev) => ev.stopPropagation());

      this.host.showToolbar(el);
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } finally {
      this.busy = false;
    }
  }

  /** El parche de fondo se ve detrás de la capa de edición: así el texto viejo no se ve mientras se escribe. */
  private paintPatchBg(ed: Editing) {
    // Se dibuja en un div aparte (hermano) para que quede a la medida de la caja original.
    ed.el.parentElement?.querySelectorAll('.pdf-edit-bg').forEach((n) => n.remove());
    const bg = document.createElement('div');
    bg.className = 'pdf-edit-bg';
    const p = ed.patch;
    Object.assign(bg.style, {
      position: 'absolute',
      zIndex: '29',
      pointerEvents: 'none',
      left: `${ed.ox + p.x * ed.k}px`,
      top: `${ed.oy + p.y * ed.k}px`,
      width: `${p.canvas.width * ed.k}px`,
      height: `${p.canvas.height * ed.k}px`,
      backgroundImage: `url(${p.canvas.toDataURL('image/png')})`,
      backgroundSize: '100% 100%',
    } as Partial<CSSStyleDeclaration>);
    ed.page.insertBefore(bg, ed.el);
  }

  /** Elige solo qué fuente usar: la original del PDF si trae todas las letras; si no, la equivalente. */
  private applyAuto(ed: Editing) {
    if (ed.el.dataset.auto !== '1') return;
    const text = ed.el.textContent ?? '';
    const needs = [...text].some((c) => c.trim() && !ed.have.has(c));
    const embedded = !needs && this.embeddedOf(ed);
    if (embedded) {
      ed.el.style.fontFamily = `'${ed.run.font}', ${ed.fallback}`;
      ed.el.style.fontWeight = '400';
      ed.el.style.fontStyle = 'normal';
    } else {
      ed.el.style.fontFamily = ed.fallback;
      ed.el.style.fontWeight = ed.infoBold ? '700' : '400';
      ed.el.style.fontStyle = ed.infoItalic ? 'italic' : 'normal';
      if (needs && !ed.warned) {
        ed.warned = true;
        this.host.notify(`Letras nuevas: se usa «${ed.fallbackLabel}», porque el PDF solo trae las letras que ya usa. Puedes elegir otra fuente (o subir la tuya) en la barra de arriba.`);
      }
    }
    this.host.refreshToolbar();
  }

  private embeddedOf(ed: Editing) {
    try {
      return document.fonts.check(`16px '${ed.run.font}'`);
    } catch {
      return false;
    }
  }

  /** Coloca la capa para que su línea base coincida con la del texto original. */
  private align(ed: Editing) {
    const el = ed.el;
    const fsCss = parseFloat(el.style.fontSize) || 12;
    const lh = parseFloat(el.style.lineHeight) || fsCss * 1.2;
    // Medimos dónde cae la línea base con esa fuente y altura de línea.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
    el.appendChild(probe);
    const base = probe.offsetTop;
    probe.remove();
    const top = ed.oy + ed.run.y * ed.k - base;
    el.style.top = `${top}px`;
    el.style.height = `${lh}px`;
    if (ed.center) {
      el.style.left = `${ed.ox + (ed.run.x + ed.run.w / 2) * ed.k}px`;
      el.style.transform = 'translateX(-50%)';
    } else {
      el.style.left = `${ed.ox + ed.run.x * ed.k}px`;
      el.style.transform = 'none';
    }
  }

  private signature(ed: Editing): string {
    const s = ed.el.style;
    return [ed.el.textContent, s.fontFamily, s.fontSize, s.fontWeight, s.fontStyle, s.color, s.textDecoration].join('|');
  }

  // ---------------------------------------------------------- acciones de la barra superior

  isActiveTarget(el: HTMLElement | null) {
    return !!el && !!this.editing && el === this.editing.el;
  }

  setFont(value: string) {
    const ed = this.editing;
    if (!ed) return;
    ed.el.dataset.auto = '0';
    ed.manual = true;
    ed.el.style.fontFamily = value;
    this.align(ed);
    ed.el.focus();
    this.host.refreshToolbar();
  }

  setFontSizeCss(px: number) {
    const ed = this.editing;
    if (!ed || !px) return;
    ed.el.style.fontSize = `${px}px`;
    ed.el.style.lineHeight = `${(ed.run.asc + ed.run.desc) * px}px`;
    this.align(ed);
    ed.el.focus();
    this.host.refreshToolbar();
  }

  format(cmd: string, val: string | null) {
    const ed = this.editing;
    if (!ed) return;
    const s = ed.el.style;
    if (cmd === 'bold' || cmd === 'italic') {
      // Ya no se decide solo: la fuente que haya ahora se queda y se aplica lo que el usuario pida.
      if (ed.el.dataset.auto === '1') {
        ed.el.dataset.auto = '0';
        ed.manual = true;
      }
      if (cmd === 'bold') s.fontWeight = parseInt(s.fontWeight || '400', 10) >= 600 ? '400' : '700';
      else s.fontStyle = s.fontStyle === 'italic' ? 'normal' : 'italic';
    } else if (cmd === 'underline' || cmd === 'strikeThrough') {
      const token = cmd === 'underline' ? 'underline' : 'line-through';
      const cur = new Set((s.textDecoration || '').split(' ').filter((x) => x && x !== 'none'));
      if (cur.has(token)) cur.delete(token);
      else cur.add(token);
      s.textDecoration = cur.size ? [...cur].join(' ') : 'none';
    } else if (cmd === 'foreColor' && val) {
      s.color = val;
      s.caretColor = val;
    } else if (cmd === 'justifyLeft' || cmd === 'justifyCenter') {
      ed.center = cmd === 'justifyCenter';
      s.textAlign = ed.center ? 'center' : 'left';
    }
    this.align(ed);
    ed.el.focus();
    this.host.refreshToolbar();
  }

  // ---------------------------------------------------------- confirmar / cancelar

  /** Descarta la edición abierta sin aplicar nada (p. ej. al deshacer). */
  reset() {
    this.editing = null;
    this.clearHover();
  }

  cancel() {
    const ed = this.editing;
    if (!ed) return;
    this.dispose(ed);
  }

  private dispose(ed: Editing) {
    ed.page.querySelectorAll('.pdf-edit-bg').forEach((n) => n.remove());
    ed.el.remove();
    this.editing = null;
    this.host.hideToolbar();
  }

  /** Aplana el texto editado dentro de la imagen de la página. */
  async commit(): Promise<void> {
    const ed = this.editing;
    if (!ed || this.busy) return;
    this.busy = true;
    try {
      const text = (ed.el.textContent ?? '').replace(/\s+$/g, '');
      if (this.signature(ed) === ed.startSig) {
        this.dispose(ed);
        return;
      }
      const s = ed.el.style;
      const fsImg = (parseFloat(s.fontSize) || 12) / ed.k;
      const bold = parseInt(s.fontWeight || '400', 10) >= 600;
      const italic = s.fontStyle === 'italic';
      const stack = s.fontFamily || ed.fallback;
      const color = s.color || '#000';
      const underline = s.textDecoration.includes('underline');
      const strike = s.textDecoration.includes('line-through');
      const spec = this.fontSpec(ed, fsImg, bold, italic, stack);
      try {
        await document.fonts.load(spec, text || ' ');
      } catch {
        /* se dibuja con lo que haya */
      }

      const pageCanvas = await imageToCanvas(ed.img);
      const ctx = pageCanvas.getContext('2d')!;
      ctx.font = spec;
      const width = text ? ctx.measureText(text).width : 0;
      const run = ed.run;
      // Caja nueva del texto escrito (para tapar también lo que sobresalga y para futuras ediciones).
      const nx0 = ed.center ? run.x + run.w / 2 - width / 2 : run.x;
      const newBox: Box = [nx0 - 2, run.y - run.asc * fsImg, nx0 + width + 2, run.y + run.desc * fsImg];
      const cover = unionBox(run.box, newBox);

      // El parche cubre la caja original (y la nueva si es más grande).
      const patch = await buildPatch(pageCanvas, ed.data, cover, run.box);
      ctx.drawImage(patch.canvas, patch.x, patch.y);

      if (text) {
        ctx.font = spec;
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = ed.center ? 'center' : 'left';
        const drawX = ed.center ? run.x + run.w / 2 : run.x;
        ctx.fillText(text, drawX, run.y);
        if (underline || strike) {
          const th = Math.max(1, fsImg * 0.06);
          ctx.fillRect(nx0, underline ? run.y + fsImg * 0.12 : run.y - fsImg * 0.3, width, th);
        }
      }

      // Nueva versión del texto de la página (así deshacer vuelve a la versión anterior).
      const runs = ed.data.runs
        .map((r) =>
          r.id === run.id
            ? text
              ? { ...r, text, x: nx0, w: width, fs: fsImg, box: cover, edited: true, style: { stack, color, bold, italic, underline, strike, fs: fsImg, center: ed.center } }
              : null
            : r
        )
        .filter((r): r is PdfRun => !!r);
      const nextId = newPdfId('pg');
      registerPdfPage(nextId, { ...ed.data, runs });
      ed.img.dataset.pdfId = nextId;
      ed.img.src = pageCanvas.toDataURL('image/png');
      this.dispose(ed);
      this.host.commit();
    } finally {
      this.busy = false;
    }
  }
}

