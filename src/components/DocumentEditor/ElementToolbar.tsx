import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, Palette, Copy, ClipboardPaste,
  ArrowUpWideNarrow, ArrowDownWideNarrow, Trash2,
  Undo2, Redo2, PaintBucket, Ban, RotateCcw, CopyPlus, Layers, Crop,
} from 'lucide-react';
import { groupedFontOptions } from '../../engine/fontCatalog';
import type { ToolbarState } from '../../types/documentEditor';

const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '64', '96'];

interface ElementToolbarProps {
  state: ToolbarState | null;
  history: { canUndo: boolean; canRedo: boolean };
  recentFonts: string[];
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFormat: (command: string, value?: string | null) => void;
  onApplyFont: (value: string) => void;
  onApplyFontSize: (value: string) => void;
  onSaveSelection: () => void;
  onDuplicate: () => void;
  onLayer: (direction: 'front' | 'back') => void;
  onDelete: () => void;
  onSetFill: (color: string | null) => void;
  onCaptionGap: (px: number) => void;
  onCaptionReset: () => void;
  onCaptionGapAll: () => void;
  onToggleCrop: () => void;
  onResetCrop: () => void;
}

/**
 * Barra superior fija (no flota sobre el contenido): siempre muestra
 * deshacer/rehacer y copiar/pegar; las opciones de formato aparecen solo
 * al hacer clic en un texto o cuadro de texto, y las de imagen (separación
 * del pie de foto, etc.) al seleccionar una imagen.
 */
