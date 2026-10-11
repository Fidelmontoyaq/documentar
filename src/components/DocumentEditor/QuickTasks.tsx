import { useRef } from 'react';
import { X, Hash, LayoutGrid, FilePenLine, Combine, Zap } from 'lucide-react';
import { RemoveBgIcon } from './icons';

export type QuickTask = 'folio' | 'removebg' | 'organize' | 'editpdf' | 'merge';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (task: QuickTask, files?: File[]) => void;
}

/**
 * Tareas rápidas: se va directo a lo que se quiere hacer, sin abrir ni preparar el lienzo.
 */
export function QuickTasks({ open, onClose, onPick }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ task: QuickTask; multiple: boolean; accept: string } | null>(null);
  if (!open) return null;

  const withFiles = (task: QuickTask, accept: string, multiple: boolean) => {
    pending.current = { task, multiple, accept };
    const el = fileRef.current!;
    el.accept = accept;
    el.multiple = multiple;
    el.click();
  };

  const cards: { id: QuickTask; icon: JSX.Element; title: string; text: string; action: () => void }[] = [
    { id: 'folio', icon: <Hash className="w-6 h-6" />, title: 'Foliar varios archivos', text: 'Sube todos tus PDF o imágenes, ponles número de folio y descárgalos ya foliados.', action: () => onPick('folio') },
    { id: 'removebg', icon: <RemoveBgIcon className="w-6 h-6" />, title: 'Quitar fondo a mis imágenes', text: 'Una o muchas imágenes: quita el fondo (objeto, persona o fondo liso) y descarga los PNG.', action: () => onPick('removebg') },
    { id: 'organize', icon: <LayoutGrid className="w-6 h-6" />, title: 'Ordenar un archivo', text: 'Abre un PDF y reordena, gira, duplica o elimina sus hojas viéndolas en miniatura.', action: () => withFiles('organize', '.pdf,.docx,.png,.jpg,.jpeg', false) },
    { id: 'merge', icon: <Combine className="w-6 h-6" />, title: 'Unir en un solo PDF', text: 'Junta PDF, Word e imágenes en un solo documento y expórtalo.', action: () => withFiles('merge', '.pdf,.docx,.png,.jpg,.jpeg', true) },
    { id: 'editpdf', icon: <FilePenLine className="w-6 h-6" />, title: 'Corregir el texto de un PDF', text: 'Abre un PDF y toca cualquier texto para editarlo con su misma tipografía.', action: () => withFiles('editpdf', '.pdf', false) },
  ];

  return (
    <div data-keep-selection className="fixed inset-0 z-[84] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 print:hidden" onClick={onClose}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const p = pending.current;
          e.target.value = '';
          if (p && files.length) onPick(p.task, files);
        }}
      />
      <div className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto bg-slate-900 sm:rounded-2xl rounded-t-2xl border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <div className="mr-auto">
            <h2 className="text-base font-bold text-white">Tareas rápidas</h2>
            <p className="text-xs text-slate-400">Ve directo a lo que necesitas, sin preparar la hoja.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {cards.map((c) => (
            <button key={c.id} type="button" onClick={c.action} className="text-left rounded-2xl border border-slate-700 p-4 hover:border-blue-600 hover:bg-blue-600/5 transition group">
              <div className="w-11 h-11 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center mb-2 group-hover:bg-blue-600 group-hover:text-white transition">{c.icon}</div>
              <div className="text-sm font-bold text-white">{c.title}</div>
              <div className="text-xs text-slate-400 mt-0.5 leading-snug">{c.text}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
