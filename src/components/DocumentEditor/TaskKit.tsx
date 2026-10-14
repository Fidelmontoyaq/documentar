import type { ReactNode } from 'react';
import { X, Home, PenLine, Hash, LayoutGrid, FilePenLine, CheckCircle2 } from 'lucide-react';

export type AfterAction = 'edit' | 'sign' | 'folio' | 'organize' | 'home';

/** Marco común de las tareas directas (unir, dividir, quitar fondo…). */
export function TaskShell({ title, icon, onClose, children, footer, z = 86 }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; z?: number }) {
  return (
    <div data-keep-selection style={{ zIndex: z }} className="fixed inset-0 bg-slate-950/70 flex items-end sm:items-center justify-center sm:p-4 print:hidden" onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[94dvh] flex flex-col bg-slate-900 sm:rounded-2xl rounded-t-2xl border border-slate-700 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <span className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center">{icon}</span>
          <h2 className="text-base font-bold text-white mr-auto">{title}</h2>
          <button type="button" onClick={onClose} title="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="p-3 border-t border-slate-800 flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/** Después de guardar: seguir editando o hacer otra tarea con el resultado. */
export function NextSteps({ files, onAfter, imagesOnly }: { files: File[]; onAfter: (a: AfterAction, files: File[]) => void; imagesOnly?: boolean }) {
  const items: { id: AfterAction; label: string; icon: ReactNode }[] = [
    { id: 'edit', label: 'Seguir editando', icon: <FilePenLine className="w-4 h-4" /> },
    ...(imagesOnly ? [] : [
      { id: 'sign' as const, label: 'Firmar', icon: <PenLine className="w-4 h-4" /> },
      { id: 'folio' as const, label: 'Foliar', icon: <Hash className="w-4 h-4" /> },
      { id: 'organize' as const, label: 'Ordenar hojas', icon: <LayoutGrid className="w-4 h-4" /> },
    ]),
    { id: 'home', label: 'Otra tarea', icon: <Home className="w-4 h-4" /> },
  ];
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-white mb-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Listo, tu archivo se descargó. ¿Qué sigue?</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => onAfter(i.id, files)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-blue-500 hover:text-white transition">
            {i.icon}{i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
