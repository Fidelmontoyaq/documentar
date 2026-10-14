import { useEffect, useRef, useState } from 'react';
import { X, Download, RotateCcw, Maximize2 } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import { FX_DEFAULT, isDefaultFx, type Fx } from '../../engine/imageFx';

interface Props {
  engine: DocumentEditorEngine | null;
  /** 'box' = imagen seleccionada; 'page' = hoja de PDF. */
  mode: 'box' | 'page';
  pageId?: string;
  selCount?: number;
  onClose: () => void;
}

const TONES: { id: string; label: string; fx: Partial<Fx>; color?: string }[] = [
  { id: 'orig', label: 'Original', fx: {} },
  { id: 'gray', label: 'Grises', fx: { gray: true } },
  { id: 'bw', label: 'Blanco y negro', fx: { bw: 130 } },
  { id: 'sepia', label: 'Sepia', fx: { tone: '#8a5a2b', toneAmt: 85 }, color: '#8a5a2b' },
  { id: 'blue', label: 'Azul', fx: { tone: '#2563eb', toneAmt: 80 }, color: '#2563eb' },
  { id: 'green', label: 'Verde', fx: { tone: '#16a34a', toneAmt: 80 }, color: '#16a34a' },
  { id: 'red', label: 'Rojo', fx: { tone: '#dc2626', toneAmt: 80 }, color: '#dc2626' },
  { id: 'violet', label: 'Violeta', fx: { tone: '#7c3aed', toneAmt: 80 }, color: '#7c3aed' },
];

