import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Eraser, Hand, Loader2, Redo2, RotateCcw, Sparkles, Undo2, Wand2, X, ZoomIn, ZoomOut, PaintBucket, UserRound, Trees, ScanFace } from 'lucide-react';
import {
  aiRemoveBackground,
  autoRemoveBackground,
  colorKeyRemove,
  refineFineEdges,
  type AiKind,
  composeRgba,
  createMaskImage,
  featherEdge,
  paintDot,
  paintLine,
  removeSpecks,
  shrinkEdge,
  wandRemove,
  smartDot,
  smartLine,
  sampleColor,
  inpaintObject,
  type Rgb,
  type MaskImage,
} from '../../engine/bgRemove';

interface Props {
  open: boolean;
  src: string | null;
  onClose: () => void;
  /** Recibe el PNG con el fondo transparente. */
  onApply: (dataUrl: string, w: number, h: number) => void;
  /** 'bg' = quitar fondo (por defecto) · 'object' = quitar un objeto y rellenar el hueco. */
  mode?: 'bg' | 'object' | 'extract';
  /** Modo «extract»: devuelve la hoja con el hueco rellenado y el objeto recortado aparte. */
  onExtract?: (r: { filled: string; w: number; h: number; obj: { src: string; x: number; y: number; w: number; h: number } }) => void;
}

type Tool = 'auto' | 'hard' | 'wand' | 'brush' | 'hand';
type Bg = 'checker' | 'white' | 'black' | 'green';

const MAX_SIDE = 2048;
const HISTORY = 20;

const BG_STYLE: Record<Bg, React.CSSProperties> = {
  checker: {
    backgroundColor: '#fff',
    backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0,8px 8px',
  },
  white: { backgroundColor: '#fff' },
  black: { backgroundColor: '#000' },
  green: { backgroundColor: '#22c55e' },
};

