import type { RefObject } from 'react';
import {
  X, UploadCloud, FileImage, SlidersHorizontal, Hash,
} from 'lucide-react';
import { FontPicker } from './FontPicker';
import type { ImagesPerPageMode, MarginSelectValue } from '../../types/documentEditor';

export type PanelMode = 'import' | 'format';

interface SidePanelProps {
  open: boolean;
  mode: PanelMode;
  onClose: () => void;
  multiFileInputRef: RefObject<HTMLInputElement>;
  onFilesSelected: (files: File[]) => void;
  imageMode: ImagesPerPageMode;
  onImageModeChange: (mode: ImagesPerPageMode) => void;
  fontValue: string;
  recentFonts: string[];
  onFontChange: (value: string) => void;
  marginValue: MarginSelectValue;
  onMarginChange: (value: MarginSelectValue) => void;
  customMarginCm: number;
  onCustomMarginCmChange: (cm: number) => void;
  onApplyCustomMargin: () => void;
  onInsertPageNumber: () => void;
}

export function SidePanel({
  open,
  mode,
  onClose,
  multiFileInputRef,
  onFilesSelected,
  imageMode,
  onImageModeChange,
  fontValue,
  recentFonts,
  onFontChange,
  marginValue,
  onMarginChange,
  customMarginCm,
  onCustomMarginCmChange,
  onApplyCustomMargin,
  onInsertPageNumber,
}: SidePanelProps) {

  return (
    <aside
      className={`w-80 max-md:fixed max-md:inset-0 max-md:z-[60] max-md:w-full bg-slate-900 border-r border-slate-800 print:hidden shrink-0 overflow-y-auto ${
        open ? 'flex flex-col' : 'hidden'
      }`}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-bold text-white">{mode === 'import' ? 'Importar archivos' : 'Formato del documento'}</h2>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar panel"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* 1. ZONA DE CARGA UNIFICADA */}
        {mode === 'import' && (
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <UploadCloud className="w-3.5 h-3.5 text-blue-400" /> Importar Archivos Multi-formato
          </h2>
          <label
            htmlFor="multiFileInput"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length) onFilesSelected(files);
            }}
            className="border-2 border-dashed border-slate-600 hover:border-blue-500 bg-slate-900/50 hover:bg-slate-800/80 transition-all rounded-lg p-4 text-center cursor-pointer block group"
          >
            <FileImage className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mb-2 mx-auto transition" />
            <span className="block text-xs font-medium text-slate-300">Haz clic o arrastra aquí tus archivos</span>
            <span className="block text-[10px] text-slate-500 mt-1">
              Soporta múltiples PDF, Word (.docx), JPG y PNG a la vez
            </span>
            <input
              ref={multiFileInputRef}
              id="multiFileInput"
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                onFilesSelected(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </label>

          <div className="mt-3">
            <label className="block text-xs text-slate-400 mb-1">Imágenes por página (carga masiva)</label>
            <select
              value={imageMode}
              onChange={(e) => onImageModeChange(e.target.value as ImagesPerPageMode)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 p-2.5 focus:border-blue-500 outline-none"
            >
              <option value="1">1 imagen por hoja nueva (cada archivo en su hoja)</option>
              <option value="current">Todas en la hoja donde estoy (acomodadas)</option>
              <option value="2">2 imágenes por página nueva (anverso/reverso, etc.)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              Cada imagen llega lista para mover, redimensionar y con su pie de foto. Con 2 o más en una hoja usa el botón Ordenar.
            </p>
          </div>
        </div>

        )}

        {mode === 'format' && (<>
        {/* 4. CONFIGURACIÓN DE FORMATO Y FUENTES */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Formato de Documento
          </h2>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipografía Principal</label>
            <FontPicker value={fontValue} recentFonts={recentFonts} onChange={onFontChange} />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Márgenes de las Páginas</label>
            <select
              value={marginValue}
              onChange={(e) => onMarginChange(e.target.value as MarginSelectValue)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 p-2.5 focus:border-blue-500 outline-none"
            >
              <option value="p-[25mm_20mm]">Normal (2.5 cm)</option>
              <option value="p-[12mm_10mm]">Estrecho / Compacto (1.2 cm)</option>
              <option value="p-[35mm_30mm]">Ancho (3.5 cm)</option>
              <option value="p-[5mm]">Mínimo / Sin Margen (0.5 cm)</option>
              <option value="custom">Personalizado… (2 cm por defecto)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              Solo afecta imágenes, texto y hojas nuevas. Las hojas importadas desde un PDF conservan su propio
              margen (o ninguno) y no cambian.
            </p>
            {marginValue === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={customMarginCm}
                  onChange={(e) => onCustomMarginCmChange(parseFloat(e.target.value))}
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 p-2 focus:border-blue-500 outline-none"
                />
                <span className="text-xs text-slate-400">cm en todos los lados</span>
                <button
                  type="button"
                  onClick={onApplyCustomMargin}
                  className="ml-auto bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg transition"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Insertar número de página (el estilo de texto, alineación y color están en la barra de arriba) */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-2">
          <button
            type="button"
            onClick={onInsertPageNumber}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Hash className="w-3.5 h-3.5 text-amber-400" /> Insertar número de página en el texto
          </button>
          <p className="text-[10px] text-slate-500">
            Negrita, cursiva, alineación, listas y color están en la barra de arriba: selecciona un texto y aparecen.
            Para numerar todas las hojas usa «Foliado».
          </p>
        </div>

        </>)}
      </div>
    </aside>
  );
}
