import type { RefObject } from 'react';
import {
  X,
  UploadCloud,
  FileImage,
  Image as ImageIcon,
  Type,
  Plus,
  SlidersHorizontal,
  PenSquare,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Hash,
  Layers,
  LayoutGrid,
  Rows,
} from 'lucide-react';
import { groupedFontOptions } from '../../engine/fontCatalog';
import type { ImagesPerPageMode, MarginSelectValue } from '../../types/documentEditor';

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  multiFileInputRef: RefObject<HTMLInputElement>;
  onFilesSelected: (files: File[]) => void;
  imageMode: ImagesPerPageMode;
  onImageModeChange: (mode: ImagesPerPageMode) => void;
  onAddImages: (files: File[]) => void;
  onAddTextBox: () => void;
  onAddPage: () => void;
  fontValue: string;
  recentFonts: string[];
  onFontChange: (value: string) => void;
  marginValue: MarginSelectValue;
  onMarginChange: (value: MarginSelectValue) => void;
  customMarginCm: number;
  onCustomMarginCmChange: (cm: number) => void;
  onApplyCustomMargin: () => void;
  onFormatText: (command: string, value?: string | null) => void;
  onSaveSelection: () => void;
  onInsertPageNumber: () => void;
  pageCount: number;
  onOpenOrganizer: () => void;
  onOpenCaptionGapAll: () => void;
}

export function SidePanel({
  open,
  onClose,
  multiFileInputRef,
  onFilesSelected,
  imageMode,
  onImageModeChange,
  onAddImages,
  onAddTextBox,
  onAddPage,
  fontValue,
  recentFonts,
  onFontChange,
  marginValue,
  onMarginChange,
  customMarginCm,
  onCustomMarginCmChange,
  onApplyCustomMargin,
  onFormatText,
  onSaveSelection,
  onInsertPageNumber,
  pageCount,
  onOpenOrganizer,
  onOpenCaptionGapAll,
}: SidePanelProps) {
  const { recent, rest } = groupedFontOptions(recentFonts);

  return (
    <aside
      className={`w-80 bg-slate-900 border-r border-slate-800 print:hidden shrink-0 overflow-y-auto ${
        open ? 'flex flex-col' : 'hidden'
      }`}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-bold text-white">Formato del documento</h2>
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

        {/* 2. ELEMENTOS SOBRE LA HOJA ACTUAL */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-pink-400" /> Elementos en la Hoja Actual
          </h2>
          <p className="text-[11px] text-slate-400">
            Se agregan sobre la última hoja que hayas tocado. Haz clic sobre un elemento para ver sus controles.
          </p>
          <label className="w-full cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition">
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" /> Agregar Imagen
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAddImages(files);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={onAddTextBox}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Type className="w-3.5 h-3.5 text-emerald-400" /> Agregar Cuadro de Texto
          </button>
        </div>

        {/* 3. AGREGAR PÁGINA EN BLANCO */}
        <div>
          <button
            type="button"
            onClick={onAddPage}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-sm"
          >
            <Plus className="w-4 h-4 text-blue-400" /> Agregar Página en Blanco
          </button>
        </div>

        {/* 4. CONFIGURACIÓN DE FORMATO Y FUENTES */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> Formato de Documento
          </h2>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipografía Principal</label>
            <select
              value={fontValue}
              onChange={(e) => onFontChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 p-2.5 focus:border-blue-500 outline-none"
            >
              {recent.length > 0 && (
                <optgroup label="Usadas recientemente">
                  {recent.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={recent.length > 0 ? 'Todas las demás' : 'Todas las fuentes'}>
                {rest.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
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

        {/* 5. BARRA DE HERRAMIENTAS DE EDICIÓN DE TEXTO (WYSIWYG) */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <PenSquare className="w-3.5 h-3.5 text-purple-400" /> Estilo de Texto
          </h2>
          <div className="grid grid-cols-4 gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-700/80">
            <button type="button" onClick={() => onFormatText('bold')} title="Negrita" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('italic')} title="Cursiva" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('underline')} title="Subrayado" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <Underline className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('strikeThrough')} title="Tachado" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <Strikethrough className="w-4 h-4" />
            </button>

            <button type="button" onClick={() => onFormatText('justifyLeft')} title="Alinear a Izquierda" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <AlignLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('justifyCenter')} title="Centrar" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <AlignCenter className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('justifyRight')} title="Alinear a Derecha" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <AlignRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('justifyFull')} title="Justificar" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <AlignJustify className="w-4 h-4" />
            </button>

            <button type="button" onClick={() => onFormatText('insertUnorderedList')} title="Lista Viñetas" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <List className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('insertOrderedList')} title="Lista Numerada" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white flex items-center justify-center">
              <ListOrdered className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onFormatText('formatBlock', '<h1>')} title="Título Grande (H1)" className="p-2 hover:bg-slate-800 rounded text-xs font-bold text-slate-300 hover:text-white">
              H1
            </button>
            <button type="button" onClick={() => onFormatText('formatBlock', '<h2>')} title="Título Mediano (H2)" className="p-2 hover:bg-slate-800 rounded text-xs font-bold text-slate-300 hover:text-white">
              H2
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-slate-400">Color de texto:</span>
            <input
              type="color"
              onMouseDown={onSaveSelection}
              onChange={(e) => onFormatText('foreColor', e.target.value)}
              className="w-8 h-8 rounded bg-transparent cursor-pointer border border-slate-700"
            />
          </div>
          <button
            type="button"
            onClick={onInsertPageNumber}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Hash className="w-3.5 h-3.5 text-amber-400" /> Insertar número de página
          </button>
          <button
            type="button"
            onClick={onOpenCaptionGapAll}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <Rows className="w-3.5 h-3.5 text-blue-400" /> Separación imagen–pie de foto (todas)
          </button>
        </div>

        {/* 6. GESTOR DE PÁGINAS */}
        <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> Estructura de Páginas
            </h2>
            <span className="bg-blue-600/30 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {pageCount} Pág{pageCount > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Arrastra cualquier hoja en el área de trabajo para moverla de una en una, o usa la vista de miniaturas
            para reordenar varias a la vez.
          </p>
          <button
            type="button"
            onClick={onOpenOrganizer}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-400" /> Organizar Páginas (vista de miniaturas)
          </button>
        </div>
      </div>
    </aside>
  );
}
