import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FileText, FilePlus2, Upload } from 'lucide-react';
import { useDocumentEditorEngine } from '../../hooks/useDocumentEditorEngine';
import { readFileAsDataURL } from '../../engine/fileUtils';
import { FONT_FILE_RE, addFontFiles } from '../../engine/fontLibrary';
import { IconRail } from './IconRail';
import { SidePanel, type PanelMode } from './SidePanel';
import { EditorCanvas } from './EditorCanvas';
const PageOrganizerModal = lazy(() => import('./PageOrganizerModal').then((m) => ({ default: m.PageOrganizerModal })));
import { ElementToolbar } from './ElementToolbar';
import { LoadingOverlay } from './LoadingOverlay';
const SignaturePad = lazy(() => import('./SignaturePad').then((m) => ({ default: m.SignaturePad })));
const FolioModal = lazy(() => import('./FolioModal').then((m) => ({ default: m.FolioModal })));
import { CanvasPanel } from './CanvasPanel';
import { ExportDialog } from './ExportDialog';
const RemoveBgDialog = lazy(() => import('./RemoveBgDialog').then((m) => ({ default: m.RemoveBgDialog })));
const BatchBgModal = lazy(() => import('./BatchBgModal').then((m) => ({ default: m.BatchBgModal })));
import { HomeScreen, type HomeTask } from './HomeScreen';
const MergeTask = lazy(() => import('./PdfTasks').then((m) => ({ default: m.MergeTask })));
const SplitTask = lazy(() => import('./PdfTasks').then((m) => ({ default: m.SplitTask })));
const PagesTask = lazy(() => import('./PdfTasks').then((m) => ({ default: m.PagesTask })));
import { TaskShell, NextSteps, type AfterAction } from './TaskKit';
import { downloadBlob } from '../../engine/download';
import { TopBar } from './TopBar';
import { SearchBar, ConfirmDialog } from './SearchBar';
import { ShortcutsModal } from './ShortcutsModal';
import { importPdfPages } from '../../engine/pdfText';
import { clearDoc, loadDoc, requestPersistence, saveDoc } from '../../engine/persist';
import { loadFolioConfig } from '../../engine/folio';
import { ThumbnailPanel, ViewSwitcher, PresentationView, type ViewMode } from './PageViews';
import { InstallHelp } from './InstallHelp';
const ImageFxPanel = lazy(() => import('./ImageFxPanel').then((m) => ({ default: m.ImageFxPanel })));
const GuidedTour = lazy(() => import('./GuidedTour').then((m) => ({ default: m.GuidedTour })));
import { tourDisabled } from './tourFlag';
import { useTheme } from '../../engine/theme';
import { useInstall } from '../../hooks/useInstall';
import type { ImagesPerPageMode, MarginPresetClass, MarginSelectValue } from '../../types/documentEditor';
import './documentEditor.css';

