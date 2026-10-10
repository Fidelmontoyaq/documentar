import { useState } from 'react';
import { Shuffle, X } from 'lucide-react';
import { ARRANGE_LAYOUTS } from '../../engine/imageLayouts';
import type { ArrangeLayoutId } from '../../types/documentEditor';

// Iconos de referencia: rectángulos [x, y, ancho, alto] dentro de un cuadro de 24x24.
const ICONS: Record<ArrangeLayoutId, number[][]> = {
  cols: [[1, 3, 6, 18], [9, 3, 6, 18], [17, 3, 6, 18]],
  rows: [[3, 1, 18, 6], [3, 9, 18, 6], [3, 17, 18, 6]],
  'half-h': [[1, 3, 10, 18], [13, 3, 10, 18]],
  'half-v': [[3, 1, 18, 10], [3, 13, 18, 10]],
  'h-60-40': [[1, 3, 13, 18], [16, 3, 7, 18]],
  'h-70-30': [[1, 3, 16, 18], [19, 3, 4, 18]],
  'v-60-40': [[3, 1, 18, 13], [3, 16, 18, 7]],
  'v-70-30': [[3, 1, 18, 16], [3, 19, 18, 4]],
  grid: [[1, 1, 10, 10], [13, 1, 10, 10], [1, 13, 10, 10], [13, 13, 10, 10]],
  flex: [[1, 2, 14, 9], [17, 2, 6, 9], [1, 13, 6, 9], [9, 13, 14, 9]],
};

const CHIPS = [0, 1, 2, 3, 4, 6];

interface ArrangeMenuProps {
  open: boolean;
  top: number;
  imageCount: number;
  onSelect: (layout: ArrangeLayoutId, perPage: number) => void;
  onClose: () => void;
}

/** Menú para acomodar las imágenes de la hoja activa (y repartirlas en hojas nuevas si hace falta). */
export function ArrangeMenu({ open, top, imageCount, onSelect, onClose }: ArrangeMenuProps) {
  const [current, setCurrent] = useState<number>(-1);
  const [perPage, setPerPage] = useState(0); // 0 = todas en esta hoja
  if (!open) return null;

  const extraPages = perPage > 0 && perPage < imageCount ? Math.ceil(imageCount / perPage) - 1 : 0;

  const apply = (index: number) => {
    setCurrent(index);
    onSelect(ARRANGE_LAYOUTS[index].id, perPage);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed left-[80px] z-50 w-[300px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 print:hidden max-md:left-2 max-md:right-2 max-md:w-auto max-md:!top-auto max-md:bottom-[76px] max-md:max-h-[70dvh] max-md:overflow-y-auto"
        style={{ top: Math.max(8, top) }}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-white">Ordenar imágenes</h3>
            <p className="text-[11px] text-slate-400">{imageCount} imágenes en esta hoja</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-3">
          <label className="block text-[11px] text-slate-400 mb-1">Imágenes por hoja</label>
          <div className="flex items-center gap-1 flex-wrap">
            {CHIPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPerPage(n)}
                className={`px-2.5 py-1 rounded-md text-xs border transition ${
                  perPage === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {n === 0 ? 'Todas' : n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              placeholder="n"
              value={perPage > 0 && !CHIPS.includes(perPage) ? perPage : ''}
              onChange={(e) => setPerPage(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-12 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 py-1 px-1.5 outline-none"
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {extraPages > 0
              ? `Se crearán ${extraPages} hoja${extraPages > 1 ? 's' : ''} nueva${extraPages > 1 ? 's' : ''} para el resto.`
              : 'Todas se quedan en esta hoja.'}
          </p>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {ARRANGE_LAYOUTS.map((l, i) => (
            <button
              key={l.id}
              type="button"
              title={l.label}
              onClick={() => apply(i)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition ${
                current === i ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8">
                {ICONS[l.id].map(([x, y, w, h], k) => (
                  <rect key={k} x={x} y={y} width={w} height={h} rx="1.5" fill="currentColor" opacity="0.85" />
                ))}
              </svg>
              <span className="text-[9px] leading-tight text-center">{l.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => apply((current + 1) % ARRANGE_LAYOUTS.length)}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg transition"
        >
          <Shuffle className="w-3.5 h-3.5" /> Probar siguiente orden
        </button>
        <p className="text-[10px] text-slate-500 mt-2">Quedan dentro de los márgenes, sin deformarse y con su pie de foto. Puedes deshacer con Ctrl+Z.</p>
      </div>
    </>
  );
}
