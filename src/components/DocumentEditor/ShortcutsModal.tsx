import { X, Keyboard } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'General',
    items: [
      [[MOD, 'Z'], 'Deshacer'],
      [[MOD, 'Y'], 'Rehacer (también ' + MOD + '+Shift+Z)'],
      [[MOD, 'S'], 'Descargar o compartir'],
      [[MOD, 'F'], 'Buscar una palabra en todo el documento'],
      [['F5'], 'Presentación a pantalla completa'],
      [['?'], 'Ver estos atajos'],
      [['Esc'], 'Soltar la selección / cerrar'],
    ],
  },
  {
    title: 'Elementos',
    items: [
      [[MOD, 'C'], 'Copiar el elemento seleccionado'],
      [[MOD, 'V'], 'Pegar'],
      [[MOD, 'D'], 'Duplicar el elemento'],
      [['Supr'], 'Borrar el elemento seleccionado'],
      [['← ↑ → ↓'], 'Mover 1 px (con Shift, 10 px)'],
      [['C'], 'Recortar la imagen seleccionada'],
    ],
  },
  {
    title: 'Texto',
    items: [
      [[MOD, 'B'], 'Negrita'],
      [[MOD, 'I'], 'Cursiva'],
      [[MOD, 'U'], 'Subrayado'],
      [[MOD, 'A'], 'Seleccionar todo el texto'],
    ],
  },
  {
    title: 'Vista',
    items: [
      [[MOD, '+'], 'Acercar'],
      [[MOD, '−'], 'Alejar'],
      [[MOD, '0'], 'Ajustar al ancho'],
      [[MOD, 'rueda'], 'Zoom con la rueda del mouse'],
    ],
  },
];

/** Lista de todos los atajos de teclado. */
export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div data-keep-selection className="fixed inset-0 z-[90] bg-slate-950/70 flex items-end sm:items-center justify-center sm:p-4 print:hidden" onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-slate-900 sm:rounded-2xl rounded-t-2xl border border-slate-700 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <span className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center"><Keyboard className="w-4 h-4" /></span>
          <h2 className="text-base font-bold text-white mr-auto">Atajos de teclado</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="flex gap-1 shrink-0">
                      {keys.map((k) => (
                        <kbd key={k} className="min-w-[24px] text-center px-1.5 py-0.5 rounded-md border border-slate-600 bg-slate-800 text-[11px] font-semibold text-slate-100 shadow-[0_1px_0_rgba(0,0,0,.25)]">{k}</kbd>
                      ))}
                    </span>
                    <span className="text-[13px] text-slate-300">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