export function ImageFxPanel({ engine, mode, pageId, selCount = 1, onClose }: Props) {
  const [fx, setFx] = useState<Fx>(FX_DEFAULT);
  const [scope, setScope] = useState<'page' | 'allPages'>('page');
  const [size, setSize] = useState<{ w: number; h: number; natW: number; natH: number; cropped: boolean } | null>(null);
  const pending = useRef<Fx | null>(null);
  const running = useRef(false);
  const latest = useRef<Fx>(FX_DEFAULT);

  const target = mode === 'box' ? 'box' : scope;

  useEffect(() => {
    if (!engine) return;
    const f = engine.getImageFx(mode === 'box' ? 'box' : 'page', pageId);
    latest.current = f;
    setFx(f);
    if (mode === 'box') setSize(engine.getBoxSize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, mode, pageId]);

  const pump = async () => {
    if (running.current || !engine) return;
    running.current = true;
    while (pending.current) {
      const next = pending.current;
      pending.current = null;
      await engine.setImageFx(target, next, { commit: false, pageId });
    }
    running.current = false;
  };
  const apply = (patch: Partial<Fx>, replace = false) => {
    const next = replace ? { ...FX_DEFAULT, ...patch } : { ...fx, ...patch };
    setFx(next);
    latest.current = next;
    pending.current = next;
    void pump();
  };
  const finish = () => {
    // Deja el cambio final registrado en el historial (para Deshacer).
    const next = latest.current;
    pending.current = null;
    void engine?.setImageFx(target, next, { commit: true, pageId });
  };

  const slider = (label: string, key: 'sat' | 'bri' | 'con' | 'hue', min: number, max: number, unit = '%') => (
    <label className="block text-[11px] text-slate-400">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-slate-300">{fx[key]}{unit}</span></span>
      <input
        type="range" min={min} max={max} value={fx[key]}
        onChange={(e) => apply({ [key]: Number(e.target.value) } as Partial<Fx>)}
        onPointerUp={finish} onKeyUp={finish}
        className="zoom-range !w-full mt-1"
      />
    </label>
  );

  const activeTone = TONES.find((t) => {
    if (t.id === 'orig') return !fx.gray && !fx.bw && !fx.tone;
    if (t.id === 'gray') return fx.gray && !fx.bw && !fx.tone;
    if (t.id === 'bw') return fx.bw > 0;
    return !!t.fx.tone && fx.tone === t.fx.tone;
  })?.id;

  const input = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500';

  return (
    <div data-keep-selection className="fixed z-[78] left-2 right-2 md:left-auto md:right-6 top-[110px] md:w-[320px] max-h-[calc(100dvh-130px)] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">{mode === 'box' ? 'Ajustes de la imagen' : 'Color de la hoja'}</span>
        <button type="button" onClick={onClose} title="Cerrar" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </div>

      {mode === 'page' && (
        <div className="grid grid-cols-2 gap-1.5">
          {([['page', 'Esta hoja'], ['allPages', 'Todas las hojas']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setScope(v)} className={`py-1.5 rounded-lg text-[11px] font-medium border ${scope === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`} style={scope === v ? { color: '#fff' } : undefined}>{l}</button>
          ))}
        </div>
      )}

      {mode === 'box' && size && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-300">Tamaño</div>
          <div className="flex items-center gap-1.5">
            <input type="number" className={input} value={size.w} min={10} onChange={(e) => { const v = Number(e.target.value); setSize({ ...size, w: v }); if (v >= 10) engine?.setBoxSize('w', v); }} title="Ancho (px)" />
            <span className="text-slate-500 text-xs">×</span>
            <input type="number" className={input} value={size.h} min={10} onChange={(e) => { const v = Number(e.target.value); setSize({ ...size, h: v }); if (v >= 10) engine?.setBoxSize('h', v); }} title="Alto (px)" />
            <button type="button" title="Volver al tamaño original de la imagen" onClick={() => { engine?.resetBoxSize(); setTimeout(() => setSize(engine?.getBoxSize() ?? null), 60); }} className="shrink-0 h-8 px-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center gap-1 text-[11px]"><Maximize2 className="w-3.5 h-3.5" /> Original</button>
          </div>
          {size.cropped && <p className="text-[10px] text-amber-400">Tiene recorte: quítalo para cambiar el tamaño con números.</p>}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-300">Color</div>
        <div className="grid grid-cols-4 gap-1.5">
          {TONES.map((t) => (
            <button
              key={t.id} type="button"
              onClick={() => { apply({ ...t.fx, sat: fx.sat, bri: fx.bri, con: fx.con, hue: fx.hue }, true); setTimeout(finish, 0); }}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-medium border flex flex-col items-center gap-1 ${activeTone === t.id ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
            >
              <span className="w-4 h-4 rounded-full border border-slate-500" style={{ background: t.color ?? (t.id === 'orig' ? 'conic-gradient(#f87171,#fbbf24,#4ade80,#60a5fa,#c084fc,#f87171)' : t.id === 'gray' ? '#9ca3af' : '#fff') }} />
              {t.label}
            </button>
          ))}
        </div>
        {fx.bw > 0 && (
          <label className="block text-[11px] text-slate-400">
            <span className="flex justify-between"><span>Umbral del blanco y negro</span><span className="tabular-nums text-slate-300">{fx.bw}</span></span>
            <input type="range" min={20} max={235} value={fx.bw} onChange={(e) => apply({ bw: Number(e.target.value) })} onPointerUp={finish} onKeyUp={finish} className="zoom-range !w-full mt-1" />
          </label>
        )}
        {!!fx.tone && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-slate-400">Tono
              <input type="color" value={fx.tone} onChange={(e) => apply({ tone: e.target.value })} onBlur={finish} className="w-9 h-7 bg-slate-800 border border-slate-700 rounded cursor-pointer" />
            </label>
            <label className="flex-1 text-[11px] text-slate-400">Intensidad {fx.toneAmt}%
              <input type="range" min={0} max={100} value={fx.toneAmt} onChange={(e) => apply({ toneAmt: Number(e.target.value) })} onPointerUp={finish} onKeyUp={finish} className="zoom-range !w-full mt-1" />
            </label>
          </div>
        )}
        {!fx.tone && (
          <label className="flex items-center gap-2 text-[11px] text-slate-400">Rampa de tono personalizada
            <input type="color" value="#2563eb" onChange={(e) => apply({ tone: e.target.value, toneAmt: 80, gray: false, bw: 0 })} onBlur={finish} className="w-9 h-7 bg-slate-800 border border-slate-700 rounded cursor-pointer" />
          </label>
        )}
        {slider('Saturación', 'sat', 0, 300)}
        {slider('Brillo', 'bri', 30, 200)}
        {slider('Contraste', 'con', 30, 200)}
        {slider('Matiz (cambia los colores)', 'hue', -180, 180, '°')}
        <button type="button" disabled={isDefaultFx(fx)} onClick={() => { apply(FX_DEFAULT, true); setTimeout(finish, 0); }} className="w-full py-1.5 rounded-lg text-xs border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Volver al color original</button>
      </div>

      {mode === 'box' && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-300">Guardar {selCount > 1 ? `las ${selCount} imágenes juntas` : 'esta imagen'}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => void engine?.saveSelectionAsImage('png')} className="py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5" style={{ color: '#fff' }}><Download className="w-3.5 h-3.5" /> PNG (transparente)</button>
            <button type="button" onClick={() => void engine?.saveSelectionAsImage('jpg')} className="py-2 rounded-lg text-xs font-semibold border border-slate-600 text-slate-100 hover:bg-slate-800 flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" /> JPG</button>
          </div>
          <p className="text-[10px] text-slate-500">Sale solo la imagen (con su recorte, fondo quitado o borde de sticker), sin la hoja.</p>
        </div>
      )}
    </div>
  );
}