/** Ventana para quitar el fondo de una imagen (varita, fondo liso, pincel, IA) y dejarla lista como sticker. */
export function RemoveBgDialog({ open, src, onClose, onApply, mode = 'bg', onExtract }: Props) {
  const isObj = mode === 'object' || mode === 'extract';
  const isExtract = mode === 'extract';
  const refColor = useRef<Rgb | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const miRef = useRef<MaskImage | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const undoRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const strokeRef = useRef<{ x: number; y: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('auto');
  const [bg, setBg] = useState<Bg>('checker');
  const [tol, setTol] = useState(18);
  const [contiguous, setContiguous] = useState(true);
  const [holes, setHoles] = useState(false);
  const [hardMode, setHardMode] = useState<'color' | null>(null);
  const [soften, setSoften] = useState(50);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(28);
  const [soft, setSoft] = useState(40);
  const [smart, setSmart] = useState(true);
  const [smartTol, setSmartTol] = useState(32);
  const [zoom, setZoom] = useState(1);
  const [, setTick] = useState(0);
  const [ai, setAi] = useState<{ text: string; pct?: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const bump = () => setTick((t) => t + 1);

  // ---- carga de la imagen
  useEffect(() => {
    if (!open || !src) return;
    let cancelled = false;
    setReady(false);
    setLoadErr(null);
    setMsg(null);
    setZoom(1);
    setTool(isObj ? 'brush' : 'auto');
    setBrushMode('erase');
    undoRef.current = [];
    redoRef.current = [];
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);
      const mi = createMaskImage(ctx.getImageData(0, 0, w, h));
      miRef.current = mi;
      imgDataRef.current = new ImageData(new Uint8ClampedArray(mi.rgba.length), w, h);
      setReady(true);
    };
    img.onerror = () => !cancelled && setLoadErr('No se pudo leer la imagen.');
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [open, src, isObj]);

  const render = useCallback(() => {
    const mi = miRef.current;
    const id = imgDataRef.current;
    const cv = canvasRef.current;
    if (!mi || !id || !cv) return;
    if (cv.width !== mi.w || cv.height !== mi.h) {
      cv.width = mi.w;
      cv.height = mi.h;
    }
    composeRgba(mi, id.data);
    if (isObj) {
      // Lo marcado se ve en rojo sobre la foto (así se sabe qué se va a quitar).
      const d = id.data;
      for (let i = 0, n = mi.w * mi.h; i < n; i++) {
        const k = (1 - mi.mask[i] / 255) * 0.6;
        d[i * 4 + 3] = mi.origAlpha[i];
        if (k > 0) {
          d[i * 4] = d[i * 4] * (1 - k) + 244 * k;
          d[i * 4 + 1] = d[i * 4 + 1] * (1 - k) + 63 * k;
          d[i * 4 + 2] = d[i * 4 + 2] * (1 - k) + 94 * k;
        }
      }
    }
    cv.getContext('2d')!.putImageData(id, 0, 0);
  }, [isObj]);

  useEffect(() => {
    if (ready) render();
  }, [ready, render]);

  const pushUndo = () => {
    const mi = miRef.current;
    if (!mi) return;
    undoRef.current.push(new Uint8ClampedArray(mi.mask));
    if (undoRef.current.length > HISTORY) undoRef.current.shift();
    redoRef.current = [];
  };
  const undo = () => {
    const mi = miRef.current;
    const prev = undoRef.current.pop();
    if (!mi || !prev) return;
    redoRef.current.push(new Uint8ClampedArray(mi.mask));
    mi.mask.set(prev);
    render();
    bump();
  };
  const redo = () => {
    const mi = miRef.current;
    const next = redoRef.current.pop();
    if (!mi || !next) return;
    undoRef.current.push(new Uint8ClampedArray(mi.mask));
    mi.mask.set(next);
    render();
    bump();
  };
  const reset = () => {
    const mi = miRef.current;
    if (!mi) return;
    pushUndo();
    mi.mask.set(mi.origAlpha);
    render();
    setMsg(null);
    bump();
  };

  // ---- coordenadas pantalla → imagen
  const toImg = (e: React.PointerEvent) => {
    const cv = canvasRef.current!;
    // El lienzo se ve con «object-fit: contain»: hay que descontar los márgenes para que el puntero caiga justo donde se toca.
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width / cv.width, r.height / cv.height);
    const offX = (r.width - cv.width * s) / 2;
    const offY = (r.height - cv.height * s) / 2;
    return { x: (e.clientX - r.left - offX) / s, y: (e.clientY - r.top - offY) / s, k: 1 / s };
  };

  const brushRadiusImg = (k: number) => Math.max(1, (brushSize / 2) * k);

  const moveCursor = (e: React.PointerEvent) => {
    const el = cursorRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    if (tool !== 'brush' || e.pointerType === 'touch' && !strokeRef.current) {
      el.style.display = 'none';
      return;
    }
    const r = wrap.getBoundingClientRect();
    el.style.display = 'block';
    el.style.width = el.style.height = `${brushSize}px`;
    el.style.transform = `translate(${e.clientX - r.left - brushSize / 2}px, ${e.clientY - r.top - brushSize / 2}px)`;
  };

  const onDown = (e: React.PointerEvent) => {
    const mi = miRef.current;
    if (!mi || tool === 'hand' || tool === 'auto' || (tool === 'hard' && hardMode !== 'color')) return;
    const p = toImg(e);
    if (tool === 'hard') {
      pushUndo();
      const n = colorKeyRemove(mi, p.x, p.y, tol, soften / 100);
      setMsg(n ? 'Listo. Toca otro color del fondo si aún queda alguno (por ejemplo, otro tono de cielo).' : 'Ahí ya estaba transparente.');
      render();
      bump();
      return;
    }
    if (tool === 'wand') {
      pushUndo();
      const n = wandRemove(mi, p.x, p.y, tol, contiguous);
      setMsg(n ? null : 'Ahí ya estaba transparente.');
      render();
      bump();
      return;
    }
    // pincel
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pushUndo();
    strokeRef.current = { x: p.x, y: p.y };
    if (smart) {
      refColor.current = sampleColor(mi, p.x, p.y);
      smartDot(mi, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode, refColor.current, smartTol);
    } else paintDot(mi, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode);
    render();
    moveCursor(e);
  };
  const onMove = (e: React.PointerEvent) => {
    moveCursor(e);
    const mi = miRef.current;
    const s = strokeRef.current;
    if (!mi || !s || tool !== 'brush') return;
    const p = toImg(e);
    if (smart && refColor.current) smartLine(mi, s.x, s.y, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode, refColor.current, smartTol);
    else paintLine(mi, s.x, s.y, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode);
    strokeRef.current = { x: p.x, y: p.y };
    render();
  };
  const onUp = () => {
    if (strokeRef.current) {
      strokeRef.current = null;
      bump();
    }
  };

  const runAuto = () => {
    const mi = miRef.current;
    if (!mi) return;
    pushUndo();
    const r = autoRemoveBackground(mi, tol, holes);
    setMsg(r.removed ? null : 'No encontré un fondo liso en el borde. Prueba subir la tolerancia o usa la IA o la varita.');
    render();
    bump();
  };

  const runAi = async (kind: AiKind = 'general', refine = false) => {
    const mi = miRef.current;
    if (!mi) return;
    setAi({ text: 'Preparando…' });
    setMsg(null);
    const before = new Uint8ClampedArray(mi.mask);
    try {
      await aiRemoveBackground(mi, (text, pct) => setAi({ text, pct }), kind);
      if (isObj) for (let i = 0; i < mi.mask.length; i++) mi.mask[i] = Math.round(mi.origAlpha[i] * (1 - mi.mask[i] / 255));
      if (refine) refineFineEdges(mi, 6);
      // pushUndo con el estado previo (la máscara ya cambió).
      undoRef.current.push(before);
      if (undoRef.current.length > HISTORY) undoRef.current.shift();
      redoRef.current = [];
      render();
      bump();
    } catch (err) {
      console.error('IA de recorte:', err);
      setMsg('No se pudo usar la IA (¿sin conexión o modelo bloqueado?). Prueba con "Fondo liso" o la varita.');
    } finally {
      setAi(null);
    }
  };

  const edge = (fn: (m: MaskImage) => void) => {
    const mi = miRef.current;
    if (!mi) return;
    pushUndo();
    fn(mi);
    render();
    bump();
  };

  const apply = () => {
    const mi = miRef.current;
    const cv = canvasRef.current;
    if (!mi || !cv) return;
    if (isExtract && onExtract) {
      const w = mi.w, h = mi.h;
      const filledC = document.createElement('canvas');
      filledC.width = w; filledC.height = h;
      filledC.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(inpaintObject(mi)), w, h), 0, 0);
      // Objeto: lo marcado, con su opacidad; recortado a su tamaño.
      const od = new Uint8ClampedArray(mi.rgba);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = Math.round((1 - mi.mask[i] / 255) * mi.origAlpha[i]);
        od[i * 4 + 3] = a;
        if (a > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) { setMsg('Marca primero el objeto que quieres sacar (con el pincel o la varita).'); return; }
      const full = document.createElement('canvas');
      full.width = w; full.height = h;
      full.getContext('2d')!.putImageData(new ImageData(od, w, h), 0, 0);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      oc.getContext('2d')!.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
      onExtract({ filled: filledC.toDataURL('image/jpeg', 0.93), w, h, obj: { src: oc.toDataURL('image/png'), x: x0, y: y0, w: cw, h: ch } });
      return;
    }
    if (isObj) {
      const out = new ImageData(new Uint8ClampedArray(inpaintObject(mi)), mi.w, mi.h);
      const c = document.createElement('canvas');
      c.width = mi.w; c.height = mi.h;
      c.getContext('2d')!.putImageData(out, 0, 0);
      onApply(c.toDataURL('image/png'), mi.w, mi.h);
      return;
    }
    render();
    onApply(cv.toDataURL('image/png'), mi.w, mi.h);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && !ai) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ai, onClose]);

  const canUndo = undoRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  const dims = miRef.current ? { w: miRef.current.w, h: miRef.current.h } : null;

  const tabBtn = (id: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => { setTool(id); if (id !== 'hard') setHardMode(null); }}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-medium border transition ${tool === id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
    >
      {icon}
      {label}
    </button>
  );
  const lbl = 'text-[11px] text-slate-400 flex justify-between mb-1';
  const act = 'w-full py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition';
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-30';

  const canvasStyle = useMemo<React.CSSProperties>(() => ({ width: `${zoom * 100}%`, touchAction: tool === 'hand' ? 'auto' : 'none', cursor: tool === 'brush' ? 'none' : tool === 'wand' || (tool === 'hard' && hardMode) ? 'crosshair' : tool === 'hand' ? 'grab' : 'default' }), [zoom, tool]);

  if (!open) return null;

  return (
    <div data-keep-selection className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-sm flex flex-col md:flex-row print:hidden">
      {/* Lienzo de trabajo */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900">
          <h2 className="text-sm font-bold text-white mr-auto">{isExtract ? 'Extraer objeto' : isObj ? 'Quitar objeto' : 'Quitar fondo'}</h2>
          <button type="button" className={iconBtn} title="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 className="w-4 h-4" /></button>
          <button type="button" className={iconBtn} title="Rehacer" disabled={!canRedo} onClick={redo}><Redo2 className="w-4 h-4" /></button>
          <button type="button" className={iconBtn} title="Volver a la imagen original" onClick={reset}><RotateCcw className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-slate-700 mx-1" />
          <button type="button" className={iconBtn} title="Alejar" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}><ZoomOut className="w-4 h-4" /></button>
          <span className="text-[11px] text-slate-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" className={iconBtn} title="Acercar" onClick={() => setZoom((z) => Math.min(6, +(z + 0.5).toFixed(2)))}><ZoomIn className="w-4 h-4" /></button>
          <button type="button" className={`${iconBtn} md:hidden`} title="Cerrar" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 flex" style={BG_STYLE[bg]}>
          <div ref={wrapRef} className="relative m-auto" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : undefined }}>
            {loadErr ? (
              <div className="text-rose-300 text-sm p-6">{loadErr}</div>
            ) : (
              <canvas
                ref={canvasRef}
                className="block max-w-none select-none"
                style={{ ...canvasStyle, width: '100%', maxHeight: zoom === 1 ? 'calc(100dvh - 330px)' : undefined, objectFit: 'contain' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onPointerLeave={() => cursorRef.current && (cursorRef.current.style.display = 'none')}
              />
            )}
            <div ref={cursorRef} className="pointer-events-none absolute top-0 left-0 rounded-full border-2 hidden" style={{ borderColor: brushMode === 'erase' ? '#f43f5e' : '#10b981', boxShadow: '0 0 0 1px #fff, inset 0 0 0 1px #fff', background: brushMode === 'erase' ? 'rgba(244,63,94,.12)' : 'rgba(16,185,129,.12)' }} />
          </div>
        </div>
        <div className="px-3 py-1.5 border-t border-slate-800 bg-slate-900 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-slate-500 shrink-0">Fondo de vista:</span>
          {(['checker', 'white', 'black', 'green'] as Bg[]).map((b) => (
            <button key={b} type="button" onClick={() => setBg(b)} title={b === 'checker' ? 'Cuadrícula (transparente)' : b} className={`w-6 h-6 rounded-md border-2 shrink-0 ${bg === b ? 'border-blue-400' : 'border-slate-600'}`} style={BG_STYLE[b]} />
          ))}
          {dims && <span className="ml-auto text-[10px] text-slate-500 shrink-0">{dims.w}×{dims.h} px</span>}
        </div>
      </div>

      {/* Herramientas */}
      <aside className="md:w-[300px] shrink-0 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col max-md:max-h-[46dvh] min-h-0">
        <div className="hidden md:flex items-center justify-between px-4 pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Herramientas</span>
          <button type="button" title="Cerrar" onClick={onClose} className={iconBtn}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <div className="flex gap-1.5">
            {isObj ? tabBtn('brush', 'Marcar', <Brush className="w-4 h-4" />) : tabBtn('auto', 'Automático', <Sparkles className="w-4 h-4" />)}
            {!isObj && tabBtn('hard', 'Difíciles', <ScanFace className="w-4 h-4" />)}
            {tabBtn('wand', 'Varita', <Wand2 className="w-4 h-4" />)}
            {!isObj && tabBtn('brush', 'Pincel', <Brush className="w-4 h-4" />)}
            {isObj && tabBtn('auto', 'Detectar', <Sparkles className="w-4 h-4" />)}
            {tabBtn('hand', 'Mover', <Hand className="w-4 h-4" />)}
          </div>

          {isExtract && (
            <p className="text-[11px] text-slate-300 bg-slate-800/60 border border-slate-700 rounded-lg p-2">Marca el logo u objeto de la hoja (pincel inteligente o varita). Al terminar, sale como imagen aparte que puedes mover, achicar o borrar, y el hueco se rellena con el color del fondo.</p>
          )}
          {tool === 'auto' && isObj && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-400">La IA marca el objeto principal de la foto para quitarlo. Puedes corregir la marca con el pincel.</p>
              <button type="button" disabled={!ready || !!ai} onClick={() => void runAi('general')} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                {ai ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Detectar objeto con IA
              </button>
              {ai && <div className="text-[11px] text-slate-300">{ai.text}{typeof ai.pct === 'number' && <div className="h-1.5 mt-1 rounded bg-slate-700 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.round(ai.pct)}%` }} /></div>}</div>}
            </div>
          )}
          {tool === 'auto' && !isObj && (
            <div className="space-y-2.5">
              <button type="button" disabled={!ready || !!ai} onClick={() => void runAi('general')} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                {ai ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Quitar fondo con IA
              </button>
              {ai && (
                <div className="text-[11px] text-slate-300">
                  {ai.text}
                  {typeof ai.pct === 'number' && (
                    <div className="h-1.5 mt-1 rounded bg-slate-700 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.round(ai.pct)}%` }} /></div>
                  )}
                </div>
              )}
              <p className="text-[10px] text-slate-500">La primera vez descarga el modelo (unas decenas de MB); después queda en caché. La imagen se procesa en tu navegador.</p>
              <div className="border-t border-slate-800 pt-2.5">
                <div className={lbl}><span>Tolerancia</span><span>{tol}</span></div>
                <input type="range" min={1} max={60} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-full" />
                <label className="flex items-center gap-2 text-xs text-slate-300 mt-2 cursor-pointer">
                  <input type="checkbox" checked={holes} onChange={(e) => setHoles(e.target.checked)} /> También quitar huecos del mismo color
                </label>
                <button type="button" disabled={!ready} onClick={runAuto} className={`${act} mt-2`}><PaintBucket className="inline w-3.5 h-3.5 mr-1.5" />Quitar fondo liso (por el borde)</button>
              </div>
            </div>
          )}

          {tool === 'hard' && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-400">Para fondos complicados: personas con cabello, árboles con cielo entre las hojas…</p>
              <button type="button" disabled={!ready || !!ai} onClick={() => { setHardMode(null); void runAi('portrait', true); }} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                {ai ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRound className="w-4 h-4" />} Silueta de persona (con cabello)
              </button>
              {ai && (
                <div className="text-[11px] text-slate-300">
                  {ai.text}
                  {typeof ai.pct === 'number' && <div className="h-1.5 mt-1 rounded bg-slate-700 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.round(ai.pct)}%` }} /></div>}
                </div>
              )}
              <button type="button" disabled={!ready || !!ai} onClick={() => { setHardMode(null); edge((m) => { const n = refineFineEdges(m, 6); setMsg(n ? 'Bordes finos recuperados. Compara con el fondo de vista oscuro y claro.' : 'No encontré mechones que recuperar (el fondo y el objeto son muy parecidos).'); }); }} className={act}>
                <ScanFace className="inline w-3.5 h-3.5 mr-1.5" /> Cabello y bordes finos (después de quitar el fondo)
              </button>
              <div className={`rounded-xl border p-2.5 space-y-2 ${hardMode === 'color' ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700'}`}>
                <button type="button" disabled={!ready} onClick={() => setHardMode(hardMode === 'color' ? null : 'color')} className={`${act} ${hardMode === 'color' ? '!bg-blue-600 !border-blue-500 !text-white' : ''}`}>
                  <Trees className="inline w-3.5 h-3.5 mr-1.5" /> Árbol, hojas o cielo entre ramas
                </button>
                <p className="text-[10px] text-slate-400">{hardMode === 'color' ? 'Toca el color del fondo (el cielo). Se quita en TODA la imagen, también entre las hojas y las ramas.' : 'Activa y toca el color del fondo: se quita en toda la imagen, incluso en los huecos.'}</p>
                <div>
                  <div className={lbl}><span>Tolerancia</span><span>{tol}</span></div>
                  <input type="range" min={1} max={60} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <div className={lbl}><span>Suavidad del borde</span><span>{soften}%</span></div>
                  <input type="range" min={5} max={150} value={soften} onChange={(e) => setSoften(Number(e.target.value))} className="w-full" />
                </div>
              </div>
            </div>
          )}

          {tool === 'wand' && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-400">Toca el color que quieres quitar.</p>
              <div>
                <div className={lbl}><span>Tolerancia</span><span>{tol}</span></div>
                <input type="range" min={1} max={60} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-full" />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={contiguous} onChange={(e) => setContiguous(e.target.checked)} /> Solo la zona conectada
              </label>
            </div>
          )}

          {tool === 'brush' && (
            <div className="space-y-2.5">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setBrushMode('erase')} className={`flex-1 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 ${brushMode === 'erase' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}><Eraser className="w-3.5 h-3.5" />{isObj ? 'Marcar' : 'Borrar'}</button>
                <button type="button" onClick={() => setBrushMode('restore')} className={`flex-1 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 ${brushMode === 'restore' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}><Brush className="w-3.5 h-3.5" />{isObj ? 'Desmarcar' : 'Restaurar'}</button>
              </div>
              <div className={`rounded-xl border p-2.5 space-y-2 ${smart ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700'}`}>
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer font-medium">
                  <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} /> Pincel inteligente (respeta bordes)
                </label>
                <p className="text-[10px] text-slate-400">{smart ? 'Solo afecta al color donde empiezas el trazo: al llegar a otro color, se detiene solo. Puedes pasar el pincel por encima del borde sin miedo.' : 'Pinta todo lo que toca el círculo.'}</p>
                {smart && (
                  <div>
                    <div className={lbl}><span>Sensibilidad al color</span><span>{smartTol}</span></div>
                    <input type="range" min={5} max={80} value={smartTol} onChange={(e) => setSmartTol(Number(e.target.value))} className="w-full" />
                  </div>
                )}
              </div>
              <div>
                <div className={lbl}><span>Tamaño</span><span>{brushSize}px</span></div>
                <input type="range" min={6} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className={lbl}><span>Suavidad del borde</span><span>{soft}%</span></div>
                <input type="range" min={0} max={100} value={soft} onChange={(e) => setSoft(Number(e.target.value))} className="w-full" />
              </div>
              <p className="text-[10px] text-slate-500">Acerca la imagen con la lupa para retocar detalles pequeños.</p>
            </div>
          )}

          {tool === 'hand' && <p className="text-[11px] text-slate-400">Con la imagen ampliada, arrastra para moverte por ella.</p>}

          {!isObj && (<div className="border-t border-slate-800 pt-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400">Pulir el borde</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" disabled={!ready} onClick={() => edge((m) => shrinkEdge(m, 1))} className={act} title="Se come 1 px del contorno: quita halos de color del fondo">Afinar</button>
              <button type="button" disabled={!ready} onClick={() => edge((m) => featherEdge(m, 1.5))} className={act} title="Suaviza el contorno dentado">Suavizar</button>
              <button type="button" disabled={!ready} onClick={() => edge((m) => { const n = removeSpecks(m, Math.max(12, Math.round((m.w * m.h) / 4000))); setMsg(n ? `Se quitaron ${n} píxeles sueltos.` : 'No había motas sueltas.'); })} className={act} title="Quita puntos sueltos">Motas</button>
            </div>
          </div>)}

          {msg && <p className="text-[11px] text-amber-300">{msg}</p>}
        </div>
        <div className="p-3 border-t border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Cancelar</button>
          <button type="button" disabled={!ready || !!ai} onClick={apply} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">{isExtract ? 'Extraer objeto' : isObj ? 'Quitar objeto' : 'Aplicar'}</button>
        </div>
      </aside>
    </div>
  );
}
