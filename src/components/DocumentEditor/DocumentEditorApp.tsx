import { useEffect, useRef, useState } from 'react';
import { useDocumentEditorEngine } from '../../hooks/useDocumentEditorEngine';
import { readFileAsDataURL } from '../../engine/fileUtils';
import { IconRail } from './IconRail';
import { SidePanel } from './SidePanel';
import { EditorCanvas } from './EditorCanvas';
import { PageOrganizerModal } from './PageOrganizerModal';
import { ElementToolbar } from './ElementToolbar';
import { LoadingOverlay } from './LoadingOverlay';
import type { ImagesPerPageMode, MarginPresetClass, MarginSelectValue } from '../../types/documentEditor';
import './documentEditor.css';

const DEFAULT_FONT = "'Inter', sans-serif";
const DEFAULT_MARGIN: MarginSelectValue = 'custom';
const DEFAULT_MARGIN_CM = 2;

/** Editor y Ensamblador de Documentos Avanzado. */
export function DocumentEditorApp() {
  const {
    pagesWrapperRef,
    scrollContainerRef,
    toolbarRef,
    engine,
    pageCount,
    imageCount,
    zoom,
    history,
    toolbarState,
    loading,
    errorMessage,
    clearError,
    recentFonts,
  } = useDocumentEditorEngine();

  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [imageMode, setImageMode] = useState<ImagesPerPageMode>('1');
  const [fontValue, setFontValue] = useState(DEFAULT_FONT);
  const [marginValue, setMarginValue] = useState<MarginSelectValue>(DEFAULT_MARGIN);
  const [customMarginCm, setCustomMarginCm] = useState(DEFAULT_MARGIN_CM);
  const [gapDialog, setGapDialog] = useState<{ pageCount: number; docCount: number } | null>(null);
  const [gapScope, setGapScope] = useState<'page' | 'document'>('document');
  const [gapValue, setGapValue] = useState(8);

  useEffect(() => {
    if (!errorMessage) return;
    // Aviso simple: el prototipo original usaba alert(); aquí basta con la
    // consola más un aviso efímero, para no bloquear la interfaz con modales.
    const timeout = setTimeout(clearError, 4000);
    return () => clearTimeout(timeout);
  }, [errorMessage, clearError]);

  const handleAddImages = async (files: File[]) => {
    try {
      if (files.length === 1) {
        await engine?.insertFloatingImage(await readFileAsDataURL(files[0]));
      } else {
        // Varias a la vez: en la hoja actual, acomodadas automáticamente.
        await engine?.handleFileSelect(files, 'current');
      }
    } catch (error) {
      console.error('Error al leer las imágenes:', error);
    }
  };

  const handleMarginChange = (value: MarginSelectValue) => {
    setMarginValue(value);
    if (value === 'custom') {
      engine?.applyCustomMargin(customMarginCm);
    } else {
      engine?.changeGlobalMargin(value as MarginPresetClass);
    }
  };

  const handleCustomMarginCmChange = (cm: number) => {
    setCustomMarginCm(Number.isNaN(cm) ? 0 : cm);
  };

  const openGapDialog = (initialValue: number) => {
    if (!engine) return;
    setGapValue(initialValue);
    setGapScope('document');
    setGapDialog({
      pageCount: engine.countLinkedCaptions('page'),
      docCount: engine.countLinkedCaptions('document'),
    });
  };

    return (
    <div className="doc-editor h-screen flex flex-col overflow-hidden bg-slate-900 text-slate-50 font-sans print:bg-white print:text-black">
      <div className="flex flex-1 overflow-hidden">
        <IconRail
          onImportClick={() => multiFileInputRef.current?.click()}
          onAddImages={handleAddImages}
          onAddTextBox={() => engine?.insertFloatingTextBox()}
          onAddPage={() => engine?.addNewPage()}
          onOpenOrganizer={() => setOrganizerOpen(true)}
          onExportPDF={() => engine?.exportToPDF()}
          onToggleFormatPanel={() => setSidePanelOpen((v) => !v)}
          formatPanelOpen={sidePanelOpen}
          imageCount={imageCount}
          onArrange={(layout, perPage) => engine?.arrangeImages(layout, perPage)}
        />

        <SidePanel
          open={sidePanelOpen}
          onClose={() => setSidePanelOpen(false)}
          multiFileInputRef={multiFileInputRef}
          onFilesSelected={(files) => engine?.handleFileSelect(files, imageMode)}
          imageMode={imageMode}
          onImageModeChange={setImageMode}
          onAddImages={handleAddImages}
          onAddTextBox={() => engine?.insertFloatingTextBox()}
          onAddPage={() => engine?.addNewPage()}
          fontValue={fontValue}
          recentFonts={recentFonts}
          onFontChange={(value) => {
            setFontValue(value);
            engine?.changeGlobalFont(value);
          }}
          marginValue={marginValue}
          onMarginChange={handleMarginChange}
          customMarginCm={customMarginCm}
          onCustomMarginCmChange={handleCustomMarginCmChange}
          onApplyCustomMargin={() => engine?.applyCustomMargin(customMarginCm)}
          onFormatText={(command, value) => engine?.formatText(command, value ?? null)}
          onSaveSelection={() => engine?.saveCurrentSelection()}
          onInsertPageNumber={() => engine?.insertPageNumberField()}
          pageCount={pageCount}
          onOpenOrganizer={() => setOrganizerOpen(true)}
          onOpenCaptionGapAll={() => openGapDialog(gapValue)}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <ElementToolbar
            state={toolbarState}
            history={history}
            recentFonts={recentFonts}
            onUndo={() => engine?.undo()}
            onRedo={() => engine?.redo()}
            onCopy={() => engine?.copySelection(false)}
            onPaste={() => engine?.pasteClipboard()}
            onFormat={(command, value) => engine?.etFormat(command, value ?? null)}
            onApplyFont={(value) => engine?.etApplyFont(value)}
            onApplyFontSize={(value) => engine?.etApplyFontSize(value)}
            onSaveSelection={() => engine?.saveCurrentSelection()}
            onDuplicate={() => engine?.etDuplicate()}
            onLayer={(direction) => engine?.etLayer(direction)}
            onDelete={() => engine?.etDelete()}
            onSetFill={(color) => engine?.etSetFill(color)}
            onCaptionGap={(px) => engine?.setCaptionGap(px)}
            onCaptionReset={() => engine?.resetCaptionPlacement()}
            onToggleCrop={() => engine?.toggleCropMode()}
            onResetCrop={() => engine?.resetCrop()}
            onCaptionGapAll={() => openGapDialog(toolbarState?.captionGap ?? gapValue)}
          />
          <EditorCanvas
            scrollContainerRef={scrollContainerRef}
            pagesWrapperRef={pagesWrapperRef}
            zoom={zoom}
            onZoomChange={(p) => engine?.setZoom(p)}
          />
        </div>
      </div>

      <PageOrganizerModal open={organizerOpen} onClose={() => setOrganizerOpen(false)} engine={engine} history={history} />

      {gapDialog && (
        <div
          data-keep-selection
          className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center print:hidden"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 w-[380px] max-w-[92vw]">
            <h3 className="text-white font-bold text-base mb-1">¿Estás seguro?</h3>
            <p className="text-sm text-slate-300 mb-3">
              Vas a cambiar la separación entre cada imagen y su pie de foto en varias imágenes a la vez.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-200 mb-4">
              Nueva separación:
              <input
                type="number"
                autoFocus
                value={gapValue}
                onChange={(e) => setGapValue(Number(e.target.value) || 0)}
                className="w-20 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 py-1.5 px-2 outline-none focus:border-blue-500"
              />
              <span className="text-slate-400">px</span>
            </label>
            <div className="space-y-2 mb-4">
              {(
                [
                  ['document', `Todo el documento (${gapDialog.docCount} imágenes)`],
                  ['page', `Solo esta hoja (${gapDialog.pageCount} imágenes)`],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input type="radio" name="gapScope" checked={gapScope === value} onChange={() => setGapScope(value)} />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mb-4">Puedes deshacerlo con Ctrl+Z o el botón Deshacer.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setGapDialog(null)} className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  engine?.applyCaptionGapToAll(gapValue, gapScope);
                  setGapDialog(null);
                }}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                Sí, aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadingOverlay show={loading.show} title={loading.title} status={loading.status} />

      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-[60] bg-rose-600 text-white text-sm px-4 py-3 rounded-lg shadow-2xl max-w-sm print:hidden">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
