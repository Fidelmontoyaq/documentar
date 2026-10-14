// Nitidez bajo demanda: solo las hojas de PDF que se ven en pantalla se vuelven a dibujar
// con la resolución real de la pantalla (y del zoom). El resto queda liviano.
// La capa nítida es un <canvas class="pdf-sharp"> transitorio: nunca se guarda ni se exporta.
import { getPdfPage, getPdfPageProxy } from './pdfText';

export const SHARP_CLASS = 'pdf-sharp';
const MAX_SIDE = 3200;
const KEEP = 5; // máximo de capas nítidas vivas a la vez (memoria)

export class PdfSharpener {
  private io: IntersectionObserver;
  private mo: MutationObserver;
  private visible = new Set<HTMLImageElement>();
  private layers = new Map<HTMLImageElement, HTMLCanvasElement>();
  private timer = 0;
  private scanTimer = 0;
  private working = false;
  private paused = false;
  private dead = false;
  private token = 0;

  constructor(private root: HTMLElement, private scroller: HTMLElement) {
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const img = e.target as HTMLImageElement;
          if (e.isIntersecting) this.visible.add(img);
          else this.visible.delete(img);
        }
        this.schedule();
      },
      { root: null, rootMargin: '10% 0px' }
    );
    this.mo = new MutationObserver(() => {
      clearTimeout(this.scanTimer);
      this.scanTimer = window.setTimeout(() => this.scan(), 350);
    });
    this.mo.observe(root, { childList: true, subtree: true });
    scroller.addEventListener('scroll', this.onMove, { passive: true });
    window.addEventListener('resize', this.onMove);
    scroller.addEventListener('wheel', this.onMove, { passive: true });
    this.scan();
  }

  private onMove = () => this.schedule(260);

  /** Pide revisar de nuevo (p. ej. tras cambiar el zoom). */
  poke() {
    this.schedule(240);
  }

  private scan() {
    if (this.dead) return;
    this.root.querySelectorAll<HTMLImageElement>('img[data-pdf-id]').forEach((img) => {
      if (!(img as unknown as { __sh?: boolean }).__sh) {
        (img as unknown as { __sh?: boolean }).__sh = true;
        this.io.observe(img);
      }
    });
    this.schedule(200);
  }

  private schedule(ms = 180) {
    if (this.dead) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), ms);
  }

  /** Quita todas las capas (antes de exportar o guardar) y detiene el trabajo. */
  pause() {
    this.paused = true;
    this.token++;
    this.clearAll();
  }

  resume() {
    this.paused = false;
    this.schedule(300);
  }

  private clearAll() {
    this.layers.forEach((c) => {
      c.width = c.height = 0;
      c.remove();
    });
    this.layers.clear();
    this.root.querySelectorAll(`.${SHARP_CLASS}`).forEach((c) => c.remove());
  }

  private drop(img: HTMLImageElement) {
    const c = this.layers.get(img);
    if (c) {
      c.width = c.height = 0;
      c.remove();
      this.layers.delete(img);
    }
  }

  private async run() {
    if (this.dead || this.paused) return;
    if (this.working) {
      this.schedule(250);
      return;
    }
    this.working = true;
    const my = this.token;
    try {
      // 1) Limpia capas obsoletas (la imagen cambió, salió de pantalla o ya no existe).
      const vh = window.innerHeight;
      for (const [img, c] of [...this.layers]) {
        const r = img.isConnected ? img.getBoundingClientRect() : null;
        const stale = !img.isConnected || c.dataset.src !== img.src || !img.dataset.pdfId;
        const far = !r || r.bottom < -vh * 1.5 || r.top > vh * 2.5;
        if (stale || far) this.drop(img);
      }
      // 2) Hojas visibles, de más centrada a menos.
      const mid = vh / 2;
      const todo = [...this.visible]
        .filter((i) => i.isConnected && i.dataset.pdfId)
        .map((i) => ({ i, r: i.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 40 && r.bottom > 0 && r.top < vh)
        .sort((a, b) => Math.abs(a.r.top + a.r.height / 2 - mid) - Math.abs(b.r.top + b.r.height / 2 - mid));
      for (const { i: img, r } of todo) {
        if (this.dead || this.paused || my !== this.token) return;
        const data = getPdfPage(img.dataset.pdfId);
        if (!data) continue;
        if (img.dataset.fx || data.runs.some((x) => x.edited)) continue; // con ajuste de color o editada // ya editada: su imagen se genera nítida al confirmar
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bw = img.offsetWidth || r.width;
        const bh = img.offsetHeight || r.height;
        const fit = Math.min(bw / data.w, bh / data.h); // 'contain'
        const cw = data.w * fit;
        const ch = data.h * fit;
        const zoom = r.width / (bw || r.width); // zoom visual del lienzo
        const wantW = Math.min(MAX_SIDE, cw * zoom * dpr * 1.05);
        const naturalW = img.naturalWidth || data.w;
        const existing = this.layers.get(img);
        if (existing && existing.width >= wantW * 0.92) continue;
        if (!existing && naturalW >= wantW * 0.95) continue; // la imagen base ya alcanza
        const proxy = await getPdfPageProxy(data);
        if (!proxy || this.dead || this.paused || my !== this.token || !img.isConnected) continue;
        const base = proxy.getViewport({ scale: 1 });
        let k = wantW / base.width;
        if (base.height * k > MAX_SIDE) k = MAX_SIDE / base.height;
        const vp = proxy.getViewport({ scale: k });
        const cv = document.createElement('canvas');
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        const ctx = cv.getContext('2d');
        if (!ctx) continue;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        await proxy.render({ canvasContext: ctx, viewport: vp }).promise;
        if (this.dead || this.paused || my !== this.token || !img.isConnected) {
          cv.width = cv.height = 0;
          return;
        }
        // Solo se coloca si la imagen no cambió mientras se dibujaba.
        if (!img.dataset.pdfId) continue;
        cv.className = SHARP_CLASS;
        cv.dataset.src = img.src;
        cv.setAttribute('aria-hidden', 'true');
        const s = cv.style;
        s.position = 'absolute';
        s.pointerEvents = 'none';
        s.left = `${img.offsetLeft + (bw - cw) / 2}px`;
        s.top = `${img.offsetTop + (bh - ch) / 2}px`;
        s.width = `${cw}px`;
        s.height = `${ch}px`;
        s.zIndex = '1';
        this.drop(img);
        img.after(cv);
        this.layers.set(img, cv);
        // Controla el límite de memoria: se retira la capa más lejana del centro.
        if (this.layers.size > KEEP) {
          let worst: HTMLImageElement | null = null;
          let wd = -1;
          for (const k2 of this.layers.keys()) {
            if (k2 === img) continue;
            const rr = k2.getBoundingClientRect();
            const d = Math.abs(rr.top + rr.height / 2 - mid);
            if (d > wd) { wd = d; worst = k2; }
          }
          if (worst) this.drop(worst);
        }
      }
    } catch (e) {
      console.warn('Nitidez de hoja', e);
    } finally {
      this.working = false;
    }
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    clearTimeout(this.scanTimer);
    this.io.disconnect();
    this.mo.disconnect();
    this.scroller.removeEventListener('scroll', this.onMove);
    this.scroller.removeEventListener('wheel', this.onMove);
    window.removeEventListener('resize', this.onMove);
    this.clearAll();
  }
}
