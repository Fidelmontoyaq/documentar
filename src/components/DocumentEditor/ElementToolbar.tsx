import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, Palette, Copy, ClipboardPaste,
  ArrowUpWideNarrow, ArrowDownWideNarrow, Trash2,
  Undo2, Redo2, PaintBucket, Ban, RotateCcw, CopyPlus, Layers, Crop,
  PanelTop, PanelRight, PanelBottom, PanelLeft, Square, ZoomIn, ZoomOut, ImagePlus, Maximize, Minimize, ImageOff, Ruler, Sticker,
} from 'lucide-react';
import { groupedFontOptions } from '../../engine/fontCatalog';
import { useState } from 'react';
import { sizeLabel } from '../../engine/pageSizes';
import type { PageInfo, ToolbarState } from '../../types/documentEditor';

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
  onCropZoom: (direction: 1 | -1) => void;
  onRadius: (pct: number) => void;
  onShapeProps: (patch: Partial<{ fillOn: boolean; fill: string; fillOpacity: number; borderColor: string; borderWidth: number }>) => void;
  onToggleSide: (index: number) => void;
  onAllSides: (on: boolean) => void;
  onPickFrameImage: () => void;
  onClearFrameImage: () => void;
  onFrameFit: (mode: 'cover' | 'contain') => void;
  pageInfo: PageInfo | null;
  onOpenCanvas: () => void;
  onSticker: (opts: { width: number; color: string; shadow: boolean } | null) => void;
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
  onToggleCrop, onResetCrop, onCropZoom, onRadius, onShapeProps, onToggleSide, onAllSides,
  onPickFrameImage, onClearFrameImage, onFrameFit, pageInfo, onOpenCanvas, onSticker,
}: ElementToolbarProps) {
  const [stickerOpen, setStickerOpen] = useState(false);
  const [stW, setStW] = useState(8);
  const [stColor, setStColor] = useState('#ffffff');
  const [stShadow, setStShadow] = useState(true);
  const { recent, rest } = groupedFontOptions(recentFonts);
  const isBox = state?.isBox ?? false;
  const isImage = state?.boxType === 'image';
  const isShapeLike = state?.boxType === 'shape' || state?.boxType === 'frame';
  const isFrame = state?.boxType === 'frame';
  const sh = state?.shape ?? null;
  const isTextual = !!state && !isImage && !isShapeLike; // texto de la hoja, cuadro de texto o pie de foto
  const keep = (e: React.MouseEvent) => e.preventDefault(); // no pierde la selección del texto
  const b = (title: string, onClick: () => void, icon: React.ReactNode, disabled = false, extra = '') => (
    <button type="button" className={`et-btn ${extra}`} title={title} onMouseDown={keep} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );

  return (
    <div
      data-element-toolbar
      className="element-toolbar print:hidden shrink-0 bg-slate-900 border-b border-slate-800 px-2 md:px-3 py-2 flex items-center gap-1 md:flex-wrap overflow-x-auto md:overflow-visible min-h-[52px] [&>*]:shrink-0"
    >
      <button
        type="button"
        className="et-btn gap-1.5 !bg-slate-800 border border-slate-700 !text-slate-100"
        title="Tamaño y fondo de la hoja (lienzo)"
        onMouseDown={keep}
        onClick={onOpenCanvas}
      >
        <Ruler className="w-4 h-4 text-blue-400" />
        <span className="whitespace-nowrap">{pageInfo ? sizeLabel(pageInfo.w, pageInfo.h) : 'Tamaño'}</span>
      </button>
      <div className="et-sep" />
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

      {state?.isBox && (state.boxType === 'text' || state.boxType === 'caption') && (
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
            <>
              {b('Acercar imagen', () => onCropZoom(1), <ZoomIn className="w-4 h-4" />)}
              {b('Alejar imagen', () => onCropZoom(-1), <ZoomOut className="w-4 h-4" />)}
              <span className="text-[11px] text-amber-300 px-1 hidden lg:inline">
                Arrastra la imagen para moverla; los bordes de la caja recortan; Esc para terminar
              </span>
            </>
          )}
          {state?.hasCrop && !state.cropping && (
            b('Quitar recorte', onResetCrop, <RotateCcw className="w-4 h-4" />)
          )}
          <div className="et-sep" />
          <span className="text-[11px] text-slate-400 px-1">Esquinas</span>
          <input
            type="range"
            min={0}
            max={50}
            value={state?.imageRadiusPct ?? 0}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="zoom-range !w-20"
            title="Redondear las esquinas de la imagen"
          />
          <span className="text-[11px] text-slate-500 w-8">{Math.round(state?.imageRadiusPct ?? 0)}%</span>
          <button
            type="button"
            className={`et-btn gap-1 ${stickerOpen ? '!bg-slate-700 !text-white' : ''}`}
            title="Borde de sticker: contorno alrededor de la figura"
            onMouseDown={keep}
            onClick={() => setStickerOpen((v) => !v)}
          >
            <Sticker className="w-4 h-4" /> <span>Sticker</span>
          </button>
        </>
      )}

      {isShapeLike && sh && (
        <>
          <div className="et-sep" />
          {isFrame && (
            <>
              <button type="button" className="et-btn gap-1" title="Elegir la imagen del marco" onMouseDown={keep} onClick={onPickFrameImage}>
                <ImagePlus className="w-4 h-4" /> <span>{sh.frameFilled ? 'Cambiar' : 'Imagen'}</span>
              </button>
              {sh.frameFilled && (
                <>
                  <button
                    type="button"
                    className={`et-btn gap-1 ${state?.cropping ? '!bg-amber-500 !text-slate-900' : ''}`}
                    title="Mover y acercar la imagen dentro del marco (tecla C)"
                    onMouseDown={keep}
                    onClick={onToggleCrop}
                  >
                    <Crop className="w-4 h-4" /> <span>{state?.cropping ? 'Listo' : 'Ajustar'}</span>
                  </button>
                  {state?.cropping && (
                    <>
                      {b('Acercar', () => onCropZoom(1), <ZoomIn className="w-4 h-4" />)}
                      {b('Alejar', () => onCropZoom(-1), <ZoomOut className="w-4 h-4" />)}
                    </>
                  )}
                  {b('Llenar el marco', () => onFrameFit('cover'), <Maximize className="w-4 h-4" />)}
                  {b('Mostrar entera', () => onFrameFit('contain'), <Minimize className="w-4 h-4" />)}
                  {b('Quitar imagen', onClearFrameImage, <ImageOff className="w-4 h-4" />)}
                </>
              )}
              <div className="et-sep" />
            </>
          )}
          <button
            type="button"
            className={`et-btn gap-1 ${sh.fillOn ? '!bg-slate-700 !text-white' : ''}`}
            title={sh.fillOn ? 'Con relleno (clic para dejar solo el borde)' : 'Solo borde (clic para rellenar)'}
            onMouseDown={keep}
            onClick={() => onShapeProps({ fillOn: !sh.fillOn })}
          >
            <PaintBucket className="w-4 h-4" /> <span>{sh.fillOn ? 'Relleno' : 'Sin relleno'}</span>
          </button>
          <label className="et-btn cursor-pointer" title="Color de relleno">
            <span className="w-4 h-4 rounded border border-slate-500" style={{ background: sh.fill }} />
            <input type="color" className="hidden" value={sh.fill} onChange={(e) => onShapeProps({ fill: e.target.value, fillOn: true })} />
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sh.fillOpacity * 100)}
            onChange={(e) => onShapeProps({ fillOpacity: Number(e.target.value) / 100, fillOn: true })}
            className="zoom-range !w-16"
            title="Opacidad del relleno"
          />
          <div className="et-sep" />
          <span className="text-[11px] text-slate-400 px-1">Borde</span>
          <label className="et-btn cursor-pointer" title="Color del borde">
            <span className="w-4 h-4 rounded border-2" style={{ borderColor: sh.borderColor }} />
            <input type="color" className="hidden" value={sh.borderColor} onChange={(e) => onShapeProps({ borderColor: e.target.value })} />
          </label>
          <input
            type="number"
            min={0}
            max={60}
            value={sh.borderWidth}
            onChange={(e) => onShapeProps({ borderWidth: Number(e.target.value) || 0 })}
            className="w-12 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1 px-1.5 outline-none"
            title="Grosor del borde (px)"
          />
          <button
            type="button"
            className={`et-btn ${sh.sides.every(Boolean) ? '!bg-slate-700 !text-white' : ''}`}
            title="Borde en todos los lados"
            onMouseDown={keep}
            onClick={() => onAllSides(true)}
          >
            <Square className="w-4 h-4" />
          </button>
          {(
            [
              ['Borde de arriba', PanelTop],
              ['Borde derecho', PanelRight],
              ['Borde de abajo', PanelBottom],
              ['Borde izquierdo', PanelLeft],
            ] as const
          ).map(([label, Icon], i) => (
            <button
              key={label}
              type="button"
              className={`et-btn ${sh.sides[i] ? '!bg-blue-600 !text-white' : ''}`}
              title={`${label} (clic para activar o quitar)`}
              onMouseDown={keep}
              onClick={() => onToggleSide(i)}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          {b('Sin bordes', () => onAllSides(false), <Ban className="w-4 h-4" />)}
          {sh.kind !== 'ellipse' && (
            <>
              <div className="et-sep" />
              <span className="text-[11px] text-slate-400 px-1">Esquinas</span>
              <input
                type="range"
                min={0}
                max={50}
                value={sh.radiusPct}
                onChange={(e) => onRadius(Number(e.target.value))}
                className="zoom-range !w-20"
              />
            </>
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
      {isImage && stickerOpen && (
        <div
          data-keep-selection
          className="fixed z-[78] left-2 right-2 md:left-auto md:right-6 top-[110px] md:w-[300px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Borde de sticker</span>
            <button type="button" className="text-slate-400 hover:text-white text-xs" onClick={() => setStickerOpen(false)}>Cerrar</button>
          </div>
          <p className="text-[11px] text-slate-400">Funciona mejor con imágenes PNG de fondo transparente. Se dibuja de verdad, así sale en el PNG exportado.</p>
          <label className="block text-[11px] text-slate-400">Grosor: {stW}px
            <input type="range" min={2} max={40} value={stW} onChange={(e) => setStW(Number(e.target.value))} className="zoom-range !w-full mt-1" />
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-slate-400">Color
              <input type="color" value={stColor} onChange={(e) => setStColor(e.target.value)} className="w-9 h-7 bg-slate-800 border border-slate-700 rounded cursor-pointer" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={stShadow} onChange={(e) => setStShadow(e.target.checked)} /> Sombra
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onSticker({ width: stW, color: stColor, shadow: stShadow })} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white">Aplicar</button>
            <button type="button" onClick={() => onSticker(null)} className="px-3 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Quitar</button>
          </div>
        </div>
      )}
    </div>
  );
}
