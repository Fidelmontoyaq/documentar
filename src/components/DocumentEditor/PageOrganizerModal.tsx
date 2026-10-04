import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  X,
  CheckSquare,
  Square,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  FilePlus2,
  GripVertical,
  SplitSquareHorizontal,
  Rows3,
  LayoutGrid,
  Grid2x2,
  Grid3x3,
} from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import { fileExtension } from '../../engine/fileUtils';

interface PageOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
  history: { canUndo: boolean; canRedo: boolean };
}

type ViewMode = 'small' | 'medium' | 'large' | 'list';
const THUMB_WIDTH: Record<ViewMode, number> = { small: 108, medium: 170, large: 240, list: 72 };

// Paleta de colores para distinguir de un vistazo a qué archivo pertenece cada hoja.
// Se evita el azul a propósito: es el color que ya usa la selección.
const PALETTE = [
  { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500' },
  { border: 'border-fuchsia-500', text: 'text-fuchsia-400', bg: 'bg-fuchsia-500' },
  { border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-500' },
  { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500' },
  { border: 'border-rose-500', text: 'text-rose-400', bg: 'bg-rose-500' },
  { border: 'border-lime-500', text: 'text-lime-400', bg: 'bg-lime-500' },
  { border: 'border-violet-500', text: 'text-violet-400', bg: 'bg-violet-500' },
  { border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-500' },
];
const NO_GROUP = { border: 'border-slate-700', text: 'text-slate-400', bg: 'bg-slate-600' };
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Miniatura de una hoja: el motor construye el clon escalado y aquí solo se monta. */
function Thumb({ engine, id, version, width }: { engine: DocumentEditorEngine; id: string; version: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const thumb = engine.buildPageThumbnail(id, width);
    el.replaceChildren(...(thumb ? [thumb] : []));
  }, [engine, id, version, width]);
  return <div ref={ref} className="pointer-events-none" />;
}

/**
 * Organizador de páginas estilo "organizar PDF": marca una o varias hojas
 * (clic, Mayús+clic para un rango, o arrastrando un recuadro de selección) y
 * arrástralas juntas como un solo bloque; cada archivo importado se ve con
 * su propio color de borde, y se puede arrastrar por su etiqueta para mover
 * todas sus hojas de una vez. El resto de las hojas se acomoda en vivo,
 * antes de soltar, de forma estable (sin parpadeos).
 */
export function PageOrganizerModal({ open, onClose, engine, history }: PageOrganizerModalProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [groupsById, setGroupsById] = useState<Map<string, { groupId: string | null; label: string | null }>>(
    new Map()
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [undoToast, setUndoToast] = useState<{ count: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('medium');
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);

  const lastClicked = useRef<string | null>(null);
  const dragging = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const rectSnapshot = useRef<Map<string, DOMRect>>(new Map());
  const rafGate = useRef(false);
  const marqueeAdditive = useRef(false);
  const marqueeBase = useRef<string[]>([]);

  const refresh = useCallback(() => {
    if (!engine) return;
    setIds(engine.getPageIds());
    setGroupsById(new Map(engine.getPageGroups().map((g) => [g.id, { groupId: g.groupId, label: g.label }])));
    setVersion((v) => v + 1);
  }, [engine]);

  useEffect(() => {
    if (!open || !engine) return;
    refresh();
    setSelected([]);
    lastClicked.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine]);

  // ----- color por grupo (archivo de origen), estable mientras dure la sesión del modal -----
  const colorByGroup = useMemo(() => {
    const map = new Map<string, (typeof PALETTE)[number]>();
    let i = 0;
    ids.forEach((id) => {
      const g = groupsById.get(id)?.groupId;
      if (g && !map.has(g)) {
        map.set(g, PALETTE[i % PALETTE.length]);
        i++;
      }
    });
    return map;
  }, [ids, groupsById]);

  const colorFor = (id: string) => {
    const g = groupsById.get(id)?.groupId;
    return (g && colorByGroup.get(g)) || NO_GROUP;
  };

  // ----- ¿el archivo de esta hoja quedó fragmentado o recibió hojas de otro? -----
  const groupSpans = useMemo(() => {
    const spans = new Map<string, { min: number; max: number; count: number }>();
    ids.forEach((id, idx) => {
      const g = groupsById.get(id)?.groupId;
      if (!g) return;
      const s = spans.get(g) ?? { min: idx, max: idx, count: 0 };
      s.min = Math.min(s.min, idx);
      s.max = Math.max(s.max, idx);
      s.count++;
      spans.set(g, s);
    });
    return spans;
  }, [ids, groupsById]);

  const isBroken = (id: string) => {
    const g = groupsById.get(id)?.groupId;
    if (!g) return false;
    const span = groupSpans.get(g);
    if (!span) return false;
    return span.max - span.min + 1 !== span.count;
  };

  const group = ids.filter((id) => selected.includes(id)); // seleccionadas, en su orden actual

  // ----- vista previa en vivo: dónde quedaría todo si soltara el mouse ahora -----
  const displayIds = useMemo(() => {
    if (!dropTarget || draggingIds.length === 0) return ids;
    const moving = draggingIds;
    const rest = ids.filter((id) => !moving.includes(id));
    let index = rest.indexOf(dropTarget.id) + (dropTarget.after ? 1 : 0);
    if (index < 0) index = rest.length;
    return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
  }, [ids, dropTarget, draggingIds]);

  const showUndoToast = (count: number) => {
    setUndoToast({ count });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setUndoToast(null), 6000);
  };

  // ----- selección por clic -----
  const handleCardClick = (id: string, e: ReactMouseEvent) => {
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

  // ----- selección arrastrando un recuadro (lasso) sobre el fondo -----
  const handleGridMouseDown = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-card-id], [data-group-pill], button, input, a')) return;
    if (e.button !== 0) return;
    marqueeAdditive.current = e.shiftKey;
    marqueeBase.current = e.shiftKey ? selected : [];
    const start = { x: e.clientX, y: e.clientY };
    setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });

    const onMove = (ev: globalThis.MouseEvent) => {
      setMarquee({ x0: start.x, y0: start.y, x1: ev.clientX, y1: ev.clientY });
      const left = Math.min(start.x, ev.clientX);
      const right = Math.max(start.x, ev.clientX);
      const top = Math.min(start.y, ev.clientY);
      const bottom = Math.max(start.y, ev.clientY);
      const hits: string[] = [];
      gridRef.current?.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
          hits.push(el.dataset.cardId as string);
        }
      });
      setSelected(Array.from(new Set([...marqueeAdditive.current ? marqueeBase.current : [], ...hits])));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarquee(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ----- acciones con botones -----
  const moveToEdge = (edge: 'start' | 'end') => {
    if (!group.length || !engine) return;
    const rest = ids.filter((id) => !selected.includes(id));
    const next = edge === 'start' ? [...group, ...rest] : [...rest, ...group];
    setIds(next);
    engine.reorderPages(next);
  };

  const nudge = (dir: -1 | 1) => {
    if (!group.length || !engine) return;
    const next = [...ids];
    const sel = (id: string) => selected.includes(id);
    if (dir === -1) {
      for (let i = 1; i < next.length; i++) if (sel(next[i]) && !sel(next[i - 1])) [next[i - 1], next[i]] = [next[i], next[i - 1]];
    } else {
      for (let i = next.length - 2; i >= 0; i--) if (sel(next[i]) && !sel(next[i + 1])) [next[i + 1], next[i]] = [next[i], next[i + 1]];
    }
    setIds(next);
    engine.reorderPages(next);
  };

  const duplicateSelected = () => {
    if (!engine || !group.length) return;
    engine.duplicatePages(group);
    refresh();
  };

  const deleteSelected = () => {
    if (!engine || !group.length) return;
    const count = group.length;
    engine.deletePages(group);
    refresh();
    setSelected([]);
    showUndoToast(count);
  };

  const handleUndo = () => {
    engine?.undo();
    refresh();
    setSelected([]);
    setUndoToast(null);
  };
  const handleRedo = () => {
    engine?.redo();
    refresh();
    setSelected([]);
  };

  const handleAddFiles = async (files: File[]) => {
    if (!engine || !files.length) return;
    await engine.handleFileSelect(files, '1');
    refresh();
  };

  // ----- arrastrar y soltar hojas: snapshot fijo de posiciones al iniciar, para que la
  // vista previa en vivo nunca "tiemble" (el objetivo se calcula contra ese snapshot, no
  // contra el DOM que se va reacomodando). -----
  const snapshotRects = () => {
    const map = new Map<string, DOMRect>();
    gridRef.current?.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
      map.set(el.dataset.cardId as string, el.getBoundingClientRect());
    });
    rectSnapshot.current = map;
  };

  const beginDrag = (e: DragEvent, moving: string[], label: string) => {
    dragging.current = moving;
    setDraggingIds(moving);
    setDropTarget(null);
    snapshotRects();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', moving.join(','));
    const source = e.currentTarget as HTMLElement;
    try {
      e.dataTransfer.setDragImage(source, 24, 24);
    } catch {
      const badge = document.createElement('div');
      badge.textContent = label;
      badge.style.cssText =
        'position:fixed;top:-200px;padding:8px 14px;background:#2563eb;color:#fff;border-radius:8px;font:600 13px sans-serif;';
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 20, 20);
      setTimeout(() => badge.remove(), 0);
    }
  };

  const handleDragStart = (e: DragEvent, id: string) => {
    const moving = selected.includes(id) ? group : [id];
    if (!selected.includes(id)) setSelected([id]);
    beginDrag(e, moving, moving.length > 1 ? `${moving.length} páginas` : 'Página');
  };

  const handleGroupDragStart = (e: DragEvent, groupId: string, label: string, count: number) => {
    e.stopPropagation();
    const moving = ids.filter((id) => groupsById.get(id)?.groupId === groupId);
    setSelected(moving);
    beginDrag(e, moving, `${label} (${count} hojas)`);
  };

  /** Encuentra, contra el snapshot fijo, la tarjeta más cercana al cursor (nunca contra el DOM en vivo). */
  const nearestFromSnapshot = (clientX: number, clientY: number): { id: string; after: boolean } | null => {
    let best: { id: string; after: boolean; dist: number } | null = null;
    rectSnapshot.current.forEach((rect, id) => {
      if (dragging.current.includes(id)) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
      if (!best || dist < best.dist) {
        const after = viewMode === 'list' ? clientY > cy : clientX > cx;
        best = { id, after, dist };
      }
    });
    return best;
  };

  const handleGridDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!dragging.current.length) return; // deja pasar: puede ser un drop de archivos del sistema
    if (rafGate.current) return;
    rafGate.current = true;
    const { clientX, clientY } = e;
    requestAnimationFrame(() => {
      rafGate.current = false;
      const next = nearestFromSnapshot(clientX, clientY);
      setDropTarget((prev) => {
        if (!next) return prev;
        if (prev?.id === next.id && prev.after === next.after) return prev;
        return { id: next.id, after: next.after };
      });
    });
  };

  const commitReorder = () => {
    const moving = dragging.current;
    if (!moving.length || !engine) return;
    const rest = ids.filter((id) => !moving.includes(id));
    let index = rest.length;
    if (dropTarget) index = rest.indexOf(dropTarget.id) + (dropTarget.after ? 1 : 0);
    if (index < 0) index = rest.length;
    const next = [...rest.slice(0, index), ...moving, ...rest.slice(index)];
    setIds(next);
    engine.reorderPages(next);
  };

  const handleDragEnd = () => {
    dragging.current = [];
    setDraggingIds([]);
    setDropTarget(null);
  };

  // ----- soltar archivos del sistema operativo (inteligente) -----
  const classifyFiles = (files: File[]): 'images' | 'files' => {
    const allImages = files.every((f) => IMAGE_EXTS.includes(fileExtension(f.name)));
    return allImages ? 'images' : 'files';
  };

  const handleGridDrop = async (e: DragEvent) => {
    e.preventDefault();
    const osFiles = Array.from(e.dataTransfer.files ?? []);
    if (osFiles.length > 0) {
      setDropHint(null);
      const kind = classifyFiles(osFiles);
      if (kind === 'files') {
        // Un PDF/Word, o una mezcla con imágenes: cada archivo entra como su propio archivo/hojas.
        await handleAddFiles(osFiles);
      } else {
        // Solo imágenes: si cayeron sobre una hoja concreta, se agregan ahí; si no, a la última hoja.
        const targetEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(
          '[data-card-id]'
        );
        const targetId = targetEl?.dataset.cardId ?? ids[ids.length - 1];
        if (targetId && engine) {
          await engine.addImagesToPage(targetId, osFiles, 4);
          refresh();
        }
      }
      return;
    }
    commitReorder();
    dragging.current = [];
    setDraggingIds([]);
    setDropTarget(null);
  };

  const handleGridDragEnter = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) setDropHint('Suelta para agregar');
  };
  const handleGridDragLeaveOuter = (e: DragEvent) => {
    if (e.currentTarget === e.target) setDropHint(null);
  };

  const tb =
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition';
  const none = group.length === 0;

  // Etiqueta de archivo a mostrar encima (o a la izquierda, en lista) de cada bloque contiguo del mismo grupo.
  const groupPillAt = (index: number): { groupId: string; label: string; count: number } | null => {
    const id = displayIds[index];
    const g = groupsById.get(id)?.groupId;
    if (!g) return null;
    const total = ids.filter((pid) => groupsById.get(pid)?.groupId === g).length;
    if (total < 2) return null;
    const prevId = displayIds[index - 1];
    if (prevId && groupsById.get(prevId)?.groupId === g) return null; // no es el primero de su bloque
    return { groupId: g, label: groupsById.get(id)?.label ?? 'Archivo', count: total };
  };

  const isList = viewMode === 'list';
  const thumbWidth = THUMB_WIDTH[viewMode];

  const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'small', label: 'Pequeño', icon: Grid3x3 },
    { id: 'medium', label: 'Mediano', icon: Grid2x2 },
    { id: 'large', label: 'Grande', icon: LayoutGrid },
    { id: 'list', label: 'Lista', icon: Rows3 },
  ];

  return (
    <div className={`fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-40 print:hidden ${open ? 'flex flex-col' : 'hidden'}`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg">Organizar Páginas</h2>
          <p className="text-xs text-slate-400">
            Cada color de borde es un archivo distinto. Arrastra un recuadro sobre el fondo para seleccionar
            varias, o suelta imágenes/archivos aquí mismo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            {VIEW_OPTIONS.map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  title={v.label}
                  onClick={() => setViewMode(v.id)}
                  className={`w-8 h-8 flex items-center justify-center rounded-md transition ${
                    viewMode === v.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-800 shrink-0">
        <button type="button" className={tb} onClick={() => fileInputRef.current?.click()}>
          <FilePlus2 className="w-3.5 h-3.5" /> Agregar archivos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.png,.jpg,.jpeg,.gif,.webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void handleAddFiles(files);
          }}
        />
        <span className="w-px h-6 bg-slate-700 mx-1" />
        <button type="button" className={tb} onClick={handleUndo} disabled={!history.canUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 className="w-3.5 h-3.5" /> Deshacer
        </button>
        <button type="button" className={tb} onClick={handleRedo} disabled={!history.canRedo} title="Rehacer (Ctrl+Y)">
          <Redo2 className="w-3.5 h-3.5" /> Rehacer
        </button>
        <span className="w-px h-6 bg-slate-700 mx-1" />
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

      <div
        className="flex-1 overflow-y-auto p-6 relative"
        onDragOver={handleGridDragOver}
        onDrop={(e) => void handleGridDrop(e)}
        onDragEnter={handleGridDragEnter}
        onDragLeave={handleGridDragLeaveOuter}
        onMouseDown={handleGridMouseDown}
      >
        {dropHint && (
          <div className="sticky top-0 z-10 mb-3 text-center text-xs font-medium text-blue-300 bg-blue-500/10 border border-dashed border-blue-500/40 rounded-lg py-2">
            {dropHint} — imágenes se añaden a la hoja donde las sueltes; PDF/Word entran como archivos nuevos
          </div>
        )}
        <div
          ref={gridRef}
          className={isList ? 'flex flex-col gap-2' : 'flex flex-wrap gap-x-6 gap-y-10 items-start'}
        >
          {engine &&
            displayIds.map((id, index) => {
              const isSel = selected.includes(id);
              const showBefore = dropTarget?.id === id && !dropTarget.after;
              const showAfter = dropTarget?.id === id && dropTarget.after;
              const color = colorFor(id);
              const broken = isBroken(id);
              const pill = groupPillAt(index);
              const originalIndex = ids.indexOf(id);
              const label = groupsById.get(id)?.label;

              if (isList) {
                return (
                  <div key={id} className="relative">
                    {pill && (
                      <div
                        draggable
                        onDragStart={(e) => handleGroupDragStart(e, pill.groupId, pill.label, pill.count)}
                        onDragEnd={handleDragEnd}
                        title={`Arrastra para mover las ${pill.count} hojas de "${pill.label}" juntas`}
                        data-group-pill
                        className={`flex items-center gap-1 px-2 py-1 mb-1 rounded-md text-[10px] font-medium text-white cursor-grab active:cursor-grabbing w-fit max-w-[260px] truncate ${color.bg}`}
                      >
                        <GripVertical className="w-3 h-3 shrink-0" />
                        <span className="truncate">{pill.label}</span>
                        <span className="opacity-80 shrink-0">· {pill.count}</span>
                      </div>
                    )}
                    <div
                      data-card-id={id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => handleCardClick(id, e)}
                      onDoubleClick={() => {
                        engine.scrollToPage(id);
                        onClose();
                      }}
                      className={`relative flex items-center gap-3 rounded-lg border-[3px] px-3 py-2 cursor-grab active:cursor-grabbing select-none transition-all duration-150 ${color.border} ${
                        isSel ? 'bg-amber-400/10 ring-2 ring-amber-400' : 'bg-slate-900 hover:bg-slate-800/70'
                      } ${draggingIds.includes(id) ? 'thumb-dragging' : ''}`}
                    >
                      {showBefore && <div className="absolute left-2 right-2 -top-1.5 h-1 rounded bg-white thumb-drop-line" />}
                      {showAfter && <div className="absolute left-2 right-2 -bottom-1.5 h-1 rounded bg-white thumb-drop-line" />}
                      <span
                        className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center border-2 shadow ${
                          isSel ? 'bg-slate-950 border-amber-400' : 'bg-slate-950/90 border-slate-400'
                        }`}
                      >
                        {isSel ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-300" />}
                      </span>
                      <div className="shrink-0 w-[72px] rounded overflow-hidden border border-slate-700">
                        <Thumb engine={engine} id={id} version={version} width={thumbWidth} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${color.text}`}>Página {originalIndex + 1}</div>
                        {label && <div className="text-[11px] text-slate-500 truncate">{label}</div>}
                      </div>
                      {broken && (
                        <span title={`"${label}" quedó dividido entre varios grupos de hojas`} className="shrink-0">
                          <SplitSquareHorizontal className="w-4 h-4 text-orange-400" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={id} className="relative" style={{ width: thumbWidth }}>
                  {pill && (
                    <div
                      draggable
                      onDragStart={(e) => handleGroupDragStart(e, pill.groupId, pill.label, pill.count)}
                      onDragEnd={handleDragEnd}
                      title={`Arrastra para mover las ${pill.count} hojas de "${pill.label}" juntas`}
                      data-group-pill
                      className={`absolute -top-7 left-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-grab active:cursor-grabbing max-w-full truncate ${color.bg}`}
                    >
                      <GripVertical className="w-3 h-3 shrink-0" />
                      <span className="truncate">{pill.label}</span>
                      <span className="opacity-80 shrink-0">· {pill.count}</span>
                    </div>
                  )}
                  <div
                    data-card-id={id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, id)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleCardClick(id, e)}
                    onDoubleClick={() => {
                      engine.scrollToPage(id);
                      onClose();
                    }}
                    className={`relative shrink-0 select-none cursor-grab active:cursor-grabbing transition-all duration-150 ${
                      draggingIds.includes(id) ? 'thumb-dragging' : ''
                    }`}
                  >
                    {showBefore && <div className="absolute -left-3.5 top-0 bottom-6 w-1 rounded bg-white thumb-drop-line" />}
                    {showAfter && <div className="absolute -right-3.5 top-0 bottom-6 w-1 rounded bg-white thumb-drop-line" />}
                    <div
                      className={`rounded-lg overflow-hidden border-[3px] shadow transition-all duration-150 ${color.border} ${
                        isSel ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''
                      }`}
                    >
                      <Thumb engine={engine} id={id} version={version} width={thumbWidth} />
                    </div>
                    {/* Insignia siempre con fondo sólido oscuro: se ve igual sobre una hoja blanca o de cualquier color. */}
                    <span
                      key={isSel ? `${id}-on` : `${id}-off`}
                      className={`check-pop absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center border-2 shadow-lg ${
                        isSel ? 'bg-slate-950 border-amber-400' : 'bg-slate-950/90 border-slate-400'
                      }`}
                    >
                      {isSel ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4 text-slate-300" />}
                    </span>
                    {broken && (
                      <span
                        title={`"${label}" quedó dividido entre varios grupos de hojas`}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center bg-slate-950 border-2 border-orange-400 shadow-lg"
                      >
                        <SplitSquareHorizontal className="w-3.5 h-3.5 text-orange-400" />
                      </span>
                    )}
                    <span className={`block text-center text-[11px] mt-1.5 ${color.text}`}>Página {originalIndex + 1}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {marquee && (
        <div
          className="fixed z-50 border-2 border-amber-400 bg-amber-400/10 pointer-events-none"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {undoToast && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-3 text-sm text-slate-100">
          <span>
            {undoToast.count} página{undoToast.count > 1 ? 's' : ''} eliminada{undoToast.count > 1 ? 's' : ''}.
          </span>
          <button type="button" onClick={handleUndo} className="flex items-center gap-1 text-amber-400 font-semibold hover:text-amber-300">
            <Undo2 className="w-3.5 h-3.5" /> Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