export function ElementToolbar({
  state, history, recentFonts,
  onUndo, onRedo, onCopy, onPaste,
  onFormat, onApplyFont, onApplyFontSize, onSaveSelection,
  onDuplicate, onLayer, onDelete, onSetFill, onCaptionGap, onCaptionReset, onCaptionGapAll,
  onToggleCrop, onResetCrop,
}: ElementToolbarProps) {
  const { recent, rest } = groupedFontOptions(recentFonts);
  const isBox = state?.isBox ?? false;
  const isImage = state?.boxType === 'image';
  const isTextual = !!state && !isImage; // texto de la hoja, cuadro de texto o pie de foto
  const keep = (e: React.MouseEvent) => e.preventDefault(); // no pierde la selección del texto
  const b = (title: string, onClick: () => void, icon: React.ReactNode, disabled = false, extra = '') => (
    <button type="button" className={`et-btn ${extra}`} title={title} onMouseDown={keep} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );

  return (
    <div
      data-element-toolbar
      className="element-toolbar print:hidden shrink-0 bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center gap-1 flex-wrap min-h-[52px]"
    >
      {b('Deshacer (Ctrl+Z)', onUndo, <Undo2 className="w-4 h-4" />, !history.canUndo)}
      {b('Rehacer (Ctrl+Y)', onRedo, <Redo2 className="w-4 h-4" />, !history.canRedo)}
      <div className="et-sep" />
      {b('Copiar (Ctrl+C)', onCopy, <Copy className="w-4 h-4" />)}
      {b('Pegar (Ctrl+V)', onPaste, <ClipboardPaste className="w-4 h-4" />)}
      <div className="et-sep" />

      {!state && (
        <span className="text-xs text-slate-500 px-2">
          Haz clic en un texto, cuadro de texto o imagen para ver sus opciones
        </span>
      )}

      {isTextual && (
        <>
          <select
            value={state?.fontFamily ?? ''}
            onChange={(e) => onApplyFont(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1.5 px-1.5 outline-none max-w-[150px]"
          >
            {recent.length > 0 && (
              <optgroup label="Usadas recientemente">
                {recent.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={recent.length > 0 ? 'Todas las demás' : 'Todas las fuentes'}>
              {rest.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
              ))}
            </optgroup>
          </select>
          <select
            value={state?.fontSize ?? '16'}
            onChange={(e) => onApplyFontSize(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1.5 px-1 outline-none w-14"
          >
            {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <div className="et-sep" />
          {b('Negrita', () => onFormat('bold'), <Bold className="w-4 h-4" />)}
          {b('Cursiva', () => onFormat('italic'), <Italic className="w-4 h-4" />)}
          {b('Subrayado', () => onFormat('underline'), <Underline className="w-4 h-4" />)}
          {b('Tachado', () => onFormat('strikeThrough'), <Strikethrough className="w-4 h-4" />)}
          <div className="et-sep" />
          {b('Alinear izquierda', () => onFormat('justifyLeft'), <AlignLeft className="w-4 h-4" />)}
          {b('Centrar', () => onFormat('justifyCenter'), <AlignCenter className="w-4 h-4" />)}
          {b('Alinear derecha', () => onFormat('justifyRight'), <AlignRight className="w-4 h-4" />)}
          {b('Justificar', () => onFormat('justifyFull'), <AlignJustify className="w-4 h-4" />)}
          {b('Lista de viñetas', () => onFormat('insertUnorderedList'), <List className="w-4 h-4" />)}
          <label className="et-btn cursor-pointer" title="Color de texto" onMouseDown={onSaveSelection}>
            <Palette className="w-4 h-4" />
            <input type="color" className="hidden" onChange={(e) => onFormat('foreColor', e.target.value)} />
          </label>
        </>
      )}

      {state?.isBox && state.boxType !== 'image' && (
        <>
          <div className="et-sep" />
          <label className="et-btn cursor-pointer gap-1" title="Pintar la casilla de texto">
            <PaintBucket className="w-4 h-4" style={{ color: state.fill || undefined }} />
            <span>Relleno</span>
            <input
              type="color"
              className="hidden"
              value={state.fill || '#ffffff'}
              onChange={(e) => onSetFill(e.target.value)}
            />
          </label>
          {b('Sin relleno', () => onSetFill(null), <Ban className="w-4 h-4" />, !state.fill)}
        </>
      )}

      {state && state.captionGap !== null && (
        <>
          <div className="et-sep" />
          <span className="text-[11px] text-slate-400 px-1">Separación del pie</span>
          <input
            type="range"
            min={-60}
            max={150}
            value={state.captionGap}
            onChange={(e) => onCaptionGap(Number(e.target.value))}
            className="zoom-range !w-24"
          />
          <input
            type="number"
            value={state.captionGap}
            onChange={(e) => onCaptionGap(Number(e.target.value) || 0)}
            className="w-14 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1 px-1.5 outline-none"
          />
          <span className="text-[11px] text-slate-500">px</span>
          {b('Reajustar pie (centrado bajo la imagen)', onCaptionReset, <RotateCcw className="w-4 h-4" />)}
          <button type="button" className="et-btn" title="Aplicar esta separación a todos los pies de foto" onMouseDown={keep} onClick={onCaptionGapAll}>
            <Layers className="w-4 h-4" /> <span>Aplicar a todos</span>
          </button>
        </>
      )}

      {isImage && (
        <>
          <div className="et-sep" />
          <button
            type="button"
            className={`et-btn gap-1 ${state?.cropping ? '!bg-amber-500 !text-slate-900' : ''}`}
            title="Recortar (tecla C). La imagen no se borra, solo se oculta la parte recortada."
            onMouseDown={keep}
            onClick={onToggleCrop}
          >
            <Crop className="w-4 h-4" />
            <span>{state?.cropping ? 'Listo' : 'Recortar'}</span>
          </button>
          {state?.cropping && (
            <span className="text-[11px] text-amber-300 px-1 hidden sm:inline">
              Arrastra la imagen para moverla, rueda del mouse para acercar, Esc para terminar
            </span>
          )}
          {state?.hasCrop && !state.cropping && (
            b('Quitar recorte', onResetCrop, <RotateCcw className="w-4 h-4" />)
          )}
        </>
      )}

      {isBox && (
        <>
          <div className="et-sep" />
          {b('Duplicar', onDuplicate, <CopyPlus className="w-4 h-4" />)}
          {b('Traer al frente', () => onLayer('front'), <ArrowUpWideNarrow className="w-4 h-4" />)}
          {b('Enviar atrás', () => onLayer('back'), <ArrowDownWideNarrow className="w-4 h-4" />)}
          {b('Eliminar (Supr)', onDelete, <Trash2 className="w-4 h-4" />, false, 'hover:!bg-rose-600')}
        </>
      )}
    </div>
  );
}
