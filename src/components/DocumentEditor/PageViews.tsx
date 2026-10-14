import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, PanelLeft, FileText, Presentation, LayoutGrid } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';

export type ViewMode = 'thumbs' | 'current';

/** Miniatura viva de una hoja (se redibuja unos instantes después de cada cambio y solo si está a la vista). */
function Thumb({ engine, id, width, version }: { engine: DocumentEditorEngine; id: string; width: number; version: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen) return;
    const t = setTimeout(() => {
      const el = host.current;
      const thumb = engine.buildPageThumbnail(id, width);
      if (el && thumb) el.replaceChildren(thumb);
    }, 180);
    return () => clearTimeout(t);
  }, [engine, id, width, version, seen]);

  return <div ref={host} style={{ width, minHeight: width * 1.3 }} className="bg-white rounded-sm overflow-hidden" />;
}

interface PanelProps {
  engine: DocumentEditorEngine | null;
  pageIds: string[];
  activeId: string | null;
  version: number;
  /** Escritorio: columna fija. Celular: hoja deslizable desde abajo. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onPresent: () => void;
}

export function ThumbnailPanel({ engine, pageIds, activeId, version, mobileOpen, onCloseMobile, onPresent }: PanelProps) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [activeId, mobileOpen]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  if (!engine) return null;

  const drop = () => {
    if (dragId && over && dragId !== over.id) {
      const rest = pageIds.filter((x) => x !== dragId);
      let at = rest.indexOf(over.id) + (over.after ? 1 : 0);
      if (at < 0) at = rest.length;
      engine.reorderPages([...rest.slice(0, at), dragId, ...rest.slice(at)]);
    }
    setDragId(null);
    setOver(null);
  };

  const list = (w: number, after?: () => void) =>
    pageIds.map((id, i) => {
      const on = id === activeId;
      const line = over?.id === id && dragId && dragId !== id;
      return (
        <div
          key={id}
          className="group relative"
          draggable
          onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
          onDragEnd={() => { setDragId(null); setOver(null); }}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const afterHalf = e.clientY > r.top + r.height / 2;
            setOver((p) => (p && p.id === id && p.after === afterHalf ? p : { id, after: afterHalf }));
          }}
          onDrop={(e) => { e.preventDefault(); drop(); }}
          style={{ opacity: dragId === id ? 0.4 : 1 }}
        >
          {line && !over!.after && <div className="absolute -top-0.5 left-1 right-1 h-1 rounded bg-blue-500 z-10" />}
          {line && over!.after && <div className="absolute -bottom-0.5 left-1 right-1 h-1 rounded bg-blue-500 z-10" />}
          <button
            ref={on ? activeRef : undefined}
            type="button"
            data-keep-selection
            onClick={() => { engine.scrollToPage(id); after?.(); }}
            onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); engine.deletePage(id); } }}
            title={`Ir a la hoja ${i + 1} · arrastra para moverla · Supr para eliminarla`}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-lg transition cursor-grab active:cursor-grabbing ${on ? 'bg-blue-600/15' : 'hover:bg-slate-800/70'}`}
          >
            <div className={`rounded-sm shadow ${on ? 'ring-2 ring-blue-600' : 'ring-1 ring-slate-700'}`}>
              <Thumb engine={engine} id={id} width={w} version={version} />
            </div>
            <span className={`text-[11px] ${on ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{i + 1}</span>
          </button>
          <button
            type="button"
            data-keep-selection
            title="Eliminar esta hoja"
            onClick={(e) => { e.stopPropagation(); engine.deletePage(id); }}
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center bg-slate-800 border border-slate-500 text-slate-100 shadow opacity-0 group-hover:opacity-100 max-md:opacity-100 hover:bg-rose-600 hover:border-rose-600 hover:text-white transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    });

  return (
    <>
      {/* Escritorio */}
      <aside data-tour-area="thumbs" className="max-md:hidden w-[140px] shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col print:hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hojas · {pageIds.length}</span>
          <button type="button" onClick={onPresent} title="Presentar a pantalla completa (F5)" className="text-slate-400 hover:text-blue-600"><Presentation className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col items-center gap-1 no-scrollbar">{list(100)}</div>
      </aside>

      {/* Celular */}
      {mobileOpen && <div className="md:hidden fixed inset-0 z-[55] bg-slate-950/50" onClick={onCloseMobile} />}
      <div
        data-keep-selection
        className={`md:hidden fixed inset-x-0 bottom-0 z-[56] bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-xl max-h-[70dvh] flex flex-col transition-transform duration-200 ${mobileOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-bold text-white">Hojas ({pageIds.length})</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { onCloseMobile(); onPresent(); }} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200"><Presentation className="w-3.5 h-3.5" /> Presentar</button>
            <button type="button" onClick={onCloseMobile} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-3 grid grid-cols-3 gap-2 justify-items-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          {mobileOpen && list(92, onCloseMobile)}
        </div>
      </div>
    </>
  );
}

/** Botones para cambiar la forma de ver el documento. */
export function ViewSwitcher({ mode, onMode, onPresent, pageCount, activeIndex, onOpenPages }: {
  mode: ViewMode; onMode: (m: ViewMode) => void; onPresent: () => void; pageCount: number; activeIndex: number; onOpenPages: () => void;
}) {
  const btn = (on: boolean) => `flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium transition ${on ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'}`;
  return (
    <div data-keep-selection data-tour="views" className="absolute z-20 bottom-[62px] right-3 md:bottom-4 md:right-auto md:left-4 flex items-center gap-0.5 bg-slate-900/95 border border-slate-700 rounded-full p-1 shadow-xl print:hidden">
      <button type="button" className={`${btn(mode === 'thumbs')} max-md:hidden`} onClick={() => onMode('thumbs')} title="Ver las hojas en miniatura a un lado"><LayoutGrid className="w-3.5 h-3.5" /> Miniaturas</button>
      <button type="button" className={`${btn(false)} md:hidden`} onClick={onOpenPages} title="Ver las hojas en miniatura"><LayoutGrid className="w-3.5 h-3.5" /> {activeIndex + 1}/{pageCount}</button>
      <button type="button" className={`${btn(mode === 'current')} max-md:hidden`} onClick={() => onMode('current')} title="Vista actual: solo la hoja, sin miniaturas"><FileText className="w-3.5 h-3.5" /> Actual</button>
      <button type="button" className={btn(false)} onClick={onPresent} title="Pantalla completa (F5)"><Presentation className="w-3.5 h-3.5" /> <span className="max-md:hidden">Pantalla completa</span><span className="md:hidden">Presentar</span></button>
    </div>
  );
}

/** Presentación a pantalla completa (como F5 en PowerPoint): una hoja por vez. */
export function PresentationView({ engine, open, startIndex, onClose }: { engine: DocumentEditorEngine | null; open: boolean; startIndex: number; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [ids, setIds] = useState<string[]>([]);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !engine) return;
    const list = engine.getPageIds();
    setIds(list);
    setI(Math.min(Math.max(0, startIndex), Math.max(0, list.length - 1)));
    void root.current?.requestFullscreen?.().catch(() => undefined);
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine]);

  useEffect(() => {
    if (!open) return;
    const rs = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); setI((n) => Math.min(ids.length - 1, n + 1)); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(ids.length - 1);
    };
    window.addEventListener('resize', rs);
    window.addEventListener('keydown', kd, true);
    return () => { window.removeEventListener('resize', rs); window.removeEventListener('keydown', kd, true); };
  }, [open, ids.length, onClose]);

  useEffect(() => {
    if (!open || !engine || !stage.current) return;
    const id = ids[i];
    if (!id) return;
    const page = document.getElementById(id);
    if (!page) return;
    const pw = page.offsetWidth, ph = page.offsetHeight;
    const scale = Math.min((size.w - 24) / pw, (size.h - 24) / ph);
    const frame = engine.buildPageThumbnail(id, Math.round(pw * scale));
    if (frame) {
      frame.querySelectorAll('[data-placeholder]').forEach((e) => e.setAttribute('data-placeholder', ''));
      frame.style.boxShadow = '0 10px 50px rgba(0,0,0,.55)';
      stage.current.replaceChildren(frame);
    }
  }, [open, engine, ids, i, size]);

  if (!open) return null;
  return (
    <div
      ref={root}
      data-keep-selection
      className="fixed inset-0 z-[120] bg-black flex items-center justify-center select-none print:hidden"
      onPointerDown={(e) => { touch.current = e.clientX; }}
      onPointerUp={(e) => {
        const x0 = touch.current; touch.current = null;
        if (x0 === null || (e.target as HTMLElement).closest('button')) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 50) setI((n) => Math.max(0, Math.min(ids.length - 1, n + (dx < 0 ? 1 : -1))));
        else setI((n) => Math.max(0, Math.min(ids.length - 1, n + (e.clientX > window.innerWidth * 0.3 ? 1 : -1))));
      }}
    >
      <div ref={stage} />
      <button type="button" onClick={onClose} title="Salir (Esc)" className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/15 text-white rounded-full px-2 py-1">
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="w-9 h-9 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm tabular-nums">{i + 1} / {ids.length}</span>
        <button type="button" disabled={i >= ids.length - 1} onClick={() => setI(i + 1)} className="w-9 h-9 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
      </div>
    </div>
  );
}

export { PanelLeft };
