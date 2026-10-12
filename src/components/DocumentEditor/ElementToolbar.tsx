import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, Palette, Copy, ClipboardPaste,
  ArrowUpWideNarrow, ArrowDownWideNarrow, Trash2,
  Undo2, Redo2, PaintBucket, Ban, RotateCcw, CopyPlus, Layers, Crop,
  PanelTop, PanelRight, PanelBottom, PanelLeft, Square, ZoomIn, ZoomOut, ImagePlus, Maximize, Minimize, ImageOff, Eraser, ChevronDown, MoreHorizontal,
} from 'lucide-react';
function CurveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 17C6 7 18 7 21 17" /><path d="M9 11l1.5 2M14 11l-1.5 2" opacity=".5" /></svg>
  );
}
import { FontPicker } from './FontPicker';
import { RemoveBgIcon, StickerIcon, PageSizeIcon } from './icons';
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
  onRemoveBg: () => void;
  onRemoveObj: () => void;
  getCurve: () => { cfg: { mode: 'up' | 'down' | 'circle'; sweep: number; spacing: number } | null; text: string } | null;
  onCurve: (cfg: { mode: 'up' | 'down' | 'circle'; sweep: number; spacing: number } | null, text?: string) => void;
  pdfEditOn?: boolean;
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
  onPickFrameImage, onClearFrameImage, onFrameFit, pageInfo, onOpenCanvas, onSticker, onRemoveBg, onRemoveObj, getCurve, onCurve, pdfEditOn,
}: ElementToolbarProps) {
  const [stickerOpen, setStickerOpen] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  const [cv, setCv] = useState<{ mode: 'straight' | 'up' | 'down' | 'circle'; sweep: number; spacing: number; text: string }>({ mode: 'up', sweep: 140, spacing: 0, text: '' });
  const openCurve = () => {
    const c = getCurve();
    setCv({ mode: c?.cfg?.mode ?? 'straight', sweep: c?.cfg?.sweep ?? 140, spacing: c?.cfg?.spacing ?? 0, text: c?.text ?? '' });
    setCurveOpen(true);
  };
  const pushCurve = (n: typeof cv) => {
    setCv(n);
    onCurve(n.mode === 'straight' ? null : { mode: n.mode, sweep: n.sweep, spacing: n.spacing }, n.text);
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const [stW, setStW] = useState(8);
  const [stColor, setStColor] = useState('#ffffff');
  const [stShadow, setStShadow] = useState(true);
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

  const sep = <div className="et-sep" />;
  const label = (t: string) => <span className="text-[11px] text-slate-400 px-1 whitespace-nowrap">{t}</span>;
  const sideBtns = [
    ['Borde de arriba', PanelTop],
    ['Borde derecho', PanelRight],
    ['Borde de abajo', PanelBottom],
    ['Borde izquierdo', PanelLeft],
  ] as const;

  // ================= FILA 1: lo esencial de lo seleccionado =================
  const primary = (
    <>
      {isTextual && (
        <>
          <FontPicker compact value={state?.fontFamily ?? ''} recentFonts={recentFonts} onChange={onApplyFont} />
          <select
            value={state?.fontSize ?? '16'}
            onChange={(e) => onApplyFontSize(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1.5 px-1 outline-none w-14"
            title="Tamaño de letra"
          >
            {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          {sep}
          {b('Negrita', () => onFormat('bold'), <Bold className="w-4 h-4" />)}
          {b('Cursiva', () => onFormat('italic'), <Italic className="w-4 h-4" />)}
          {b('Subrayado', () => onFormat('underline'), <Underline className="w-4 h-4" />)}
          {sep}
          {b('Alinear izquierda', () => onFormat('justifyLeft'), <AlignLeft className="w-4 h-4" />)}
          {b('Centrar', () => onFormat('justifyCenter'), <AlignCenter className="w-4 h-4" />)}
          {b('Alinear derecha', () => onFormat('justifyRight'), <AlignRight className="w-4 h-4" />)}
          <label className="et-btn cursor-pointer" title="Color de texto" onMouseDown={onSaveSelection}>
            <Palette className="w-4 h-4" />
            <input type="color" className="hidden" onChange={(e) => onFormat('foreColor', e.target.value)} />
          </label>
        </>
      )}

      {isImage && (
        <>
          <button type="button" className={`et-btn gap-1 ${state?.cropping ? '!bg-amber-500 !text-slate-900' : ''}`} title="Recortar (tecla C). La imagen no se borra, solo se oculta la parte recortada." onMouseDown={keep} onClick={onToggleCrop}>
            <Crop className="w-4 h-4" /> <span>{state?.cropping ? 'Listo' : 'Recortar'}</span>
          </button>
          {state?.cropping && (
            <>
              {b('Acercar imagen', () => onCropZoom(1), <ZoomIn className="w-4 h-4" />)}
              {b('Alejar imagen', () => onCropZoom(-1), <ZoomOut className="w-4 h-4" />)}
            </>
          )}
          <button type="button" className="et-btn gap-1" title="Quitar el fondo de la imagen (IA, varita, pincel…)" onMouseDown={keep} onClick={onRemoveBg}>
            <RemoveBgIcon className="w-4 h-4" /> <span>Quitar fondo</span>
          </button>
          <button type="button" className="et-btn gap-1" title="Quitar un objeto de la imagen y rellenar el hueco" onMouseDown={keep} onClick={onRemoveObj}>
            <Eraser className="w-4 h-4" /> <span>Quitar objeto</span>
          </button>
          <button type="button" className={`et-btn gap-1 ${stickerOpen ? '!bg-slate-700 !text-white' : ''}`} title="Borde de sticker: contorno alrededor de la figura" onMouseDown={keep} onClick={() => setStickerOpen((v) => !v)}>
            <StickerIcon className="w-4 h-4" /> <span>Sticker</span>
          </button>
        </>
      )}

      {isShapeLike && sh && (
        <>
          {isFrame && (
            <>
              <button type="button" className="et-btn gap-1" title="Elegir la imagen del marco" onMouseDown={keep} onClick={onPickFrameImage}>
                <ImagePlus className="w-4 h-4" /> <span>{sh.frameFilled ? 'Cambiar' : 'Imagen'}</span>
              </button>
              {sh.frameFilled && (
                <button type="button" className={`et-btn gap-1 ${state?.cropping ? '!bg-amber-500 !text-slate-900' : ''}`} title="Mover y acercar la imagen dentro del marco (tecla C)" onMouseDown={keep} onClick={onToggleCrop}>
                  <Crop className="w-4 h-4" /> <span>{state?.cropping ? 'Listo' : 'Ajustar'}</span>
                </button>
              )}
              {sep}
            </>
          )}
          <button type="button" className={`et-btn gap-1 ${sh.fillOn ? '!bg-slate-700 !text-white' : ''}`} title={sh.fillOn ? 'Con relleno (clic para dejar solo el borde)' : 'Solo borde (clic para rellenar)'} onMouseDown={keep} onClick={() => onShapeProps({ fillOn: !sh.fillOn })}>
            <PaintBucket className="w-4 h-4" /> <span>{sh.fillOn ? 'Relleno' : 'Sin relleno'}</span>
          </button>
          <label className="et-btn cursor-pointer" title="Color de relleno">
            <span className="w-4 h-4 rounded border border-slate-500" style={{ background: sh.fill }} />
            <input type="color" className="hidden" value={sh.fill} onChange={(e) => onShapeProps({ fill: e.target.value, fillOn: true })} />
          </label>
          {sep}
          <label className="et-btn cursor-pointer" title="Color del borde">
            <span className="w-4 h-4 rounded border-2" style={{ borderColor: sh.borderColor }} />
            <input type="color" className="hidden" value={sh.borderColor} onChange={(e) => onShapeProps({ borderColor: e.target.value })} />
          </label>
          <input type="number" min={0} max={60} value={sh.borderWidth} onChange={(e) => onShapeProps({ borderWidth: Number(e.target.value) || 0 })} className="w-12 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1 px-1.5 outline-none" title="Grosor del borde (px)" />
        </>
      )}

      {isBox && (
        <>
          {sep}
          {b('Duplicar', onDuplicate, <CopyPlus className="w-4 h-4" />)}
          {b('Eliminar (Supr)', onDelete, <Trash2 className="w-4 h-4" />, false, 'hover:!bg-rose-600')}
        </>
      )}
    </>
  );

  // ================= FILA 2 («Más»): el resto de opciones =================
  const more = (
    <>
      {/* En el celular, lo de siempre cabe aquí para que la fila de arriba quede limpia. */}
      <div className="md:hidden flex items-center gap-1">
        {b('Copiar', onCopy, <Copy className="w-4 h-4" />)}
        {b('Pegar', onPaste, <ClipboardPaste className="w-4 h-4" />)}
      </div>

      {isTextual && (
        <>
          {b('Tachado', () => onFormat('strikeThrough'), <Strikethrough className="w-4 h-4" />)}
          {b('Justificar', () => onFormat('justifyFull'), <AlignJustify className="w-4 h-4" />)}
          {b('Lista de viñetas', () => onFormat('insertUnorderedList'), <List className="w-4 h-4" />)}
        </>
      )}

      {state?.isBox && state.boxType === 'text' && (
        <button type="button" className={`et-btn gap-1 ${curveOpen ? '!bg-slate-700 !text-white' : ''}`} title="Texto curvo: arco hacia arriba, hacia abajo o en círculo" onMouseDown={keep} onClick={() => (curveOpen ? setCurveOpen(false) : openCurve())}>
          <CurveIcon /> <span>Curvo</span>
        </button>
      )}
      {state?.isBox && (state.boxType === 'text' || state.boxType === 'caption') && (
        <>
          {sep}
          <label className="et-btn cursor-pointer gap-1" title="Pintar la casilla de texto">
            <PaintBucket className="w-4 h-4" style={{ color: state.fill || undefined }} />
            <span>Relleno</span>
            <input type="color" className="hidden" value={state.fill || '#ffffff'} onChange={(e) => onSetFill(e.target.value)} />
          </label>
          {b('Sin relleno', () => onSetFill(null), <Ban className="w-4 h-4" />, !state.fill)}
        </>
      )}

      {state && state.captionGap !== null && (
        <>
          {sep}
          {label('Separación del pie')}
          <input type="range" min={-60} max={150} value={state.captionGap} onChange={(e) => onCaptionGap(Number(e.target.value))} className="zoom-range !w-24" />
          <input type="number" value={state.captionGap} onChange={(e) => onCaptionGap(Number(e.target.value) || 0)} className="w-14 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 py-1 px-1.5 outline-none" />
          <span className="text-[11px] text-slate-500">px</span>
          {b('Reajustar pie (centrado bajo la imagen)', onCaptionReset, <RotateCcw className="w-4 h-4" />)}
          <button type="button" className="et-btn" title="Aplicar esta separación a todos los pies de foto" onMouseDown={keep} onClick={onCaptionGapAll}>
            <Layers className="w-4 h-4" /> <span>Aplicar a todos</span>
          </button>
        </>
      )}

      {isImage && (
        <>
          {state?.hasCrop && !state.cropping && b('Quitar recorte', onResetCrop, <RotateCcw className="w-4 h-4" />)}
          {sep}
          {label('Esquinas')}
          <input type="range" min={0} max={50} value={state?.imageRadiusPct ?? 0} onChange={(e) => onRadius(Number(e.target.value))} className="zoom-range !w-20" title="Redondear las esquinas de la imagen" />
          <span className="text-[11px] text-slate-500 w-8">{Math.round(state?.imageRadiusPct ?? 0)}%</span>
        </>
      )}

      {isShapeLike && sh && (
        <>
          {isFrame && sh.frameFilled && (
            <>
              {state?.cropping && (
                <>
                  {b('Acercar', () => onCropZoom(1), <ZoomIn className="w-4 h-4" />)}
                  {b('Alejar', () => onCropZoom(-1), <ZoomOut className="w-4 h-4" />)}
                </>
              )}
              {b('Llenar el marco', () => onFrameFit('cover'), <Maximize className="w-4 h-4" />)}
              {b('Mostrar entera', () => onFrameFit('contain'), <Minimize className="w-4 h-4" />)}
              {b('Quitar imagen', onClearFrameImage, <ImageOff className="w-4 h-4" />)}
              {sep}
            </>
          )}
          {label('Opacidad')}
          <input type="range" min={0} max={100} value={Math.round(sh.fillOpacity * 100)} onChange={(e) => onShapeProps({ fillOpacity: Number(e.target.value) / 100, fillOn: true })} className="zoom-range !w-16" title="Opacidad del relleno" />
          {sep}
          {label('Bordes')}
          <button type="button" className={`et-btn ${sh.sides.every(Boolean) ? '!bg-slate-700 !text-white' : ''}`} title="Borde en todos los lados" onMouseDown={keep} onClick={() => onAllSides(true)}>
            <Square className="w-4 h-4" />
          </button>
          {sideBtns.map(([lbl, Icon], i) => (
            <button key={lbl} type="button" className={`et-btn ${sh.sides[i] ? '!bg-blue-600 !text-white' : ''}`} title={`${lbl} (clic para activar o quitar)`} onMouseDown={keep} onClick={() => onToggleSide(i)}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
          {b('Sin bordes', () => onAllSides(false), <Ban className="w-4 h-4" />)}
          {sh.kind !== 'ellipse' && (
            <>
              {sep}
              {label('Esquinas')}
              <input type="range" min={0} max={50} value={sh.radiusPct} onChange={(e) => onRadius(Number(e.target.value))} className="zoom-range !w-20" />
            </>
          )}
        </>
      )}

      {isBox && (
        <>
          {sep}
          {b('Traer al frente', () => onLayer('front'), <ArrowUpWideNarrow className="w-4 h-4" />)}
          {b('Enviar atrás', () => onLayer('back'), <ArrowDownWideNarrow className="w-4 h-4" />)}
        </>
      )}
    </>
  );

  return (
    <div data-element-toolbar className="element-toolbar print:hidden shrink-0 bg-slate-900 border-b border-slate-800">
      {/* Fila 1 (centrada): lo de siempre + lo esencial + botón «Más» */}
      <div className="flex items-center justify-center gap-1 px-2 md:px-3 py-1.5 min-h-[46px] flex-wrap [&>*]:shrink-0">
        {b('Deshacer (Ctrl+Z)', onUndo, <Undo2 className="w-4 h-4" />, !history.canUndo)}
        {b('Rehacer (Ctrl+Y)', onRedo, <Redo2 className="w-4 h-4" />, !history.canRedo)}
        <div className="et-sep max-md:hidden" />
        <span className="max-md:hidden inline-flex gap-1">
          {b('Copiar (Ctrl+C)', onCopy, <Copy className="w-4 h-4" />)}
          {b('Pegar (Ctrl+V)', onPaste, <ClipboardPaste className="w-4 h-4" />)}
        </span>
        <div className="et-sep" />

        {!state && (
          <span className={`text-xs px-2 whitespace-nowrap ${pdfEditOn ? 'text-blue-300' : 'text-slate-500'}`}>
            {pdfEditOn ? 'Toca el texto del PDF que quieres cambiar' : 'Toca un texto, cuadro o imagen para ver sus opciones'}
          </span>
        )}
        {primary}

        <button
          type="button"
          onMouseDown={keep}
          onClick={() => setMoreOpen((v) => !v)}
          title={moreOpen ? 'Ocultar las demás opciones' : 'Mostrar todas las demás opciones'}
          aria-expanded={moreOpen}
          className={`inline-flex items-center gap-1 h-[30px] px-2.5 rounded-full text-xs font-medium border transition ${
            moreOpen ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-100 hover:border-blue-500'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>{moreOpen ? 'Menos' : 'Más'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Fila 2 (segundo piso): se despliega con «Más» */}
      {moreOpen && (
        <div className="border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-center gap-1 px-2 md:px-3 py-1.5">
          {more}
        </div>
      )}

      {curveOpen && state?.boxType === 'text' && (
        <div data-keep-selection className="fixed z-[78] left-2 right-2 md:left-auto md:right-6 top-[110px] md:w-[300px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Texto curvo</span>
            <button type="button" className="text-slate-400 hover:text-white text-xs" onClick={() => setCurveOpen(false)}>Cerrar</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {([['straight', 'Recto'], ['up', 'Arco ↑'], ['down', 'Arco ↓'], ['circle', 'Círculo']] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => pushCurve({ ...cv, mode: m })} className={`py-2 rounded-lg text-[11px] font-medium border ${cv.mode === m ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{l}</button>
            ))}
          </div>
          <label className="block text-[11px] text-slate-400">Texto
            <input value={cv.text} onChange={(e) => pushCurve({ ...cv, text: e.target.value })} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500" placeholder="Escribe el texto…" />
          </label>
          {(cv.mode === 'up' || cv.mode === 'down') && (
            <label className="block text-[11px] text-slate-400">Curvatura: {cv.sweep}°
              <input type="range" min={20} max={340} value={cv.sweep} onChange={(e) => pushCurve({ ...cv, sweep: Number(e.target.value) })} className="zoom-range !w-full mt-1" />
            </label>
          )}
          {cv.mode !== 'straight' && (
            <label className="block text-[11px] text-slate-400">Espacio entre letras: {cv.spacing}px
              <input type="range" min={-2} max={30} value={cv.spacing} onChange={(e) => pushCurve({ ...cv, spacing: Number(e.target.value) })} className="zoom-range !w-full mt-1" />
            </label>
          )}
          <p className="text-[10px] text-slate-500">La tipografía, tamaño y color se cambian con la barra de arriba. Agranda el cuadro para un arco más grande.</p>
        </div>
      )}

      {isImage && stickerOpen && (
        <div data-keep-selection className="fixed z-[78] left-2 right-2 md:left-auto md:right-6 top-[110px] md:w-[300px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Borde de sticker</span>
            <button type="button" className="text-slate-400 hover:text-white text-xs" onClick={() => setStickerOpen(false)}>Cerrar</button>
          </div>
          <p className="text-[11px] text-slate-400">Funciona mejor con imágenes PNG de fondo transparente (usa «Quitar fondo» primero). Se dibuja de verdad, así sale en el PNG exportado.</p>
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
