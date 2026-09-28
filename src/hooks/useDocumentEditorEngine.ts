import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentEditorEngine } from '../engine/DocumentEditorEngine';
import { loadRecentFonts, rememberFontUsed } from '../engine/fontCatalog';
import type { ToolbarState } from '../types/documentEditor';

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
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ show: false, title: '', status: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentFonts, setRecentFonts] = useState<string[]>(() => loadRecentFonts());

  useEffect(() => {
    if (!pagesWrapperRef.current || !scrollContainerRef.current) return;

    const instance = new DocumentEditorEngine(pagesWrapperRef.current, scrollContainerRef.current, {
      onPageCountChange: setPageCount,
      onActiveImagesChange: setImageCount,
      onHistoryChange: setHistory,
      onZoomChange: setZoom,
      onToolbarStateChange: setToolbarState,
      onFontUsed: (font) => setRecentFonts((prev) => rememberFontUsed(prev, font)),
      onLoadingChange: setLoading,
      onError: setErrorMessage,
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
    loading,
    errorMessage,
    clearError,
    recentFonts,
  };
}
