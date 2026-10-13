// Buscar una palabra en todo el documento (Ctrl+F): texto de las hojas, cuadros de texto
// y texto de los PDF importados. Ignora mayúsculas y tildes.
import { getPdfPage } from './pdfText';

type Hit =
  | { kind: 'dom'; range: Range; page: HTMLElement }
  | { kind: 'pdf'; page: HTMLElement; img: HTMLImageElement; box: [number, number, number, number]; scale: number };

const fold = (s: string) =>
  Array.from(s, (c) => c.normalize('NFD')[0].toLowerCase()).join('');

type HighlightCtor = new (...r: Range[]) => unknown;
const hl = (): { ctor: HighlightCtor; reg: Map<string, unknown> } | null => {
  const w = window as unknown as { Highlight?: HighlightCtor };
  const css = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
  return w.Highlight && css?.highlights ? { ctor: w.Highlight, reg: css.highlights } : null;
};

export class DocSearch {
  private hits: Hit[] = [];
  private idx = -1;
  private overlays: HTMLElement[] = [];

  constructor(private wrapper: HTMLElement) {}

  get total() { return this.hits.length; }
  get index() { return this.idx; }

  run(query: string): number {
    this.clear();
    const q = fold(query.trim());
    if (!q) return 0;
    const pages = Array.from(this.wrapper.querySelectorAll<HTMLElement>('.a4-page'));
    for (const page of pages) {
      const roots = page.querySelectorAll<HTMLElement>(':scope > .page-header, :scope > .page-content, :scope > .page-footer, .floating-box[data-type="text"] [contenteditable], .floating-box[data-type="caption"] [contenteditable]');
      roots.forEach((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = fold(node.nodeValue ?? '');
          let from = 0;
          for (;;) {
            const at = text.indexOf(q, from);
            if (at < 0) break;
            const r = document.createRange();
            r.setStart(node, at);
            r.setEnd(node, at + q.length);
            this.hits.push({ kind: 'dom', range: r, page });
            from = at + q.length;
          }
        }
      });
      const img = page.querySelector<HTMLImageElement>('img[data-pdf-id]');
      const data = img ? getPdfPage(img.dataset.pdfId) : undefined;
      if (img && data) {
        for (const run of data.runs) {
          if (fold(run.text).includes(q)) this.hits.push({ kind: 'pdf', page, img, box: run.box, scale: data.w });
        }
      }
    }
    this.paintAll();
    if (this.hits.length) this.go(0);
    return this.hits.length;
  }

  private paintAll() {
    const h = hl();
    const ranges = this.hits.filter((x): x is Extract<Hit, { kind: 'dom' }> => x.kind === 'dom').map((x) => x.range);
    if (h && ranges.length) h.reg.set('de-find', new h.ctor(...ranges));
    for (const x of this.hits) {
      if (x.kind !== 'pdf') continue;
      const k = x.img.clientWidth / x.scale;
      const d = document.createElement('div');
      d.className = 'pdf-find';
      Object.assign(d.style, {
        position: 'absolute',
        left: `${x.box[0] * k}px`, top: `${x.box[1] * k}px`,
        width: `${(x.box[2] - x.box[0]) * k}px`, height: `${(x.box[3] - x.box[1]) * k}px`,
      });
      x.page.appendChild(d);
      this.overlays.push(d);
    }
  }

  private markCurrent() {
    this.overlays.forEach((o) => o.classList.remove('pdf-find-current'));
    const h = hl();
    const cur = this.hits[this.idx];
    if (!cur) return;
    if (cur.kind === 'pdf') {
      const pdfHits = this.hits.filter((x) => x.kind === 'pdf');
      this.overlays[pdfHits.indexOf(cur)]?.classList.add('pdf-find-current');
      this.overlays[pdfHits.indexOf(cur)]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      if (h) h.reg.set('de-find-current', new h.ctor(cur.range));
      else {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(cur.range);
      }
      (cur.range.startContainer.parentElement as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  go(i: number) {
    if (!this.hits.length) return;
    this.idx = ((i % this.hits.length) + this.hits.length) % this.hits.length;
    this.markCurrent();
  }
  step(dir: 1 | -1) { this.go(this.idx + dir); }

  clear() {
    const h = hl();
    h?.reg.delete('de-find');
    h?.reg.delete('de-find-current');
    this.overlays.forEach((o) => o.remove());
    this.overlays = [];
    this.hits = [];
    this.idx = -1;
  }
}
