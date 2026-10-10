import type { RefObject } from 'react';
import { Minus, Plus } from 'lucide-react';

interface EditorCanvasProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  pagesWrapperRef: RefObject<HTMLDivElement>;
  zoom: number;
  onZoomChange: (percent: number) => void;
  onFit?: () => void;
}

/**
 * Área de edición de hojas A4 + control de zoom.
 *
 * `pagesWrapper` se renderiza SIN hijos: las hojas las crea el motor, y así
 * React nunca reconcilia ese subárbol. Va dentro de un "shell" cuyo tamaño
 * el motor ajusta al zoom para que el scroll siga siendo correcto.
 */
export function EditorCanvas({ scrollContainerRef, pagesWrapperRef, zoom, onZoomChange, onFit }: EditorCanvasProps) {
  const clamp = (v: number) => Math.min(300, Math.max(25, Math.round(v)));

  return (
    <div className="relative flex-1 min-h-0 flex">
      <main ref={scrollContainerRef} id="editorContainer" className="flex-1 bg-slate-950 p-2 md:p-8 pb-24 md:pb-20 overflow-auto">
        <div className="mx-auto">
          <div ref={pagesWrapperRef} id="pagesWrapper" className="w-[210mm] space-y-8" />
        </div>
      </main>

      <div
        data-keep-selection
        className="absolute bottom-3 right-3 md:bottom-4 md:right-6 flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-full pl-2 pr-3 py-1.5 shadow-xl print:hidden"
      >
        <button type="button" title="Alejar" onClick={() => onZoomChange(clamp(zoom - 10))} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-700">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={25}
          max={300}
          step={5}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="zoom-range max-md:!w-24"
          title="Zoom"
        />
        <button type="button" title="Acercar" onClick={() => onZoomChange(clamp(zoom + 10))} className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-700">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center text-xs text-slate-200">
          <input
            type="number"
            min={25}
            max={300}
            value={zoom}
            onChange={(e) => onZoomChange(clamp(Number(e.target.value) || 100))}
            className="w-12 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-right outline-none"
          />
          <span className="ml-0.5">%</span>
        </div>
        <button type="button" title="Restablecer al 100%" onClick={() => onZoomChange(100)} className="text-[10px] text-slate-400 hover:text-white">
          100%
        </button>
        {onFit && (
          <button type="button" title="Ajustar al ancho de la pantalla" onClick={onFit} className="text-[10px] text-slate-400 hover:text-white">
            Ajustar
          </button>
        )}
      </div>
    </div>
  );
}
