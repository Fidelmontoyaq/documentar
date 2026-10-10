import { useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  Type,
  FilePlus,
  LayoutGrid,
  FileDown,
  SlidersHorizontal,
  LayoutTemplate,
  Shapes,
  Frame,
  Hash,
} from 'lucide-react';
import { ArrangeMenu } from './ArrangeMenu';
import { ShapesMenu } from './ShapesMenu';
import { SignatureIcon } from './icons';
import type { ArrangeLayoutId, ShapeKind } from '../../types/documentEditor';

interface IconRailProps {
  onImportClick: () => void;
  onAddImages: (files: File[]) => void;
  onAddTextBox: () => void;
  onAddPage: () => void;
  onOpenSignature: () => void;
  onOpenOrganizer: () => void;
  onExportPDF: () => void;
  onToggleFormatPanel: () => void;
  formatPanelOpen: boolean;
  imageCount: number;
  onArrange: (layout: ArrangeLayoutId, perPage: number) => void;
  onInsertShape: (kind: ShapeKind, size: { w: number; h: number }, filled: boolean) => void;
  onInsertFrame: (kind: ShapeKind, size: { w: number; h: number }) => void;
  onOpenFolio: () => void;
  folioActive: boolean;
}

const btn =
  'flex flex-col items-center gap-1 py-3 text-slate-400 hover:text-white hover:bg-slate-800/70 rounded-lg mx-1 transition max-md:shrink-0 max-md:w-[62px] max-md:py-2 max-md:mx-0';

/** Riel de iconos: accesos directos a las acciones más usadas. */
export function IconRail({
  onImportClick,
  onAddImages,
  onAddTextBox,
  onAddPage,
  onOpenSignature,
  onOpenOrganizer,
  onExportPDF,
  onToggleFormatPanel,
  formatPanelOpen,
  imageCount,
  onArrange,
  onInsertShape,
  onInsertFrame,
  onOpenFolio,
  folioActive,
}: IconRailProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const arrangeBtnRef = useRef<HTMLButtonElement>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [arrangeTop, setArrangeTop] = useState(0);
  const [shapesMode, setShapesMode] = useState<'shapes' | 'frames' | null>(null);
  const [shapesTop, setShapesTop] = useState(0);
  const canArrange = imageCount >= 2;

  return (
    <nav className="md:w-[72px] bg-slate-950 md:border-r max-md:border-t border-slate-800 flex md:flex-col max-md:flex-row items-stretch md:py-3 max-md:py-1 max-md:px-1 gap-1 print:hidden shrink-0 md:overflow-y-auto max-md:overflow-x-auto max-md:pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <button type="button" onClick={onImportClick} title="Importar archivos" className={btn}>
        <UploadCloud className="w-5 h-5" />
        <span className="text-[10px] leading-none">Subir</span>
      </button>

      <button type="button" onClick={() => imageInputRef.current?.click()} title="Agregar imágenes a la hoja actual" className={btn}>
        <ImageIcon className="w-5 h-5" />
        <span className="text-[10px] leading-none">Imagen</span>
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAddImages(files);
            e.target.value = '';
          }}
        />
      </button>

      <button
        ref={arrangeBtnRef}
        type="button"
        disabled={!canArrange}
        onClick={() => {
          setArrangeTop(arrangeBtnRef.current?.getBoundingClientRect().top ?? 0);
          setArrangeOpen((v) => !v);
        }}
        title={canArrange ? 'Ordenar las imágenes de esta hoja' : 'Necesitas 2 o más imágenes en la hoja actual'}
        className={`${btn} relative disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 ${
          arrangeOpen ? 'text-blue-400' : ''
        }`}
      >
        <LayoutTemplate className="w-5 h-5" />
        <span className="text-[10px] leading-none">Ordenar</span>
        {canArrange && (
          <span className="absolute top-1.5 right-2 bg-blue-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {imageCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          setShapesTop(e.currentTarget.getBoundingClientRect().top);
          setShapesMode((m) => (m === 'shapes' ? null : 'shapes'));
        }}
        title="Agregar formas"
        className={`${btn} ${shapesMode === 'shapes' ? '!text-blue-400' : ''}`}
      >
        <Shapes className="w-5 h-5" />
        <span className="text-[10px] leading-none">Formas</span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          setShapesTop(e.currentTarget.getBoundingClientRect().top);
          setShapesMode((m) => (m === 'frames' ? null : 'frames'));
        }}
        title="Agregar marcos para imágenes"
        className={`${btn} ${shapesMode === 'frames' ? '!text-blue-400' : ''}`}
      >
        <Frame className="w-5 h-5" />
        <span className="text-[10px] leading-none">Marcos</span>
      </button>

      <button type="button" onClick={onAddTextBox} title="Agregar cuadro de texto" className={btn}>
        <Type className="w-5 h-5" />
        <span className="text-[10px] leading-none">Texto</span>
      </button>

      <button type="button" onClick={onAddPage} title="Página en blanco" className={btn}>
        <FilePlus className="w-5 h-5" />
        <span className="text-[10px] leading-none">Hoja</span>
      </button>

      <button type="button" onClick={onOpenSignature} title="Agregar firma" className={btn}>
        <SignatureIcon className="w-5 h-5" />
        <span className="text-[10px] leading-none">Firma</span>
      </button>

      <button type="button" onClick={onOpenFolio} title="Foliado (numerar páginas)" className={`${btn} ${folioActive ? '!text-blue-400' : ''}`}>
        <Hash className="w-5 h-5" />
        <span className="text-[10px] leading-none">Foliado</span>
      </button>

      <button type="button" onClick={onOpenOrganizer} title="Organizar páginas" className={btn}>
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px] leading-none">Organizar</span>
      </button>

      <div className="my-1 border-t border-slate-800 mx-2 max-md:hidden" />

      <button
        type="button"
        onClick={onExportPDF}
        title="Exportar a PDF"
        className="flex flex-col items-center gap-1 py-3 text-emerald-400 hover:text-white hover:bg-emerald-600/30 rounded-lg mx-1 transition max-md:shrink-0 max-md:w-[62px] max-md:py-2 max-md:mx-0"
      >
        <FileDown className="w-5 h-5" />
        <span className="text-[10px] leading-none">Exportar</span>
      </button>

      <div className="my-1 border-t border-slate-800 mx-2 max-md:hidden" />

      <button
        type="button"
        onClick={onToggleFormatPanel}
        title="Formato del documento (tipografía, márgenes...)"
        className={`${btn} ${formatPanelOpen ? '!text-blue-400' : ''}`}
      >
        <SlidersHorizontal className="w-5 h-5" />
        <span className="text-[10px] leading-none">Formato</span>
      </button>

      <ShapesMenu
        open={shapesMode !== null}
        mode={shapesMode ?? 'shapes'}
        top={shapesTop}
        onPickShape={onInsertShape}
        onPickFrame={onInsertFrame}
        onClose={() => setShapesMode(null)}
      />

      <ArrangeMenu
        open={arrangeOpen && canArrange}
        top={arrangeTop}
        imageCount={imageCount}
        onSelect={onArrange}
        onClose={() => setArrangeOpen(false)}
      />
    </nav>
  );
}
