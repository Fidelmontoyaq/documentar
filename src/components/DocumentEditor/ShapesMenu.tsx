import { useState } from 'react';
import { X } from 'lucide-react';
import type { ShapeKind } from '../../types/documentEditor';

interface ShapeOption {
  id: string;
  label: string;
  kind: ShapeKind;
  w: number;
  h: number;
  /** Dibujo de referencia (24×24). */
  draw: (filled: boolean) => JSX.Element;
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.8 };
const fillOf = (f: boolean) => (f ? 'currentColor' : 'none');

const OPTIONS: ShapeOption[] = [
  { id: 'square', label: 'Cuadrado', kind: 'rect', w: 170, h: 170, draw: (f) => <rect x="4" y="4" width="16" height="16" fill={fillOf(f)} {...stroke} /> },
  { id: 'rect', label: 'Rectángulo', kind: 'rect', w: 240, h: 140, draw: (f) => <rect x="2.5" y="6" width="19" height="12" fill={fillOf(f)} {...stroke} /> },
  { id: 'rounded', label: 'Redondeado', kind: 'rounded', w: 240, h: 140, draw: (f) => <rect x="2.5" y="6" width="19" height="12" rx="4" fill={fillOf(f)} {...stroke} /> },
  { id: 'circle', label: 'Círculo', kind: 'ellipse', w: 170, h: 170, draw: (f) => <circle cx="12" cy="12" r="8.5" fill={fillOf(f)} {...stroke} /> },
  { id: 'ellipse', label: 'Elipse', kind: 'ellipse', w: 240, h: 140, draw: (f) => <ellipse cx="12" cy="12" rx="9.5" ry="6.5" fill={fillOf(f)} {...stroke} /> },
];

interface ShapesMenuProps {
  open: boolean;
  mode: 'shapes' | 'frames';
  top: number;
  onPickShape: (kind: ShapeKind, size: { w: number; h: number }, filled: boolean) => void;
  onPickFrame: (kind: ShapeKind, size: { w: number; h: number }) => void;
  onClose: () => void;
}

/** Menú para insertar formas (cuadrado, redondo…, con relleno o solo borde) o marcos para imágenes. */
export function ShapesMenu({ open, mode, top, onPickShape, onPickFrame, onClose }: ShapesMenuProps) {
  const [filled, setFilled] = useState(true);
  if (!open) return null;
  const isShapes = mode === 'shapes';

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        data-keep-selection
        className="fixed left-[80px] z-50 w-[300px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 print:hidden max-md:left-2 max-md:right-2 max-md:w-auto max-md:!top-auto max-md:bottom-[76px]"
        style={{ top: Math.max(8, top) }}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-white">{isShapes ? 'Formas' : 'Marcos para imágenes'}</h3>
            <p className="text-[11px] text-slate-400">
              {isShapes ? 'Se agregan a la hoja actual; luego cambia color y bordes en la barra.' : 'Mete una imagen dentro: toca el marco o suelta una imagen encima.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isShapes && (
          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5 mb-3">
            {[
              [true, 'Con relleno'],
              [false, 'Solo borde'],
            ].map(([v, label]) => (
              <button
                key={String(label)}
                type="button"
                onClick={() => setFilled(v as boolean)}
                className={`flex-1 text-xs py-1.5 rounded-md transition ${filled === v ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}
              >
                {label as string}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-5 gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.label}
              onClick={() => {
                if (isShapes) onPickShape(o.kind, { w: o.w, h: o.h }, filled);
                else onPickFrame(o.kind, { w: o.w, h: o.h });
                onClose();
              }}
              className="flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-blue-300 transition"
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7">
                {o.draw(isShapes ? filled : false)}
                {!isShapes && <path d="M8 15l2.5-3 2 2.2L15 11l3 4" stroke="currentColor" strokeWidth="1.2" fill="none" />}
              </svg>
              <span className="text-[9px] leading-none">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
