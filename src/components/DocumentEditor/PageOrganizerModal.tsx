import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { X, CheckSquare, Square, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Copy, Trash2 } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';

interface PageOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
}

/** Miniatura de una hoja: el motor construye el clon escalado y aquí solo se monta. */
function Thumb({ engine, id, version }: { engine: DocumentEditorEngine; id: string; version: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const thumb = engine.buildPageThumbnail(id);
    el.replaceChildren(...(thumb ? [thumb] : []));
  }, [engine, id, version]);
  return <div ref={ref} className="pointer-events-none" />;
}

/**
 * Organizador de páginas estilo "organizar PDF": marca una o varias hojas
 * (clic, Mayús+clic para rango) y arrástralas juntas como un solo bloque, o
 * usa los botones para moverlas, duplicarlas o eliminarlas.
 */
export function PageOrganizerModal({ open, onClose, engine }: PageOrganizerModalProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const lastClicked = useRef<string | null>(null);
  const dragging = useRef<string[]>([]);

  useEffect(() => {
    if (!open || !engine) return;
    setIds(engine.getPageIds());
    setSelected([]);
    setVersion((v) => v + 1);
    lastClicked.current = null;
  }, [open, engine]);

  const commit = useCallback(
    (next: string[]) => {
      setIds(next);
      engine?.reorderPages(next);
    },
    [engine]
  );

  const group = ids.filter((id) => selected.includes(id)); // seleccionadas en su orden actual

  // ----- selección -----
  const handleCardClick = (id: string, e: MouseEvent) => {
    if (e.shiftKey && lastClicked.current) {
      const a = ids.indexOf(lastClicked.current);
      const b = ids.indexOf(id);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(Array.from(new Set([...selected, ...ids.slice(from, to + 1)])));
    } else {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
    lastClicked.current = id;
  };

  // ----- acciones con botones -----
  const moveToEdge = (edge: 'start' | 'end') => {
    if (!group.length) return;
    const rest = ids.filter((id) => !selected.includes(id));
    commit(edge === 'start' ? [...group, ...rest] : [...rest, ...group]);
  };

  const nudge = (dir: -1 | 1) => {
    if (!group.length) return;
    const next = [...ids];
    const sel = (id: string) => selected.includes(id);
    if (dir === -1) {
      for (let i = 1; i < next.length; i++) if (sel(next[i]) && !sel(next[i - 1])) [next[i - 1], next[i]] = [next[i], next[i - 1]];
    } else {
      for (let i = next.length - 2; i >= 0; i--) if (sel(next[i]) && !sel(next[i + 1])) [next[i + 1], next[i]] = [next[i], next[i + 1]];
    }
    commit(next);
  };

  const duplicateSelected = () => {
    if (!engine || !group.length) return;
    engine.duplicatePages(group);
    setIds(engine.getPageIds());
  };

  const deleteSelected = () => {
    if (!engine || !group.length) return;
    engine.deletePages(group);
    setIds(engine.getPageIds());
    setSelected([]);
  };

  // ----- arrastrar y soltar (grupo completo como un solo bloque) -----
  const handleDragStart = (e: DragEvent, id: string) => {
    const moving = selected.includes(id) ? group : [id];
    if (!selected.includes(id)) setSelected([id]);
    dragging.current = moving;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', moving.join(','));
    if (moving.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = `${moving.length} páginas`;
      badge.style.cssText =
        'position:fixed;top:-100px;padding:8px 14px;background:#2563eb;color:#fff;border-radius:8px;font:600 13px sans-serif;';
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 20, 20);
      setTimeout(() => badge.remove(), 0);
    }
  };

  const handleDragOverCard = (e: DragEvent, id: string) => {
    e.preventDefault();
    if (dragging.current.includes(id)) {
      setDropTarget(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTarget({ id, after: e.clientX > rect.left + rect.width / 2 });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const moving = dragging.current;
    if (!moving.length) return;
    const rest = ids.filter((id) => !moving.includes(id));
    let index = rest.length; // sin destino: al final
    if (dropTarget) index = rest.indexOf(dropTarget.id) + (dropTarget.after ? 1 : 0);
    commit([...rest.slice(0, index), ...moving, ...rest.slice(index)]);
    dragging.current = [];
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    dragging.current = [];
    setDropTarget(null);
  };

  const tb =
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition';
  const none = group.length === 0;

  return (
    <div className={`fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-40 print:hidden ${open ? 'flex flex-col' : 'hidden'}`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg">Organizar Páginas</h2>
          <p className="text-xs text-slate-400">
            Haz clic para marcar hojas (Mayús+clic para un rango) y arrástralas juntas como un solo bloque.
            Doble clic en una hoja para ir a ella.
          </p>
        </div>
        <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-800 shrink-0">
        <button type="button" className={tb} onClick={() => setSelected(ids)}>
          <CheckSquare className="w-3.5 h-3.5" /> Seleccionar todo
        </button>
        <button type="button" className={tb} disabled={none} onClick={() => setSelected([])}>
          <Square className="w-3.5 h-3.5" /> Limpiar
        </button>
        <span className="w-px h-6 bg-slate-700 mx-1" />
        <button type="button" className={tb} disabled={none} onClick={() => moveToEdge('start')} title="Mover al inicio">
          <ChevronsLeft className="w-3.5 h-3.5" /> Inicio
        </button>
        <button type="button" className={tb} disabled={none} onClick={() => nudge(-1)} title="Una posición atrás">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={tb} disabled={none} onClick={() => nudge(1)} title="Una posición adelante">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={tb} disabled={none} onClick={() => moveToEdge('end')} title="Mover al final">
          Final <ChevronsRight className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-6 bg-slate-700 mx-1" />
        <button type="button" className={tb} disabled={none} onClick={duplicateSelected}>
          <Copy className="w-3.5 h-3.5" /> Duplicar
        </button>
        <button type="button" className={`${tb} hover:!bg-rose-700`} disabled={none} onClick={deleteSelected}>
          <Trash2 className="w-3.5 h-3.5" /> Eliminar
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {group.length} de {ids.length} seleccionadas
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <div className="flex flex-wrap gap-6">
          {engine &&
            ids.map((id, index) => {
              const isSel = selected.includes(id);
              const showBefore = dropTarget?.id === id && !dropTarget.after;
              const showAfter = dropTarget?.id === id && dropTarget.after;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOverCard(e, id)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => handleCardClick(id, e)}
                  onDoubleClick={() => {
                    engine.scrollToPage(id);
                    onClose();
                  }}
                  className="relative w-[170px] shrink-0 select-none cursor-grab active:cursor-grabbing"
                >
                  {showBefore && <div className="absolute -left-3.5 top-0 bottom-6 w-1 rounded bg-blue-500" />}
                  {showAfter && <div className="absolute -right-3.5 top-0 bottom-6 w-1 rounded bg-blue-500" />}
                  <div
                    className={`rounded-lg overflow-hidden border-2 shadow transition ${
                      isSel ? 'border-blue-500 ring-4 ring-blue-500/40' : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <Thumb engine={engine} id={id} version={version} />
                  </div>
                  <span
                    className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center border ${
                      isSel ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900/80 border-slate-500 text-slate-300'
                    }`}
                  >
                    {isSel ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </span>
                  <span className="block text-center text-[11px] text-slate-400 mt-1.5">Página {index + 1}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
