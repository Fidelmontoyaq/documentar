import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Eraser, Hand, Loader2, Redo2, RotateCcw, Sparkles, Undo2, Wand2, X, ZoomIn, ZoomOut, PaintBucket } from 'lucide-react';
import {
  aiRemoveBackground,
  autoRemoveBackground,
  composeRgba,
  createMaskImage,
  featherEdge,
  paintDot,
  paintLine,
  removeSpecks,
  shrinkEdge,
  wandRemove,
  type MaskImage,
} from '../../engine/bgRemove';

interface Props {
  open: boolean;
  src: string | null;
  onClose: () => void;
  /** Recibe el PNG con el fondo transparente. */
  onApply: (dataUrl: string, w: number, h: number) => void;
}

type Tool = 'auto' | 'wand' | 'brush' | 'hand';
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
export function RemoveBgDialog({ open, src, onClose, onApply }: Props) {
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
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(28);
  const [soft, setSoft] = useState(40);
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
    setTool('auto');
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
  }, [open, src]);

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
    cv.getContext('2d')!.putImageData(id, 0, 0);
  }, []);

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
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height, k: cv.width / r.width };
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
    if (!mi || tool === 'hand' || tool === 'auto') return;
    const p = toImg(e);
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
    paintDot(mi, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode);
    render();
    moveCursor(e);
  };
  const onMove = (e: React.PointerEvent) => {
    moveCursor(e);
    const mi = miRef.current;
    const s = strokeRef.current;
    if (!mi || !s || tool !== 'brush') return;
    const p = toImg(e);
    paintLine(mi, s.x, s.y, p.x, p.y, brushRadiusImg(p.k), soft / 100, brushMode);
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

  const runAi = async () => {
    const mi = miRef.current;
    if (!mi) return;
    setAi({ text: 'Preparando…' });
    setMsg(null);
    const before = new Uint8ClampedArray(mi.mask);
    try {
      await aiRemoveBackground(mi, (text, pct) => setAi({ text, pct }));
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
      onClick={() => setTool(id)}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-medium border transition ${tool === id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
    >
      {icon}
      {label}
    </button>
  );
  const lbl = 'text-[11px] text-slate-400 flex justify-between mb-1';
  const act = 'w-full py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition';
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-30';

  const canvasStyle = useMemo<React.CSSProperties>(() => ({ width: `${zoom * 100}%`, touchAction: tool === 'hand' ? 'auto' : 'none', cursor: tool === 'brush' ? 'none' : tool === 'wand' ? 'crosshair' : tool === 'hand' ? 'grab' : 'default' }), [zoom, tool]);

  if (!open) return null;

  return (
    <div data-keep-selection className="fixed inset-0 z-[90] bg-slate-950/90 backdrop-blur-sm flex flex-col md:flex-row print:hidden">
      {/* Lienzo de trabajo */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900">
          <h2 className="text-sm font-bold text-white mr-auto">Quitar fondo</h2>
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
            <div ref={cursorRef} className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-white mix-blend-difference hidden" />
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
            {tabBtn('auto', 'Automático', <Sparkles className="w-4 h-4" />)}
            {tabBtn('wand', 'Varita', <Wand2 className="w-4 h-4" />)}
            {tabBtn('brush', 'Pincel', <Brush className="w-4 h-4" />)}
            {tabBtn('hand', 'Mover', <Hand className="w-4 h-4" />)}
          </div>

          {tool === 'auto' && (
            <div className="space-y-2.5">
              <button type="button" disabled={!ready || !!ai} onClick={() => void runAi()} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 flex items-center justify-center gap-2">
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
                <button type="button" onClick={() => setBrushMode('erase')} className={`flex-1 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 ${brushMode === 'erase' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}><Eraser className="w-3.5 h-3.5" />Borrar</button>
                <button type="button" onClick={() => setBrushMode('restore')} className={`flex-1 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 ${brushMode === 'restore' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}><Brush className="w-3.5 h-3.5" />Restaurar</button>
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

          <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400">Pulir el borde</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" disabled={!ready} onClick={() => edge((m) => shrinkEdge(m, 1))} className={act} title="Se come 1 px del contorno: quita halos de color del fondo">Afinar</button>
              <button type="button" disabled={!ready} onClick={() => edge((m) => featherEdge(m, 1.5))} className={act} title="Suaviza el contorno dentado">Suavizar</button>
              <button type="button" disabled={!ready} onClick={() => edge((m) => { const n = removeSpecks(m, Math.max(12, Math.round((m.w * m.h) / 4000))); setMsg(n ? `Se quitaron ${n} píxeles sueltos.` : 'No había motas sueltas.'); })} className={act} title="Quita puntos sueltos">Motas</button>
            </div>
          </div>

          {msg && <p className="text-[11px] text-amber-300">{msg}</p>}
        </div>
        <div className="p-3 border-t border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Cancelar</button>
          <button type="button" disabled={!ready || !!ai} onClick={apply} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">Aplicar</button>
        </div>
      </aside>
    </div>
  );
}
