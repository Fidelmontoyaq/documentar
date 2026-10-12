// Texto curvo para los cuadros de texto: arco hacia arriba, hacia abajo o en círculo.
// Cada letra es un <span> posicionado y girado (así sale idéntico al exportar a PDF/PNG
// y usa cualquier tipografía cargada, cosa que un SVG convertido a imagen no garantiza).

export type CurveMode = 'up' | 'down' | 'circle';
export interface CurveCfg {
  mode: CurveMode;
  /** Ángulo que abarca el texto en el arco (20–340°). En «círculo» se reparte en 360°. */
  sweep: number;
  /** Espacio extra entre letras (px). */
  spacing: number;
}

export const DEFAULT_CURVE: CurveCfg = { mode: 'up', sweep: 140, spacing: 0 };

const LAYER = 'curve-layer';
let measureCtx: CanvasRenderingContext2D | null = null;

export function getCurve(box: HTMLElement): CurveCfg | null {
  const raw = box.dataset.curve;
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as CurveCfg;
    if (c && (c.mode === 'up' || c.mode === 'down' || c.mode === 'circle')) return { ...DEFAULT_CURVE, ...c };
  } catch { /* dato dañado: se ignora */ }
  return null;
}

export function curveSource(box: HTMLElement): HTMLElement | null {
  return box.querySelector<HTMLElement>('.floating-box-content [contenteditable="true"]');
}

export function curveText(box: HTMLElement): string {
  const src = curveSource(box);
  if (!src) return '';
  // innerText respeta <br>; si el nodo está oculto cae a textContent.
  return (src.innerText || src.textContent || '').replace(/ /g, ' ').replace(/\n+/g, ' ').trim();
}

export function setCurveText(box: HTMLElement, text: string) {
  const src = curveSource(box);
  if (!src) return;
  src.textContent = text;
}

/** Dibuja (o redibuja) las letras del texto curvo según la configuración guardada en el cuadro. */
export function renderCurve(box: HTMLElement) {
  const content = box.querySelector<HTMLElement>('.floating-box-content');
  const src = curveSource(box);
  const cfg = getCurve(box);
  content?.querySelector(`.${LAYER}`)?.remove();
  if (!content || !src || !cfg) return;

  const cs = getComputedStyle(src);
  const size = parseFloat(cs.fontSize) || 16;
  const family = cs.fontFamily;
  const weight = cs.fontWeight;
  const style = cs.fontStyle;
  const color = cs.color;
  const chars = Array.from(curveText(box));
  const layer = document.createElement('div');
  layer.className = LAYER;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  content.appendChild(layer);
  if (!chars.length) return;

  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  const adv = chars.map((c) => (c === ' ' ? ctx.measureText(' ').width : ctx.measureText(c).width) + cfg.spacing);
  const total = adv.reduce((a, b) => a + b, 0);

  const pts: { x: number; y: number; rot: number }[] = [];
  const toRad = Math.PI / 180;
  let acc = 0;
  if (cfg.mode === 'circle') {
    // Reparto por ancho de cada letra, dejando un hueco de un espacio entre el final y el principio.
    const gap = ctx.measureText('\u00a0').width + cfg.spacing;
    const R = Math.max(size, (total + gap) / (2 * Math.PI));
    for (let i = 0; i < chars.length; i++) {
      const mid = acc + adv[i] / 2;
      acc += adv[i];
      const ang = mid / R - Math.PI / 2;
      pts.push({ x: R * Math.cos(ang), y: R * Math.sin(ang), rot: (ang + Math.PI / 2) / toRad });
    }
  } else {
    const sweep = Math.max(10, Math.min(350, cfg.sweep)) * toRad;
    const R = total / sweep;
    for (let i = 0; i < chars.length; i++) {
      const mid = acc + adv[i] / 2;
      acc += adv[i];
      const a = mid / R - sweep / 2; // 0 = centro del arco
      if (cfg.mode === 'up') pts.push({ x: R * Math.sin(a), y: -R * Math.cos(a), rot: a / toRad });
      else pts.push({ x: R * Math.sin(a), y: R * Math.cos(a), rot: -a / toRad });
    }
  }

  // Centra el conjunto en el cuadro y lo reduce si no cabe.
  const half = size * 0.6;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x - half); maxX = Math.max(maxX, p.x + half);
    minY = Math.min(minY, p.y - half); maxY = Math.max(maxY, p.y + half);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const bw = maxX - minX, bh = maxY - minY;
  const W = box.clientWidth || content.clientWidth, H = box.clientHeight || content.clientHeight;
  const k = Math.min(1, (W - 8) / bw, (H - 8) / bh);
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;left:50%;top:50%;width:0;height:0;transform:scale(${k.toFixed(4)});`;
  layer.appendChild(wrap);
  chars.forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c === ' ' ? ' ' : c;
    s.style.cssText = `position:absolute;left:0;top:0;white-space:pre;line-height:1;font:${style} ${weight} ${size}px ${family};color:${color};transform:translate(${(pts[i].x - cx).toFixed(2)}px,${(pts[i].y - cy).toFixed(2)}px) translate(-50%,-50%) rotate(${pts[i].rot.toFixed(2)}deg);`;
    wrap.appendChild(s);
  });
}

export function setCurve(box: HTMLElement, cfg: CurveCfg | null) {
  if (!cfg) {
    delete box.dataset.curve;
    box.querySelector(`.${LAYER}`)?.remove();
    return;
  }
  box.dataset.curve = JSON.stringify(cfg);
  renderCurve(box);
}

const observed = new WeakSet<HTMLElement>();
/** Mantiene el texto curvo al día cuando cambia el tamaño del cuadro, el texto o la tipografía. */
export function observeCurve(box: HTMLElement) {
  if (observed.has(box)) return;
  observed.add(box);
  let raf = 0;
  const refresh = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (box.isConnected && box.dataset.curve) renderCurve(box); });
  };
  new ResizeObserver(refresh).observe(box);
  const src = curveSource(box);
  if (src) new MutationObserver(refresh).observe(src, { attributes: true, characterData: true, childList: true, subtree: true });
  void document.fonts?.ready.then(refresh);
  if (box.dataset.curve) refresh();
}