/** Monta el contenido solo tras abrirse la primera vez (carga el módulo bajo demanda). */
function Lz({ when, children }: { when: boolean; children: React.ReactNode }) {
  const [seen, setSeen] = useState(false);
  if (when && !seen) setSeen(true);
  return seen ? <Suspense fallback={null}>{children}</Suspense> : null;
}

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
    colorPage,
    pageInfo,
    loading,
    errorMessage,
    clearError,
    notice,
    setNotice,
    confirmReq,
    setConfirmReq,
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
  const [homeOpen, setHomeOpen] = useState(!seen);
  const [tourOpen, setTourOpen] = useState(false);
  const [viewPref, setViewPref] = useState<ViewMode | null>(() => {
    try { const v = localStorage.getItem('docucraft.view'); return v === 'thumbs' || v === 'current' ? v : null; } catch { return null; }
  });
  const [presenting, setPresenting] = useState(false);
  const [pagesSheet, setPagesSheet] = useState(false);
  const [bgBatchOpen, setBgBatchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pagesKind, setPagesKind] = useState<'cut' | 'extract' | 'delete' | 'add' | null>(null);
  const [objFile, setObjFile] = useState<File | null>(null);
  const [objSrc, setObjSrc] = useState<string | null>(null);
  const [objDone, setObjDone] = useState<File | null>(null);
  const [bgMode, setBgMode] = useState<'bg' | 'object'>('bg');
  const [extract, setExtract] = useState<{ pageId: string; src: string } | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [folioStart, setFolioStart] = useState<'doc' | 'batch'>('doc');
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
  const emptyInputRef = useRef<HTMLInputElement>(null);
  const [fxPanel, setFxPanel] = useState<{ mode: 'box' | 'page'; pageId?: string } | null>(null);
  useEffect(() => { if (colorPage) setFxPanel({ mode: 'page', pageId: colorPage.id }); }, [colorPage]);
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

  const requestExport = () => setExportOpen(true);

  /** «Quitar fondo» de la barra: con una imagen seleccionada la abre; si no, abre el modo por lotes. */
  const openRemoveBg = () => {
    const target = engine?.getEditableImage();
    if (target) { setBgMode('bg'); setBgEdit(target); }
    else setBgBatchOpen(true);
  };

  // ---- Autoguardado en IndexedDB: recargar la página no borra el trabajo ----
  const restoredRef = useRef(false);
  const [restoreNote, setRestoreNote] = useState(false);
  useEffect(() => {
    if (!engine || restoredRef.current) return;
    restoredRef.current = true;
    requestPersistence();
    void (async () => {
      const doc = await loadDoc();
      if (doc && doc.html && engine.isBlankDocument()) {
        importPdfPages(doc.pdfPages as never);
        engine.loadSnapshot(doc.html, doc.font);
        if (doc.folio && (doc.folio as { enabled?: boolean }).enabled) engine.setFolioConfig({ ...loadFolioConfig(), ...(doc.folio as object) } as ReturnType<typeof loadFolioConfig>);
        setRestoreNote(true);
      }
      restoredRef.current = true;
      setReadyToSave(true);
    })();
  }, [engine]);
  const [readyToSave, setReadyToSave] = useState(false);
  const skipSave = useRef(false);
  const saveNow = () => {
    if (!engine || !readyToSave || skipSave.current) return;
    const snap = engine.exportSnapshot();
    void saveDoc({ html: snap.html, font: snap.font, folio: engine.getFolioConfig() as unknown as Record<string, unknown>, savedAt: Date.now(), pages: snap.pages, pdfPages: engine.pdfPagesFor(snap.html) });
  };
  useEffect(() => {
    if (!readyToSave) return;
    // Con cientos de hojas guardar cuesta más: se espera más entre guardados.
    const t = setTimeout(saveNow, Math.min(9000, 1200 + pageCount * 25));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentVersion, readyToSave]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') saveNow(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveNow);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveNow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, readyToSave]);

  // ---- Ventanas emergentes: al abrir una, se cierran las demás (nunca una encima de otra) ----
  const popFlags = { canvasOpen, exportOpen, folioOpen, organizerOpen, signatureOpen, shortcutsOpen, searchOpen, panel: panel !== null, fxOpen: !!fxPanel };
  const prevPop = useRef(popFlags);
  useEffect(() => {
    const prev = prevPop.current;
    const opened = (Object.keys(popFlags) as (keyof typeof popFlags)[]).filter((k) => popFlags[k] && !prev[k]);
    prevPop.current = popFlags;
    if (opened.length !== 1) return;
    const keep = opened[0];
    if (keep !== 'canvasOpen') setCanvasOpen(false);
    if (keep !== 'exportOpen') setExportOpen(false);
    if (keep !== 'folioOpen') setFolioOpen(false);
    if (keep !== 'organizerOpen') setOrganizerOpen(false);
    if (keep !== 'signatureOpen') setSignatureOpen(false);
    if (keep !== 'shortcutsOpen') setShortcutsOpen(false);
    if (keep !== 'searchOpen') setSearchOpen(false);
    if (keep !== 'fxOpen') setFxPanel(null);
    if (keep !== 'panel') setPanel(null);
    if (keep !== 'panel') setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasOpen, exportOpen, folioOpen, organizerOpen, signatureOpen, shortcutsOpen, searchOpen, panel, fxPanel]);

  // ---- Atajos generales ----
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); setExportOpen(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === '?' && !typing) { e.preventDefault(); setShortcutsOpen(true); }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  /** Importa archivos al lienzo; solo los PDF activan «Editar PDF» si se pide. */
  const importFiles = async (files: File[], mode: ImagesPerPageMode, opts: { pdfEdit?: boolean } = { pdfEdit: true }) => {
    await engine?.handleFileSelect(files, mode);
    if (opts.pdfEdit && files.some((f) => /\.pdf$/i.test(f.name)) && !pdfEditOn) {
      await engine?.setPdfEditMode(true);
      setNotice('PDF listo: toca un texto para editarlo. Con el botón «Editar PDF» lo apagas.');
    } else if (!opts.pdfEdit && pdfEditOn) {
      await engine?.setPdfEditMode(false);
    }
  };

  const closeTasks = () => { setPagesKind(null); setMergeOpen(false); setSplitOpen(false); setBgBatchOpen(false); setFolioOpen(false); };

  /** Tarjetas de la pantalla de inicio: cada una lleva directo a su tarea. */
  const onHomePick = async (task: HomeTask, files?: File[]) => {
    setHomeOpen(false);
    try { localStorage.setItem('docucraft.seen', '1'); } catch { /* ignore */ }
    switch (task) {
      case 'merge': setMergeOpen(true); break;
      case 'split': setSplitOpen(true); break;
      case 'cut': setPagesKind('cut'); break;
      case 'extract': setPagesKind('extract'); break;
      case 'delpages': setPagesKind('delete'); break;
      case 'addpage': setPagesKind('add'); break;
      case 'size': setCanvasOpen(true); break;
      case 'format': setPanel('format'); break;
      case 'removeobj': if (files?.[0]) setObjFile(files[0]); break;
      case 'folio': setFolioStart('batch'); setFolioOpen(true); break;
      case 'removebg': setBgBatchOpen(true); break;
      case 'organize':
        if (files?.length) { await importFiles(files, '1', { pdfEdit: false }); setOrganizerOpen(true); }
        break;
      case 'sign':
        if (files?.length) {
          await importFiles(files, '1', { pdfEdit: false });
          setSignatureOpen(true);
          setNotice('Dibuja tu firma, arrástrala a su lugar y toca «Descargar».');
        }
        break;
      case 'editpdf':
        if (files?.length) await importFiles(files, '1', { pdfEdit: true });
        break;
    }
  };

  /** Después de descargar el resultado de una tarea: seguir con él en el editor o volver al inicio. */
  const onAfter = async (action: AfterAction, files: File[]) => {
    closeTasks();
    if (action === 'home') { setHomeOpen(true); return; }
    if (files.length) await importFiles(files, '1', { pdfEdit: action === 'edit' });
    if (action === 'sign') { setSignatureOpen(true); setNotice('Dibuja tu firma, arrástrala a su lugar y toca «Descargar».'); }
    else if (action === 'folio') { setFolioStart('doc'); setFolioOpen(true); }
    else if (action === 'organize') setOrganizerOpen(true);
  };

  useEffect(() => {
    if (!objFile) return;
    const fr = new FileReader();
    fr.onload = () => setObjSrc(String(fr.result));
    fr.readAsDataURL(objFile);
  }, [objFile]);

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

  const closeHome = () => {
    setHomeOpen(false);
    try { localStorage.setItem('docucraft.seen', '1'); } catch { /* ignore */ }
    if (firstRun && !tourDisabled()) setTourOpen(true);
  };

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
      <TopBar
        onHome={() => setHomeOpen(true)}
        onSize={() => setCanvasOpen(true)}
        onFormat={() => setPanel((cur) => (cur === 'format' ? null : 'format'))}
        onFolio={() => { setFolioStart('doc'); setFolioOpen(true); }}
        onOrganize={() => setOrganizerOpen(true)}
        onRemoveBg={openRemoveBg}
        onShortcuts={() => setShortcutsOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onShare={requestExport}
        folioActive={folioActive}
        formatActive={panel === 'format'}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden md:flex-row flex-col-reverse">
        <IconRail
          onOpenPanel={(m) => setPanel((cur) => (cur === m ? null : m))}
          activePanel={panel}
          pdfEditOn={pdfEditOn}
          onTogglePdfEdit={() => void engine?.setPdfEditMode(!pdfEditOn)}
          onExtractObject={() => {
            const b = engine?.getPageBackdrop();
            if (b) setExtract(b);
            else setNotice('Sube un PDF y ve a la hoja de la que quieres sacar un logo u objeto.');
          }}
          onAddImages={handleAddImages}
          onAddTextBox={() => engine?.insertFloatingTextBox()}
          onAddPage={() => engine?.addNewPage()}
          onOpenSignature={() => setSignatureOpen(true)}
          imageCount={imageCount}
          onArrange={(layout, perPage) => engine?.arrangeImages(layout, perPage)}
          onInsertShape={(kind, size, filled) => engine?.insertShape(kind, size, filled)}
          onInsertFrame={(kind, size) => engine?.insertFrame(kind, size)}
          onPageAction={(a) => engine?.pageAction(a)}
          onGoToPage={(d) => engine?.goToPage(d)}
          theme={themeMode}
          onTheme={setThemeMode}
          onOpenTour={() => setTourOpen(true)}
          onOpenHome={() => setHomeOpen(true)}
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
            onImageTools={() => setFxPanel({ mode: 'box' })}
            onGroup={() => engine?.groupSelected()}
            onUngroup={() => engine?.ungroupSelected()}
            onSaveImage={(f) => void engine?.saveSelectionAsImage(f)}
            onRemoveBg={() => {
              const target = engine?.getEditableImage();
              if (target) { setBgMode('bg'); setBgEdit(target); }
            }}
            getCurve={() => engine?.getCurveState() ?? null}
            onCurve={(cfg, text) => engine?.setCurve(cfg, text)}
            onRemoveObj={() => {
              const target = engine?.getEditableImage();
              if (target) { setBgMode('object'); setBgEdit(target); }
            }}
            onCaptionGapAll={() => openGapDialog(toolbarState?.captionGap ?? gapValue)}
          />
          <div className="flex flex-1 min-h-0 min-w-0 relative">
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
          {pageCount === 0 && !loading.show && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto text-center bg-slate-900 border border-slate-700 rounded-2xl shadow-xl px-6 py-6 max-w-xs">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300"><FileText className="w-6 h-6" /></div>
                <h3 className="text-white font-bold text-base mt-3">Documento vacío</h3>
                <p className="text-xs text-slate-400 mt-1">Sube un PDF, Word o imágenes, o empieza con una hoja en blanco.</p>
                <div className="flex gap-2 mt-4 justify-center">
                  <button type="button" onClick={() => emptyInputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white" style={{ color: '#fff' }}><Upload className="w-3.5 h-3.5" /> Subir archivo</button>
                  <button type="button" onClick={() => engine?.addBlankPage()} className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border border-slate-600 text-slate-200 hover:border-slate-400"><FilePlus2 className="w-3.5 h-3.5" /> Hoja en blanco</button>
                </div>
                <input ref={emptyInputRef} type="file" multiple accept=".pdf,.docx,.documentar,.png,.jpg,.jpeg,.gif,.webp" className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void engine?.handleFileSelect(f, '1'); }} />
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {fxPanel && (
        <Lz when>
          <ImageFxPanel engine={engine} mode={fxPanel.mode} pageId={fxPanel.pageId} selCount={toolbarState?.selCount ?? 1} onClose={() => setFxPanel(null)} />
        </Lz>
      )}

      <Lz when={organizerOpen}>
<PageOrganizerModal open={organizerOpen} onClose={() => setOrganizerOpen(false)} engine={engine} history={history} contentVersion={contentVersion} />
      </Lz>

      {gapDialog && (
        <div
          data-keep-selection
          className="fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center print:hidden"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-6 w-[380px] max-w-[92vw]">
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

      <Lz when={signatureOpen}>
<SignaturePad
        isOpen={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onConfirm={(dataUrl) => {
          void engine?.insertFloatingImage(dataUrl, { signature: true });
        }}
      />
      </Lz>

      <Lz when={!!bgEdit || !!extract || !!objSrc}>
      <RemoveBgDialog
        open={!!bgEdit}
        src={bgEdit?.src ?? null}
        mode={bgMode}
        onClose={() => setBgEdit(null)}
        onApply={(dataUrl, w, h) => {
          if (bgEdit) { engine?.applyEditedImage(bgEdit.id, dataUrl, w, h); }
          setBgEdit(null);
        }}
      />

      <RemoveBgDialog
        open={!!extract}
        src={extract?.src ?? null}
        mode="extract"
        onClose={() => setExtract(null)}
        onApply={() => undefined}
        onExtract={(r) => {
          if (extract) void engine?.applyExtractedObject(extract.pageId, r.filled, r.obj, r.w, r.h);
          setExtract(null);
        }}
      />
      {/* Quitar objeto desde el inicio: foto → marcar → descargar */}
      <RemoveBgDialog
        open={!!objSrc}
        src={objSrc}
        mode="object"
        onClose={() => { setObjSrc(null); setObjFile(null); }}
        onApply={(dataUrl) => {
          void fetch(dataUrl).then((r) => r.blob()).then((blob) => {
            const base = (objFile?.name ?? 'imagen').replace(/\.[^.]+$/, '');
            const f = new File([blob], `${base}-sin-objeto.png`, { type: 'image/png' });
            downloadBlob(blob, f.name);
            setObjSrc(null);
            setObjDone(f);
          });
        }}
      />
      </Lz>
      {objDone && (
        <TaskShell title="Quitar objeto" icon={<span className="text-sm">✓</span>} onClose={() => { setObjDone(null); setObjFile(null); }}>
          <NextSteps files={[objDone]} imagesOnly onAfter={(a, f) => { setObjDone(null); setObjFile(null); void onAfter(a, f); }} />
        </TaskShell>
      )}

      <CanvasPanel open={canvasOpen} onClose={() => setCanvasOpen(false)} engine={engine} info={pageInfo} pageCount={pageCount} activeIndex={activeIndex} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(o) => { void engine?.exportDocument(o); }}
        pageCount={pageCount}
        info={pageInfo}
      />

      <Lz when={folioOpen}>
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
        onAfter={(a, f) => void onAfter(a, f)}
      />
      </Lz>

      {pageCount > 1 && (
        <div className="md:hidden">
          <ThumbnailPanel engine={engine} pageIds={pageIds} activeId={activePageId} version={contentVersion} mobileOpen={pagesSheet} onCloseMobile={() => setPagesSheet(false)} onPresent={() => setPresenting(true)} />
        </div>
      )}
      <PresentationView engine={engine} open={presenting} startIndex={activeIndex} onClose={() => setPresenting(false)} />
      <HomeScreen open={homeOpen} onClose={closeHome} onPick={(t, f) => void onHomePick(t, f)} onTour={() => { setHomeOpen(false); setTourOpen(true); }} canInstall={install.canInstall} onInstall={() => void install.install()} />
      {mergeOpen && <Lz when><MergeTask onClose={() => setMergeOpen(false)} onAfter={(a, f) => void onAfter(a, f)} /></Lz>}
      {pagesKind && <Lz when><PagesTask kind={pagesKind} onClose={() => setPagesKind(null)} onAfter={(a, f) => void onAfter(a, f)} /></Lz>}
      {splitOpen && <Lz when><SplitTask onClose={() => setSplitOpen(false)} onAfter={(a, f) => void onAfter(a, f)} /></Lz>}
      <Lz when={bgBatchOpen}><BatchBgModal open={bgBatchOpen} onClose={() => setBgBatchOpen(false)} onAfter={(a, f) => void onAfter(a, f)} /></Lz>
      <Lz when={tourOpen}><GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} engine={engine} onOpenCanvas={() => setCanvasOpen(true)} /></Lz>
      <InstallHelp kind={install.help} onClose={install.closeHelp} />

      <LoadingOverlay show={loading.show} title={loading.title} status={loading.status} />

      {restoreNote && (
        <div data-keep-selection className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[61] flex items-center gap-3 bg-slate-900 border border-slate-700 text-slate-100 text-sm pl-4 pr-2 py-2 rounded-xl shadow-xl print:hidden">
          <span>Recuperamos tu trabajo anterior.</span>
          <button type="button" onClick={() => { skipSave.current = true; void clearDoc().then(() => window.location.reload()); }} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-400">Empezar de cero</button>
          <button type="button" onClick={() => setRestoreNote(false)} className="text-xs px-2 py-1.5 text-slate-400">OK</button>
        </div>
      )}
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SearchBar engine={engine} open={searchOpen} onClose={() => setSearchOpen(false)} version={contentVersion} />
      <ConfirmDialog req={confirmReq} onClose={() => setConfirmReq(null)} />

      {notice && (
        <div
          onAnimationEnd={() => undefined}
          className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm px-4 py-3 rounded-lg shadow-xl max-w-sm print:hidden"
          onClick={() => setNotice(null)}
        >
          {notice}
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-[60] bg-rose-600 text-white text-sm px-4 py-3 rounded-lg shadow-xl max-w-sm print:hidden">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
