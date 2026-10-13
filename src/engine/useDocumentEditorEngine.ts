import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentEditorEngine } from '../engine/DocumentEditorEngine';
import { loadRecentFonts, rememberFontUsed } from '../engine/fontCatalog';
import type { ConfirmRequest, PageInfo, ToolbarState } from '../types/documentEditor';

interface LoadingState {
  show: boolean;
  title: string;
  status: string;
}

/**
 * Crea el motor del editor en cuanto el lienzo y su contenedor de scroll
 * están montados, y mantiene sincronizado el estado que React necesita
 * para dibujar el "chrome" (contador de páginas, barra contextual, overlay
 * de carga, fuentes usadas recientemente).
 */
export function useDocumentEditorEngine() {
  const pagesWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const [engine, setEngine] = useState<DocumentEditorEngine | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [imageCount, setImageCount] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ show: false, title: '', status: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [pdfEditOn, setPdfEditOn] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(0);
  const [recentFonts, setRecentFonts] = useState<string[]>(() => loadRecentFonts());

  useEffect(() => {
    if (!pagesWrapperRef.current || !scrollContainerRef.current) return;

    const instance = new DocumentEditorEngine(pagesWrapperRef.current, scrollContainerRef.current, {
      onPageCountChange: (n) => { setPageCount(n); setContentVersion((v) => v + 1); },
      onActivePageChange: setActivePageId,
      onActiveImagesChange: setImageCount,
      onHistoryChange: (h) => { setHistory(h); setContentVersion((v) => v + 1); },
      onZoomChange: setZoom,
      onPageInfoChange: setPageInfo,
      onToolbarStateChange: setToolbarState,
      onFontUsed: (font) => setRecentFonts((prev) => rememberFontUsed(prev, font)),
      onLoadingChange: setLoading,
      onError: setErrorMessage,
      onNotice: setNotice,
      onConfirm: setConfirmReq,
      onPdfEditModeChange: setPdfEditOn,
    });
    instance.setToolbarElement(toolbarRef.current);
    setEngine(instance);

    return () => instance.destroy();
    // Se crea una única vez: el lienzo (pagesWrapper) vive durante toda la
    // vida del componente, no se vuelve a montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
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
    confirmReq,
    setConfirmReq,
    pdfEditOn,
    recentFonts,
    activePageId,
    contentVersion,
  };
}
