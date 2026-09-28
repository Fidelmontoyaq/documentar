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
} from 'lucide-react';
import { ArrangeMenu } from './ArrangeMenu';
import type { ArrangeLayoutId } from '../../types/documentEditor';

interface IconRailProps {
  onImportClick: () => void;
  onAddImages: (files: File[]) => void;
  onAddTextBox: () => void;
  onAddPage: () => void;
  onOpenOrganizer: () => void;
  onExportPDF: () => void;
  onToggleFormatPanel: () => void;
  formatPanelOpen: boolean;
  imageCount: number;
  onArrange: (layout: ArrangeLayoutId, perPage: number) => void;
}

const btn =
  'flex flex-col items-center gap-1 py-3 text-slate-400 hover:text-white hover:bg-slate-800/70 rounded-lg mx-1 transition';

/** Riel de iconos: accesos directos a las acciones más usadas. */
export function IconRail({
  onImportClick,
  onAddImages,
  onAddTextBox,
  onAddPage,
  onOpenOrganizer,
  onExportPDF,
  onToggleFormatPanel,
  formatPanelOpen,
  imageCount,
  onArrange,
}: IconRailProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const arrangeBtnRef = useRef<HTMLButtonElement>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [arrangeTop, setArrangeTop] = useState(0);
  const canArrange = imageCount >= 2;

  return (
    <nav className="w-[72px] bg-slate-950 border-r border-slate-800 flex flex-col items-stretch py-3 gap-1 print:hidden shrink-0 overflow-y-auto">
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

      <button type="button" onClick={onAddTextBox} title="Agregar cuadro de texto" className={btn}>
        <Type className="w-5 h-5" />
        <span className="text-[10px] leading-none">Texto</span>
      </button>

      <button type="button" onClick={onAddPage} title="Página en blanco" className={btn}>
        <FilePlus className="w-5 h-5" />
        <span className="text-[10px] leading-none">Hoja</span>
      </button>

      <button type="button" onClick={onOpenOrganizer} title="Organizar páginas" className={btn}>
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px] leading-none">Organizar</span>
      </button>

      <div className="my-1 border-t border-slate-800 mx-2" />

      <button
        type="button"
        onClick={onExportPDF}
        title="Exportar a PDF"
        className="flex flex-col items-center gap-1 py-3 text-emerald-400 hover:text-white hover:bg-emerald-600/30 rounded-lg mx-1 transition"
      >
        <FileDown className="w-5 h-5" />
        <span className="text-[10px] leading-none">Exportar</span>
      </button>

      <div className="my-1 border-t border-slate-800 mx-2" />

      <button
        type="button"
        onClick={onToggleFormatPanel}
        title="Formato del documento (tipografía, márgenes...)"
        className={`${btn} ${formatPanelOpen ? '!text-blue-400' : ''}`}
      >
        <SlidersHorizontal className="w-5 h-5" />
        <span className="text-[10px] leading-none">Formato</span>
      </button>

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
