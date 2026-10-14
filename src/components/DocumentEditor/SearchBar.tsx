import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import type { ConfirmRequest } from '../../types/documentEditor';

/** Barra de búsqueda (Ctrl+F): palabras en el texto, los cuadros y el texto de los PDF. */
export function SearchBar({ engine, open, onClose, version }: { engine: DocumentEditorEngine | null; open: boolean; onClose: () => void; version: number }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ total: 0, index: -1 });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { input.current?.focus(); input.current?.select(); }
    else engine?.searchClear();
  }, [open, engine]);

  // Al escribir se busca (con una pausa corta para no trabar con documentos grandes).
  useEffect(() => {
    if (!open || !engine) return;
    const t = setTimeout(() => setRes(engine.search(q)), 160);
    return () => clearTimeout(t);
  }, [q, open, engine]);

  // Si el documento cambia mientras la barra está abierta, se vuelve a buscar.
  useEffect(() => {
    if (open && engine && q) setRes(engine.search(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!open) return null;
  const step = (d: 1 | -1) => engine && setRes(engine.searchStep(d));
  return (
    <div data-keep-selection className="fixed z-[75] top-[58px] right-3 md:right-6 left-3 md:left-auto md:w-[360px] flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-1.5 print:hidden">
      <Search className="w-4 h-4 text-slate-400 ml-1.5 shrink-0" />
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') step(e.shiftKey ? -1 : 1);
          else if (e.key === 'Escape') onClose();
        }}
        placeholder="Buscar en el documento…"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500 py-1.5"
      />
      <span className="text-[11px] tabular-nums text-slate-400 shrink-0 px-1">{q ? (res.total ? `${res.index + 1} / ${res.total}` : 'Sin resultados') : ''}</span>
      <button type="button" disabled={!res.total} onClick={() => step(-1)} title="Anterior (Mayús+Enter)" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
      <button type="button" disabled={!res.total} onClick={() => step(1)} title="Siguiente (Enter)" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
      <button type="button" onClick={onClose} title="Cerrar (Esc)" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"><X className="w-4 h-4" /></button>
    </div>
  );
}

/** Aviso de confirmación propio (en lugar del cuadro feo del navegador). */
export function ConfirmDialog({ req, onClose }: { req: ConfirmRequest | null; onClose: () => void }) {
  if (!req) return null;
  return (
    <div data-keep-selection className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/70 print:hidden" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">{req.title}</h2>
        <p className="text-sm text-slate-300 mt-1.5">{req.text}</p>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm border border-slate-600 text-slate-200 hover:border-slate-400">Cancelar</button>
          <button type="button" autoFocus onClick={() => { req.run(); onClose(); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#b4483f' }}>{req.yes}</button>
        </div>
      </div>
    </div>
  );
}
