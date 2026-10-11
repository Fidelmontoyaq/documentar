import { useEffect, useRef, useState } from 'react';
import { Circle } from 'lucide-react';
import { useDocumentEditorEngine } from '../../hooks/useDocumentEditorEngine';
import { readFileAsDataURL } from '../../engine/fileUtils';
import { FONT_FILE_RE, addFontFiles } from '../../engine/fontLibrary';
import { IconRail } from './IconRail';
import { SidePanel, type PanelMode } from './SidePanel';
import { EditorCanvas } from './EditorCanvas';
import { PageOrganizerModal } from './PageOrganizerModal';
import { ElementToolbar } from './ElementToolbar';
import { LoadingOverlay } from './LoadingOverlay';
import { SignaturePad } from './SignaturePad';
import { FolioModal } from './FolioModal';
import { CanvasPanel } from './CanvasPanel';
import { ExportDialog } from './ExportDialog';
import { RemoveBgDialog } from './RemoveBgDialog';
import { QuickTasks, type QuickTask } from './QuickTasks';
import { BatchBgModal } from './BatchBgModal';
import { AssistantPanel, useRecorder } from './AssistantPanel';
import { exportAdvice, loadMem, recorder, suggestNext, track, undoPreset, type ActionId, type PresetRun, type Tip } from '../../engine/assistant';
import { ThumbnailPanel, ViewSwitcher, PresentationView, type ViewMode } from './PageViews';
import { AboutModal, InstallHelp } from './AboutModal';
import { GuidedTour, tourDisabled } from './GuidedTour';
import { useTheme } from '../../engine/theme';
import { useInstall } from '../../hooks/useInstall';
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
    pageInfo,
    loading,
    errorMessage,
    clearError,
    notice,
    setNotice,
    pdfEditOn,
    recentFonts,
    activePageId,
    contentVersion,
  } = useDocumentEditorEngine();

  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const install = useInstall();
  const seen = (() => { try { return localStorage.getItem('docucraft.seen') === '1'; } catch { return true; } })();
  const [firstRun] = useState(!seen);
  const [aboutOpen, setAboutOpen] = useState(!seen);
  const [tourOpen, setTourOpen] = useState(false);
  const [viewPref, setViewPref] = useState<ViewMode | null>(() => {
    try { const v = localStorage.getItem('docucraft.view'); return v === 'thumbs' || v === 'current' ? v : null; } catch { return null; }
  });
  const [presenting, setPresenting] = useState(false);
  const [pagesSheet, setPagesSheet] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [bgBatchOpen, setBgBatchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [folioStart, setFolioStart] = useState<'doc' | 'batch'>('doc');
  const [tip, setTip] = useState<Tip | null>(null);
  const [tipExport, setTipExport] = useState(false);
  const [lastRun, setLastRun] = useState<PresetRun | null>(null);
  useRecorder();
  const [bgEdit, setBgEdit] = useState<{ id: string; src: string } | null>(null);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [folioOpen, setFolioOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [folioActive, setFolioActive] = useState(false);
  const [imageMode, setImageMode] = useState<ImagesPerPageMode>('1');
  const [fontValue, setFontValue] = useState(DEFAULT_FONT);
  const [marginValue, setMarginValue] = useState<MarginSelectValue>(DEFAULT_MARGIN);
  const [customMarginCm, setCustomMarginCm] = useState(DEFAULT_MARGIN_CM);
  const [gapDialog, setGapDialog] = useState<{ pageCount: number; docCount: number } | null>(null);
  const [gapScope, setGapScope] = useState<'page' | 'document'>('document');
  const [gapValue, setGapValue] = useState(8);

  const pageIds = engine ? engine.getPageIds() : [];
  // Con más de una hoja, las miniaturas se muestran por defecto.
  const viewMode: ViewMode = viewPref ?? 'thumbs';
  const showThumbs = pageCount > 1 && viewMode === 'thumbs';
  const activeIndex = Math.max(0, pageIds.indexOf(activePageId ?? ''));
  const changeView = (m: ViewMode) => {
    setViewPref(m);
    try { localStorage.setItem('docucraft.view', m); } catch { /* ignore */ }
  };
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [showThumbs]);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'F5' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setPresenting(true); }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  const trackAction = (a: ActionId, extra?: { folioOn?: boolean }) => {
    const m = track(a, extra);
    if (a !== 'export') {
      const t = suggestNext(m, a);
      setTip(t);
      setTipExport(false);
    }
  };

  useEffect(() => {
    if (!engine) return;
    engine.setCommandListener((c) => {
      recorder.push(c);
      trackAction(c.t === 'size' ? 'size' : c.t === 'folio' ? 'folio' : 'format');
    });
    return () => engine.setCommandListener(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 14000);
    return () => clearTimeout(t);
  }, [tip]);

  /** Exportar: antes se revisa si hay algo raro o si te estás saliendo de tu rutina. */
  const requestExport = () => {
    const advice = engine
      ? exportAdvice(loadMem(), { folioEnabled: !!engine.getFolioConfig().enabled, pageCount, trailingBlank: engine.trailingBlankPages() })
      : null;
    if (advice) {
      setTip(advice);
      setTipExport(true);
      return;
    }
    setExportOpen(true);
  };

  const goTo = (a: ActionId) => {
    switch (a) {
      case 'folio': setFolioStart('doc'); setFolioOpen(true); break;
      case 'import': case 'merge': setPanel('import'); break;
      case 'organize': setOrganizerOpen(true); break;
      case 'export': requestExport(); break;
      case 'size': setCanvasOpen(true); break;
      case 'text': engine?.insertFloatingTextBox(); break;
      case 'sign': setSignatureOpen(true); break;
      case 'pdfedit': void engine?.setPdfEditMode(true); break;
      case 'removebg': setBgBatchOpen(true); break;
      case 'format': setPanel('format'); break;
      case 'page': engine?.addNewPage(); break;
      default: setNotice('Usa el botón correspondiente de la barra de herramientas.');
    }
  };

  const onTipAction = (t: Tip) => {
    if (!t.action) return;
    if (t.action.kind === 'removeBlank') {
      engine?.removeTrailingBlankPages();
      if (tipExport) setExportOpen(true);
    } else if (t.action.kind === 'open') {
      goTo(t.action.target);
    }
    setTip(null);
    setTipExport(false);
  };

  const onQuickPick = async (task: QuickTask, files?: File[]) => {
    setQuickOpen(false);
    if (task === 'folio') { setFolioStart('batch'); setFolioOpen(true); return; }
    if (task === 'removebg') { setBgBatchOpen(true); return; }
    if (!files?.length) return;
    await importFiles(files, '1');
    if (task === 'organize') { trackAction('organize'); setOrganizerOpen(true); }
    if (task === 'merge') { trackAction('merge'); setExportOpen(true); }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!errorMessage) return;
    // Aviso simple: el prototipo original usaba alert(); aquí basta con la
    // consola más un aviso efímero, para no bloquear la interfaz con modales.
    const timeout = setTimeout(clearError, 4000);
    return () => clearTimeout(timeout);
  }, [errorMessage, clearError]);

  const closeAbout = () => {
    setAboutOpen(false);
    try { localStorage.setItem('docucraft.seen', '1'); } catch { /* ignore */ }
    if (firstRun && !tourDisabled()) setTourOpen(true);
  };

  /** Importa archivos; si entra un PDF se activa «Editar PDF» para poder tocar y corregir su texto. */
  const importFiles = async (files: File[], mode: ImagesPerPageMode) => {
    await engine?.handleFileSelect(files, mode);
    trackAction('import');
    if (files.some((f) => /\.pdf$/i.test(f.name)) && !pdfEditOn) {
      await engine?.setPdfEditMode(true);
      setNotice('PDF listo: toca un texto para editarlo. Con el botón «Editar PDF» lo apagas.');
    }
  };

  const handleAddImages = async (files: File[]) => {
    trackAction('image');
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

  const handleDropFiles = async (files: File[], x: number, y: number) => {
    const fonts = files.filter((f) => FONT_FILE_RE.test(f.name));
    const rest = files.filter((f) => !FONT_FILE_RE.test(f.name));
    if (fonts.length) {
      const res = await addFontFiles(fonts);
      setNotice(res.added.length ? `Fuente añadida: ${res.added.map((a) => a.label).join(', ')}. Búscala en el selector de tipografía.` : res.errors[0] ?? null);
    }
    if (rest.length) {
      await engine?.dropFiles(rest, x, y, imageMode);
      if (rest.some((f) => /\.pdf$/i.test(f.name)) && !pdfEditOn) await engine?.setPdfEditMode(true);
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
    <div className="doc-editor h-[100dvh] flex flex-col overflow-hidden bg-slate-900 text-slate-50 font-sans print:bg-white print:text-black">
      <div className="flex flex-1 min-h-0 overflow-hidden md:flex-row flex-col-reverse">
        <IconRail
          onOpenPanel={(m) => setPanel((cur) => (cur === m ? null : m))}
          activePanel={panel}
          pdfEditOn={pdfEditOn}
          onTogglePdfEdit={() => { if (!pdfEditOn) trackAction('pdfedit'); void engine?.setPdfEditMode(!pdfEditOn); }}
          onAddImages={handleAddImages}
          onAddTextBox={() => { trackAction('text'); engine?.insertFloatingTextBox(); }}
          onAddPage={() => { trackAction('page'); engine?.addNewPage(); }}
          onOpenSignature={() => { trackAction('sign'); setSignatureOpen(true); }}
          onOpenOrganizer={() => { trackAction('organize'); setOrganizerOpen(true); }}
          onExportPDF={requestExport}
          imageCount={imageCount}
          onArrange={(layout, perPage) => { trackAction('arrange'); engine?.arrangeImages(layout, perPage); }}
          onInsertShape={(kind, size, filled) => engine?.insertShape(kind, size, filled)}
          onInsertFrame={(kind, size) => engine?.insertFrame(kind, size)}
          onOpenFolio={() => { setFolioStart('doc'); setFolioOpen(true); }}
          onOpenQuick={() => setQuickOpen(true)}
          onOpenAssistant={() => setAssistantOpen(true)}
          assistantAlert={!!tip}
          folioActive={folioActive}
          onOpenCanvas={() => setCanvasOpen(true)}
          onPageAction={(a) => engine?.pageAction(a)}
          onGoToPage={(d) => engine?.goToPage(d)}
          theme={themeMode}
          onTheme={setThemeMode}
          onOpenTour={() => setTourOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
          canInstall={install.canInstall}
          onInstall={() => void install.install()}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
        />

        <SidePanel
          open={panel !== null}
          mode={panel ?? 'import'}
          onClose={() => setPanel(null)}
          multiFileInputRef={multiFileInputRef}
          onFilesSelected={(files) => { void importFiles(files, imageMode); setPanel(null); }}
          imageMode={imageMode}
          onImageModeChange={setImageMode}
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
          onInsertPageNumber={() => engine?.insertPageNumberField()}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
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
            onCropZoom={(d) => engine?.cropZoomStep(d)}
            onRadius={(pct) => engine?.setRadiusPct(pct)}
            onShapeProps={(patch) => engine?.setShapeProps(patch)}
            onToggleSide={(i) => engine?.toggleShapeSide(i)}
            onAllSides={(on) => engine?.setShapeSides(on)}
            onPickFrameImage={() => engine?.pickFrameImage()}
            onClearFrameImage={() => engine?.clearFrameImage()}
            onFrameFit={(mode) => engine?.frameFit(mode)}
            pageInfo={pageInfo}
            pdfEditOn={pdfEditOn}
            onOpenCanvas={() => setCanvasOpen(true)}
            onSticker={(o) => void engine?.setStickerBorder(o)}
            onRemoveBg={() => {
              const target = engine?.getEditableImage();
              if (target) setBgEdit(target);
            }}
            onCaptionGapAll={() => openGapDialog(toolbarState?.captionGap ?? gapValue)}
          />
          <div className="flex flex-1 min-h-0 min-w-0">
          {showThumbs && (
            <ThumbnailPanel engine={engine} pageIds={pageIds} activeId={activePageId} version={contentVersion} mobileOpen={false} onCloseMobile={() => undefined} onPresent={() => setPresenting(true)} />
          )}
          <EditorCanvas
            extra={
              <ViewSwitcher mode={viewMode} onMode={changeView} onPresent={() => setPresenting(true)} pageCount={pageCount} activeIndex={activeIndex} onOpenPages={() => setPagesSheet(true)} />
            }
            scrollContainerRef={scrollContainerRef}
            pagesWrapperRef={pagesWrapperRef}
            zoom={zoom}
            onZoomChange={(p) => engine?.setZoom(p)}
            onFit={() => engine?.fitToWidth()}
            onDropFiles={(f, x, y) => void handleDropFiles(f, x, y)}
          />
          </div>
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

      <SignaturePad
        isOpen={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onConfirm={(dataUrl) => {
          void engine?.insertFloatingImage(dataUrl);
        }}
      />

      <RemoveBgDialog
        open={!!bgEdit}
        src={bgEdit?.src ?? null}
        onClose={() => setBgEdit(null)}
        onApply={(dataUrl, w, h) => {
          if (bgEdit) { trackAction('removebg'); engine?.applyEditedImage(bgEdit.id, dataUrl, w, h); }
          setBgEdit(null);
        }}
      />

      <CanvasPanel open={canvasOpen} onClose={() => setCanvasOpen(false)} engine={engine} info={pageInfo} pageCount={pageCount} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(o) => { trackAction('export', { folioOn: !!engine?.getFolioConfig().enabled }); void engine?.exportDocument(o); }}
        pageCount={pageCount}
        info={pageInfo}
      />

      <FolioModal
        open={folioOpen}
        onClose={() => {
          setFolioOpen(false);
          setFolioActive(!!engine?.getFolioConfig().enabled);
        }}
        engine={engine}
        pageCount={pageCount}
        recentFonts={recentFonts}
        startTab={folioStart}
      />

      {pageCount > 1 && (
        <div className="md:hidden">
          <ThumbnailPanel engine={engine} pageIds={pageIds} activeId={activePageId} version={contentVersion} mobileOpen={pagesSheet} onCloseMobile={() => setPagesSheet(false)} onPresent={() => setPresenting(true)} />
        </div>
      )}
      <PresentationView engine={engine} open={presenting} startIndex={activeIndex} onClose={() => setPresenting(false)} />
      <QuickTasks open={quickOpen} onClose={() => setQuickOpen(false)} onPick={(t, f) => void onQuickPick(t, f)} />
      <BatchBgModal open={bgBatchOpen} onClose={() => setBgBatchOpen(false)} />
      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        engine={engine}
        tip={tip}
        onTipAction={onTipAction}
        lastRun={lastRun}
        onRan={(r) => { setLastRun(r); trackAction('format'); }}
        onUndoRun={() => { if (engine && lastRun) undoPreset(engine, lastRun); setLastRun(null); setNotice('Listo: volvió todo como estaba.'); }}
      />

      {recorder.recording && (
        <button type="button" onClick={() => setAssistantOpen(true)} className="fixed top-2 left-1/2 -translate-x-1/2 z-[62] flex items-center gap-2 bg-rose-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-xl print:hidden">
          <Circle className="w-2.5 h-2.5 fill-current animate-pulse" /> Grabando {recorder.cmds.length} paso(s) · tocar para detener
        </button>
      )}

      {tip && !assistantOpen && (
        <div data-keep-selection className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-[58] w-[min(92vw,420px)] bg-slate-900 border border-blue-600/50 rounded-2xl shadow-2xl p-3 print:hidden">
          <p className="text-[13px] text-slate-200 leading-snug">💡 {tip.text}</p>
          <div className="flex gap-2 mt-2 justify-end">
            <button type="button" onClick={() => { setTip(null); setTipExport(false); }} className="text-xs px-3 py-1.5 rounded-full text-slate-400">Ahora no</button>
            {tipExport && <button type="button" onClick={() => { setTip(null); setTipExport(false); setExportOpen(true); }} className="text-xs px-3 py-1.5 rounded-full border border-slate-600 text-slate-200">Exportar igual</button>}
            {tip.action && <button type="button" onClick={() => onTipAction(tip)} className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium">{tip.action.label}</button>}
          </div>
        </div>
      )}

      <AboutModal open={aboutOpen} onClose={closeAbout} onStartTour={() => setTourOpen(true)} canInstall={install.canInstall} onInstall={() => void install.install()} firstRun={firstRun && !tourDisabled()} />
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} engine={engine} onOpenCanvas={() => setCanvasOpen(true)} />
      <InstallHelp kind={install.help} onClose={install.closeHelp} />

      <LoadingOverlay show={loading.show} title={loading.title} status={loading.status} />

      {notice && (
        <div
          onAnimationEnd={() => undefined}
          className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm px-4 py-3 rounded-lg shadow-2xl max-w-sm print:hidden"
          onClick={() => setNotice(null)}
        >
          {notice}
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-[60] bg-rose-600 text-white text-sm px-4 py-3 rounded-lg shadow-2xl max-w-sm print:hidden">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
