import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Template, Field, TemplateImageElement, TemplateShapeElement, TemplatePathElement, PathPoint } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../shared/Toast';
import { supabase } from '../../services/supabase';
import { EditorToolbar } from './EditorToolbar';
import { FieldToolbarQuick, FieldFontPanel, FieldEffectsPanel, ImageToolbarQuick, ImageSettingsPanel, ShapeToolbarQuick, ShapeFillPanel, ShapeBorderPanel, PathToolbarQuick, PathStylePanel, PanelKey, PanelHeader } from './EditToolbars';
import { IconInfo, IconLoader, IconFieldData, IconTextType, IconImage, IconSignature } from './editorIcons';
import { FieldElement, ImageElement, ShapeElement } from './CanvasElements';
import { VectorToolRail, VectorCanvasLayer, VectorTool } from './VectorTools';
import { useElementDrag } from './useElementDrag';
import { useEditorActions } from './useEditorActions';
import { CreationToolRail } from './CreationToolRail';
import { MOBILE_BREAKPOINT, Selection, measureTextNaturalWidth, AUTO_WIDTH_PADDING_PX, MIN_FIELD_W, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './editorHelpers';
import { buildSvgPathD, getPathBounds } from './pathHelpers';
import { printTemplate } from './printTemplate';

// ============================================
// Iconos locales — solo los usa este archivo
// ============================================
const IconChangeBackground = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="5" width="13" height="13" rx="2" />
    <path d="M20.5 9a5 5 0 1 0-1.2 6.2" />
    <path d="M20.5 5v4h-4" />
  </svg>
);
const IconVectorGroup = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18c4-8 8-8 16-12" />
    <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="20" cy="6" r="1.6" />
  </svg>
);
const IconLayers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconVectorGroupTiny = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 18c4-8 8-8 16-12" />
    <circle cx="4" cy="18" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="20" cy="6" r="1.8" />
  </svg>
);
const IconShapeGlyphTiny = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
);
const IconPrint = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="9" rx="2" />
    <path d="M6 14h12v7H6z" />
  </svg>
);
const IconPencilTiny = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconDragHandle = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);
const IconToFront = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="7" width="12" height="12" rx="1.5" />
    <path d="M5 15V6a1 1 0 0 1 1-1h9" strokeDasharray="2 2" />
  </svg>
);
const IconToBack = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="12" height="12" rx="1.5" strokeDasharray="2 2" />
    <rect x="9" y="9" width="10" height="10" rx="1.5" fill="white" />
  </svg>
);
const IconForward = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 15 6-6 6 6" />
  </svg>
);
const IconBackward = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

interface TemplateEditorProps {
  template: Template | null;
  onUpdate: (template: Template) => void;
  isGuest: boolean;
  /** Opcional: si se pasa, el estado vacío muestra un botón para volver a Inicio */
  onGoHome?: () => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  template,
  onUpdate,
  isGuest,
  onGoHome,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [selection, setSelection] = useState<Selection>(null);
  const [activeTool, setActiveTool] = useState<VectorTool>('select');
  const [vectorMenuOpen, setVectorMenuOpen] = useState(false);
  // Panel de capas — oculto por defecto (sobre todo en celular, para no
  // robarle espacio al certificado); se abre con el botón dedicado.
  const [showLayers, setShowLayers] = useState(false);
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  // Panel lateral que está abierto ahora mismo (Fuente/Efectos/Relleno/...)
  // — uno solo a la vez, y se cierra en cuanto cambia la selección.
  const [openPanel, setOpenPanel] = useState<PanelKey>(null);
  useEffect(() => { setOpenPanel(null); }, [selection]);

  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [viewportSize, setViewportSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [zoom, setZoom] = useState(1);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const isMobile = viewportSize.width < MOBILE_BREAKPOINT;
  const heightRatio = isMobile ? 0.68 : 0.55;

  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    setContainerHeight(el.clientHeight);

    return () => observer.disconnect();
  }, [template?.image]);

  useEffect(() => {
    const handleResize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const fitScale = (() => {
    if (!template?.natW || !template?.natH || !containerWidth) return 1;
    // Ahora el canvas ocupa TODO el alto disponible (layout de una sola
    // pieza) en vez de una fracción fija del viewport, así que usamos el
    // alto real medido del contenedor; heightRatio queda solo como
    // respaldo mientras el ResizeObserver aún no midió nada.
    const heightBudget = containerHeight || viewportSize.height * heightRatio;
    const scaleByWidth = containerWidth / template.natW;
    const scaleByHeight = (heightBudget - 32) / template.natH;
    return Math.min(1, scaleByWidth, scaleByHeight);
  })();

  const scale = fitScale * zoom;
  const displayWidth = template?.natW ? Math.round(template.natW * scale) : 0;
  const displayHeight = template?.natH ? Math.round(template.natH * scale) : 0;
  const images = template?.images || [];
  const shapes = template?.shapes || [];
  const paths = template?.paths || [];

  // ============================================
  // Orden de capas — TODO se puede intercalar libremente, incluyendo cada
  // vector por separado (antes se movían todos juntos como un bloque).
  // ============================================
  type LayerItem = { type: 'field' | 'image' | 'shape' | 'path'; id: string };
  const layerKey = (li: LayerItem) => `${li.type}:${li.id}`;

  const layerOrder: LayerItem[] = (() => {
    const defaultOrder: LayerItem[] = [
      ...shapes.map((s): LayerItem => ({ type: 'shape', id: s.id })),
      ...paths.map((p): LayerItem => ({ type: 'path', id: p.id })),
      ...images.map((i): LayerItem => ({ type: 'image', id: i.id })),
      ...(template?.fields || []).map((f): LayerItem => ({ type: 'field', id: f.id })),
    ];
    const stored = (template as any)?.layerOrder as string[] | undefined;
    if (!stored) return defaultOrder;

    const existingKeys = new Set(defaultOrder.map(layerKey));
    const restored = stored
      .map((key): LayerItem => {
        const idx = key.indexOf(':');
        return { type: key.slice(0, idx) as LayerItem['type'], id: key.slice(idx + 1) };
      })
      .filter((li) => existingKeys.has(layerKey(li)));
    const restoredKeys = new Set(restored.map(layerKey));
    // Lo nuevo (creado después de guardar el orden) se agrega arriba del todo.
    const appended = defaultOrder.filter((li) => !restoredKeys.has(layerKey(li)));
    return [...restored, ...appended];
  })();

  const zIndexFor = (type: LayerItem['type'], id: string) => {
    const idx = layerOrder.findIndex((li) => li.type === type && li.id === id);
    return idx === -1 ? 0 : idx + 1;
  };

  // Imprimir en hoja A4 completa — la usan el botón "Imprimir" y Ctrl+P.
  // Se guarda en un ref para que el atajo de teclado siempre llame a la
  // versión más reciente sin tener que re-registrar el listener.
  const printRef = useRef<() => void>(() => {});
  printRef.current = () => {
    if (!template?.image) {
      showToast('Agrega una imagen de fondo para poder imprimir');
      return;
    }
    showToast('Preparando impresión…');
    printTemplate(template, { layers: layerOrder, uiWidth: displayWidth || template.natW })
      .catch((err) => { console.error('Error al imprimir:', err); showToast('No se pudo preparar la impresión'); });
  };

  const layerLabel = (li: LayerItem): string => {
    if (li.type === 'path') {
      const p = paths.find((x) => x.id === li.id);
      return p ? `Vector ${p.closed ? '(cerrado)' : '(abierto)'}` : 'Vector';
    }
    if (li.type === 'image') {
      const img = images.find((x) => x.id === li.id);
      if ((img as any)?.kind === 'signature') return 'Firma';
      const fileName = (img as any)?.fileName as string | undefined;
      if (fileName) return fileName;
      if ((img as any)?.clipShape) return 'Marco con foto';
      return 'Imagen';
    }
    if (li.type === 'shape') {
      const s = shapes.find((x) => x.id === li.id);
      return s ? `Forma (${s.shape === 'ellipse' ? 'círculo' : s.shape === 'rounded-rectangle' ? 'redondeada' : 'cuadrado'})` : 'Forma';
    }
    const f = (template?.fields || []).find((x) => x.id === li.id);
    return f?.label?.trim() || (f?.type === 'text' ? 'Texto' : 'Campo');
  };

  // Icono al frente de cada fila del panel de Capas, según qué es cada
  // elemento (imagen, firma, vector, texto o campo).
  const layerIcon = (li: LayerItem): React.ReactNode => {
    if (li.type === 'path') return <IconVectorGroupTiny />;
    if (li.type === 'shape') return <IconShapeGlyphTiny />;
    if (li.type === 'image') {
      const img = images.find((x) => x.id === li.id);
      if ((img as any)?.kind === 'signature') return <IconSignature />;
      return <IconImage />;
    }
    const f = (template?.fields || []).find((x) => x.id === li.id);
    return f?.type === 'text' ? <IconTextType /> : <IconFieldData />;
  };

  // Miniatura de cada capa — igual que un preset de plantillas: la imagen
  // subida en pequeñito, el color/forma de la figura, o el trazo del
  // vector reducido a un recuadro chico.
  const layerThumbnail = (li: LayerItem): React.ReactNode => {
    if (li.type === 'image') {
      const img = images.find((x) => x.id === li.id);
      if (!img) return null;
      return <img src={img.src} alt="" className="w-6 h-6 rounded object-cover border border-line flex-shrink-0" />;
    }
    if (li.type === 'shape') {
      const s = shapes.find((x) => x.id === li.id);
      if (!s) return null;
      const gradient = (s as any).gradient as { type: 'linear' | 'radial'; angle: number; stops: { color: string; position: number }[] } | undefined;
      const stopsCss = gradient?.stops.map(st => `${st.color} ${st.position}%`).join(', ');
      const bg = gradient ? (gradient.type === 'radial' ? `radial-gradient(circle, ${stopsCss})` : `linear-gradient(${gradient.angle}deg, ${stopsCss})`) : s.fill;
      const radius = s.shape === 'ellipse' ? '50%' : s.shape === 'rounded-rectangle' ? '4px' : '2px';
      return <span className="w-6 h-6 flex-shrink-0 border border-line" style={{ background: bg, borderRadius: radius }} />;
    }
    if (li.type === 'path') {
      const p = paths.find((x) => x.id === li.id);
      if (!p || p.points.length === 0) return null;
      const b = getPathBounds(p.points);
      const w = Math.max(0.001, b.maxX - b.minX);
      const h = Math.max(0.001, b.maxY - b.minY);
      const size = 100;
      const d = buildSvgPathD(
        p.points.map(pt => ({
          ...pt,
          x: (pt.x - b.minX) / w,
          y: (pt.y - b.minY) / h,
          handleIn: pt.handleIn ? { x: (pt.handleIn.x - b.minX) / w, y: (pt.handleIn.y - b.minY) / h } : undefined,
          handleOut: pt.handleOut ? { x: (pt.handleOut.x - b.minX) / w, y: (pt.handleOut.y - b.minY) / h } : undefined,
        })),
        p.closed, size, size
      );
      return (
        <svg width={24} height={24} viewBox={`-4 -4 ${size + 8} ${size + 8}`} className="flex-shrink-0 border border-line rounded bg-white">
          <path d={d} fill={p.closed ? (p.fill || '#2563EB') : 'none'} fillOpacity={p.fillOpacity ?? 1} stroke={p.stroke} strokeWidth={Math.max(4, p.strokeWidth * 3)} />
        </svg>
      );
    }
    return null;
  };

  const isLayerSelected = (li: LayerItem) => !!selection && selection.type === li.type && selection.id === li.id;

  // ============================================
  // Historial para Ctrl+Z / Ctrl+Shift+Z — agrupa cambios seguidos
  // (como arrastrar o escribir) en un solo paso, en vez de un paso
  // por cada pixel/tecla, para que deshacer se sienta natural.
  // ============================================
  const historyRef = useRef<Template[]>([]);
  const redoRef = useRef<Template[]>([]);
  const pendingSnapshotRef = useRef<Template | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitUpdate = useCallback((newTemplate: Template) => {
    if (!pendingSnapshotRef.current && template) {
      pendingSnapshotRef.current = template;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (pendingSnapshotRef.current) {
        historyRef.current.push(pendingSnapshotRef.current);
        if (historyRef.current.length > 60) historyRef.current.shift();
      }
      pendingSnapshotRef.current = null;
    }, 600);
    redoRef.current = [];
    onUpdate(newTemplate);
  }, [template, onUpdate]);

  // Mover una capa: al frente, un paso adelante, un paso atrás, o al fondo.
  const moveLayer = useCallback((li: LayerItem, action: 'front' | 'forward' | 'backward' | 'back') => {
    if (!template) return;
    const idx = layerOrder.findIndex((x) => x.type === li.type && x.id === li.id);
    if (idx === -1) return;
    const arr = [...layerOrder];
    const [item] = arr.splice(idx, 1);
    if (action === 'front') arr.push(item);
    else if (action === 'back') arr.unshift(item);
    else if (action === 'forward') arr.splice(Math.min(idx + 1, arr.length), 0, item);
    else arr.splice(Math.max(idx - 1, 0), 0, item);
    commitUpdate({ ...template, layerOrder: arr.map(layerKey) } as any);
  }, [template, layerOrder, commitUpdate]);

  const reorderLayers = useCallback((fromIdx: number, toIdx: number) => {
    if (!template || fromIdx === toIdx) return;
    const arr = [...layerOrder];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    commitUpdate({ ...template, layerOrder: arr.map(layerKey) } as any);
  }, [template, layerOrder, commitUpdate]);

  const selectLayer = (li: LayerItem) => {
    setSelection({ type: li.type, id: li.id } as Selection);
    if (li.type === 'path') setActiveTool('select');
  };

  const flushPendingHistory = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSnapshotRef.current) {
      historyRef.current.push(pendingSnapshotRef.current);
      if (historyRef.current.length > 60) historyRef.current.shift();
      pendingSnapshotRef.current = null;
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (!template) return;
    flushPendingHistory();
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push(template);
    onUpdate(prev);
  }, [template, onUpdate, flushPendingHistory]);

  const handleRedo = useCallback(() => {
    if (!template) return;
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(template);
    onUpdate(next);
  }, [template, onUpdate]);

  // ============================================
  // Actualizar / eliminar campo o texto
  // ============================================
  const handleUpdateField = useCallback((fieldId: string, updates: Partial<Field>) => {
    if (!template) return;

    const affectsWidth = 'label' in updates || 'fontSize' in updates || 'bold' in updates || 'fontFamily' in updates;

    const updatedFields = template.fields.map(f => {
      if (f.id !== fieldId) return f;
      const merged = { ...f, ...updates };
      if (merged.autoWidth !== false && affectsWidth) {
        const naturalW = measureTextNaturalWidth(merged.label, merged.fontFamily, merged.fontSize, merged.bold);
        merged.w = Math.min(0.95, Math.max(MIN_FIELD_W, (naturalW + AUTO_WIDTH_PADDING_PX) / template.natW));
      }
      return merged;
    });

    commitUpdate({ ...template, fields: updatedFields });
  }, [template, commitUpdate]);

  const handleDeleteField = useCallback((fieldId: string) => {
    if (!template) return;
    commitUpdate({ ...template, fields: template.fields.filter(f => f.id !== fieldId) });
    setSelection(prev => (prev?.type === 'field' && prev.id === fieldId ? null : prev));
    showToast('Elemento eliminado');
  }, [template, commitUpdate, showToast]);

  // ============================================
  // Actualizar / eliminar imagen decorativa
  // ============================================
  const handleUpdateImage = useCallback((imgId: string, updates: Partial<TemplateImageElement>) => {
    if (!template) return;
    const updatedImages = (template.images || []).map(i => i.id === imgId ? { ...i, ...updates } : i);
    commitUpdate({ ...template, images: updatedImages });
  }, [template, commitUpdate]);

  const handleDeleteImage = useCallback((imgId: string) => {
    if (!template) return;
    commitUpdate({ ...template, images: (template.images || []).filter(i => i.id !== imgId) });
    setSelection(prev => (prev?.type === 'image' && prev.id === imgId ? null : prev));
    showToast('Elemento eliminado');
  }, [template, commitUpdate, showToast]);

  // ============================================
  // Actualizar / eliminar forma vectorial
  // ============================================
  const handleUpdateShape = useCallback((shapeId: string, updates: Partial<TemplateShapeElement>) => {
    if (!template) return;
    const updatedShapes = (template.shapes || []).map(s => s.id === shapeId ? { ...s, ...updates } : s);
    commitUpdate({ ...template, shapes: updatedShapes });
  }, [template, commitUpdate]);

  const handleDeleteShape = useCallback((shapeId: string) => {
    if (!template) return;
    commitUpdate({ ...template, shapes: (template.shapes || []).filter(s => s.id !== shapeId) });
    setSelection(prev => (prev?.type === 'shape' && prev.id === shapeId ? null : prev));
    showToast('Elemento eliminado');
  }, [template, commitUpdate, showToast]);

  // ============================================
  // Rutas vectoriales (herramienta Pluma / Editar nodos)
  // ============================================
  const handleAddPath = useCallback((newPath: TemplatePathElement) => {
    if (!template) return;
    commitUpdate({ ...template, paths: [...(template.paths || []), newPath] });
    setSelection({ type: 'path', id: newPath.id });
    showToast('Ruta creada');
  }, [template, commitUpdate, showToast]);

  const handleUpdatePathPoints = useCallback((pathId: string, points: PathPoint[]) => {
    if (!template) return;
    const updatedPaths = (template.paths || []).map(p => p.id === pathId ? { ...p, points } : p);
    commitUpdate({ ...template, paths: updatedPaths });
  }, [template, commitUpdate]);

  const handleUpdatePathProps = useCallback((pathId: string, updates: Partial<TemplatePathElement>) => {
    if (!template) return;
    const updatedPaths = (template.paths || []).map(p => p.id === pathId ? { ...p, ...updates } : p);
    commitUpdate({ ...template, paths: updatedPaths });
  }, [template, commitUpdate]);

  const handleDeletePath = useCallback((pathId: string) => {
    if (!template) return;
    commitUpdate({ ...template, paths: (template.paths || []).filter(p => p.id !== pathId) });
    setSelection(prev => (prev?.type === 'path' && prev.id === pathId ? null : prev));
    setActiveTool('select');
    showToast('Elemento eliminado');
  }, [template, commitUpdate, showToast]);

  // ============================================
  // Copiar / pegar (Ctrl+C / Ctrl+V) — funciona con cualquier elemento
  // seleccionado: campo, texto, imagen, forma o vector.
  // ============================================
  const clipboardRef = useRef<{ type: 'field' | 'image' | 'shape' | 'path'; data: any } | null>(null);
  const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const handleCopy = useCallback(() => {
    if (!selection || !template) return;
    if (selection.type === 'field') {
      const f = template.fields.find(x => x.id === selection.id);
      if (f) clipboardRef.current = { type: 'field', data: f };
    } else if (selection.type === 'image') {
      const i = images.find(x => x.id === selection.id);
      if (i) clipboardRef.current = { type: 'image', data: i };
    } else if (selection.type === 'shape') {
      const s = shapes.find(x => x.id === selection.id);
      if (s) clipboardRef.current = { type: 'shape', data: s };
    } else if (selection.type === 'path') {
      const p = paths.find(x => x.id === selection.id);
      if (p) clipboardRef.current = { type: 'path', data: p };
    }
    if (clipboardRef.current) showToast('Copiado');
  }, [selection, template, images, shapes, paths, showToast]);

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || !template) return;
    const OFFSET = 0.03;

    if (clip.type === 'field') {
      const src: Field = clip.data;
      const copy: Field = { ...src, id: genId('f'), x: Math.min(0.92, src.x + OFFSET), y: Math.min(0.92, src.y + OFFSET) };
      commitUpdate({ ...template, fields: [...template.fields, copy] });
      setSelection({ type: 'field', id: copy.id });
    } else if (clip.type === 'image') {
      const src: TemplateImageElement = clip.data;
      const copy: TemplateImageElement = { ...src, id: genId('img'), x: Math.min(0.92, src.x + OFFSET), y: Math.min(0.92, src.y + OFFSET) };
      commitUpdate({ ...template, images: [...(template.images || []), copy] });
      setSelection({ type: 'image', id: copy.id });
    } else if (clip.type === 'shape') {
      const src: TemplateShapeElement = clip.data;
      const copy: TemplateShapeElement = { ...src, id: genId('shp'), x: Math.min(0.92, src.x + OFFSET), y: Math.min(0.92, src.y + OFFSET) };
      commitUpdate({ ...template, shapes: [...(template.shapes || []), copy] });
      setSelection({ type: 'shape', id: copy.id });
    } else if (clip.type === 'path') {
      const src: TemplatePathElement = clip.data;
      const shiftPt = (p: { x: number; y: number }) => ({ x: p.x + OFFSET, y: p.y + OFFSET });
      const copy: TemplatePathElement = {
        ...src,
        id: genId('path'),
        points: src.points.map(pt => ({
          ...pt,
          ...shiftPt(pt),
          handleIn: pt.handleIn ? shiftPt(pt.handleIn) : undefined,
          handleOut: pt.handleOut ? shiftPt(pt.handleOut) : undefined,
        })),
      };
      commitUpdate({ ...template, paths: [...(template.paths || []), copy] });
      setSelection({ type: 'path', id: copy.id });
    }
    showToast('Pegado');
  }, [template, commitUpdate, showToast]);

  // ============================================
  // Arrastrar / redimensionar / rotar — toda la mecánica vive en el hook
  // ============================================
  const { startFieldDrag, startImageDrag, startShapeDrag } = useElementDrag({
    displayWidth,
    displayHeight,
    onUpdateField: handleUpdateField,
    onUpdateImage: handleUpdateImage,
    onUpdateShape: handleUpdateShape,
    onSelect: setSelection,
  });

  // Lógica compartida de "crear/subir elemento" — la usan la barra superior
  // (EditorToolbar) y el riel de iconos (CreationToolRail). El hook necesita
  // llamarse siempre (regla de hooks), así que si aún no hay plantilla le
  // pasamos un objeto vacío; nunca se usa porque más abajo hacemos el
  // return temprano cuando `!template`.
  const actions = useEditorActions({
    template: template ?? ({ fields: [], images: [], shapes: [], paths: [] } as unknown as Template),
    onUpdate: commitUpdate,
    isGuest,
    onSelect: setSelection,
  });

  // ============================================
  // Eliminar con teclado (Supr / Backspace) + Deshacer/Rehacer (Ctrl+Z)
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P → imprime el DISEÑO en A4 (no la pantalla de la app).
      // Va primero para que funcione incluso si el cursor está en un texto.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        printRef.current();
        return;
      }

      const target = e.target as HTMLElement;
      const isEditableTarget =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '');
      if (isEditableTarget) return;

      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
        return;
      }
      if (modKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (modKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (modKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      if (e.key === 'Escape' && activeTool === 'node') {
        // Salir de "Editar nodos" con Escape, igual que al hacer clic
        // fuera — antes se quedaba pegado hasta cambiar de herramienta
        // a mano.
        setActiveTool('select');
        setSelection(null);
        return;
      }

      if (!selection) return;
      if (selection.type === 'path' && activeTool === 'node') return; // lo maneja VectorCanvasLayer

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selection.type === 'field') handleDeleteField(selection.id);
        else if (selection.type === 'image') handleDeleteImage(selection.id);
        else if (selection.type === 'shape') handleDeleteShape(selection.id);
        else handleDeletePath(selection.id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selection, activeTool, handleDeleteField, handleDeleteImage, handleDeleteShape, handleDeletePath, handleUndo, handleRedo, handleCopy, handlePaste]);

  // ============================================
  // Guardado
  // ============================================
  const saveToCloud = useCallback(async (tpl: Template) => {
    if (isGuest || !user) return;

    try {
      const { error } = await supabase
        .from('templates')
        .upsert({
          id: tpl.id,
          name: tpl.name,
          image_url: tpl.image,
          nat_w: tpl.natW,
          nat_h: tpl.natH,
          fields: tpl.fields,
          images: tpl.images || [],
          shapes: tpl.shapes || [],
          paths: tpl.paths || [],
          category: (tpl as any).category || null,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving to cloud:', error);
    }
  }, [isGuest, user]);

  useEffect(() => {
    if (!template) return;

    if (isGuest) {
      const stored = localStorage.getItem('templates');
      if (stored) {
        const templates = JSON.parse(stored);
        const updated = templates.map((t: Template) => t.id === template.id ? template : t);
        localStorage.setItem('templates', JSON.stringify(updated));
      }
    } else {
      saveToCloud(template);
    }
  }, [template, isGuest, saveToCloud]);

  if (!template) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6">
        <div>
          <div className="font-semibold text-xl text-ink mb-2">Sin plantilla seleccionada</div>
          <p className="text-ink-soft text-sm mb-4">Elige una plantilla del catálogo o abre un trabajo existente</p>
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue text-white text-sm font-medium hover:bg-blue-dark transition-colors"
            >
              Ir a Inicio
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedField = selection?.type === 'field' ? template.fields.find(f => f.id === selection.id) : undefined;
  const selectedImage = selection?.type === 'image' ? images.find(i => i.id === selection.id) : undefined;
  const selectedShape = selection?.type === 'shape' ? shapes.find(s => s.id === selection.id) : undefined;
  const selectedPath = selection?.type === 'path' ? paths.find(p => p.id === selection.id) : undefined;
  const hasSelection = !!(selectedField || selectedImage || selectedShape || selectedPath);

  // Contenido del panel lateral que corresponde a `openPanel` según qué
  // tipo de elemento esté seleccionado — solo uno a la vez, nunca todo
  // junto (así no se siente como cabina de avión).
  const renderOpenPanel = () => {
    if (!openPanel) return null;
    if (selectedField) {
      if (openPanel === 'font') return <FieldFontPanel field={selectedField} onUpdate={(u) => handleUpdateField(selectedField.id, u)} onDelete={() => handleDeleteField(selectedField.id)} />;
      if (openPanel === 'effects') return <FieldEffectsPanel field={selectedField} onUpdate={(u) => handleUpdateField(selectedField.id, u)} onDelete={() => handleDeleteField(selectedField.id)} />;
    }
    if (selectedImage && openPanel === 'settings') {
      return <ImageSettingsPanel imgEl={selectedImage} onUpdate={(u) => handleUpdateImage(selectedImage.id, u)} onDelete={() => handleDeleteImage(selectedImage.id)} />;
    }
    if (selectedShape) {
      if (openPanel === 'fill') return <ShapeFillPanel shapeEl={selectedShape} onUpdate={(u) => handleUpdateShape(selectedShape.id, u)} onDelete={() => handleDeleteShape(selectedShape.id)} />;
      if (openPanel === 'border') return <ShapeBorderPanel shapeEl={selectedShape} onUpdate={(u) => handleUpdateShape(selectedShape.id, u)} onDelete={() => handleDeleteShape(selectedShape.id)} />;
    }
    if (selectedPath && openPanel === 'style') {
      return <PathStylePanel pathEl={selectedPath} onUpdate={(u) => handleUpdatePathProps(selectedPath.id, u)} onDelete={() => handleDeletePath(selectedPath.id)} onEditNodes={() => setActiveTool('node')} />;
    }
    return null;
  };
  const openPanelContent = renderOpenPanel();

  const layerActionBtn = "w-6 h-6 flex items-center justify-center rounded text-ink-soft hover:bg-slate-200 hover:text-ink transition-colors";

  // Lista de capas — de arriba (frente) hacia abajo (fondo), arrastrable
  // para reordenar, con botones de acceso directo (al frente/adelante/
  // atrás/al fondo) y clic para seleccionar y trabajar esa capa sin
  // afectar las demás.
  const renderLayersList = () => (
    <>
      <PanelHeader title="Capas" />
      <div className="overflow-y-auto p-1.5 flex flex-col gap-0.5">
        {[...layerOrder].reverse().map((li, revIdx) => {
          const idx = layerOrder.length - 1 - revIdx;
          const selected = isLayerSelected(li);
          return (
            <div
              key={layerKey(li)}
              draggable
              onDragStart={() => setDraggedLayerIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedLayerIdx !== null) reorderLayers(draggedLayerIdx, idx);
                setDraggedLayerIdx(null);
              }}
              onClick={() => selectLayer(li)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                selected ? 'bg-blue-light' : 'hover:bg-slate-50'
              }`}
            >
              <span className="text-ink-soft/50 cursor-grab flex-shrink-0"><IconDragHandle /></span>
              {layerThumbnail(li) ?? <span className="text-ink-soft flex-shrink-0">{layerIcon(li)}</span>}
              {li.type === 'field' && editingLayerId === li.id ? (
                <input
                  autoFocus
                  value={template.fields.find((f) => f.id === li.id)?.label || ''}
                  onChange={(e) => handleUpdateField(li.id, { label: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => setEditingLayerId(null)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setEditingLayerId(null); }}
                  className="text-xs text-ink flex-1 min-w-0 bg-white border border-blue rounded px-1.5 py-0.5 outline-none"
                />
              ) : (
                <span className="text-xs text-ink truncate flex-1 min-w-0">{layerLabel(li)}</span>
              )}
              {li.type === 'field' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingLayerId(editingLayerId === li.id ? null : li.id); }}
                  className={layerActionBtn}
                  title="Editar el texto"
                >
                  <IconPencilTiny />
                </button>
              )}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); moveLayer(li, 'front'); }} className={layerActionBtn} title="Traer al frente"><IconToFront /></button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(li, 'forward'); }} className={layerActionBtn} title="Adelante"><IconForward /></button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(li, 'backward'); }} className={layerActionBtn} title="Atrás"><IconBackward /></button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(li, 'back'); }} className={layerActionBtn} title="Enviar al fondo"><IconToBack /></button>
              </div>
            </div>
          );
        })}
        {layerOrder.length === 0 && (
          <p className="text-ink-soft text-xs text-center py-6">Todavía no hay elementos en el certificado.</p>
        )}
      </div>
    </>
  );

  const railBtn = "w-12 h-12 flex items-center justify-center rounded-md transition-colors text-black hover:bg-slate-100 flex-shrink-0";

  return (
    <div className="h-full flex flex-col">
      {/* Barra superior: formato del elemento seleccionado — flotante,
          igual que el riel de la izquierda. Alto fijo siempre reservado
          (haya o no selección) para que el área de trabajo no salte de
          posición cada vez que seleccionas/deseleccionas algo. */}
      <div className="flex-shrink-0 min-h-[60px] flex justify-center pt-2 px-3">
        {template.image && hasSelection && (
          <div className="bg-white border border-line shadow-md rounded-xl px-3 py-2 flex items-center gap-1 max-w-full overflow-x-auto no-scrollbar sm:overflow-x-auto">
            {selectedField && <FieldToolbarQuick field={selectedField} onUpdate={(u) => handleUpdateField(selectedField.id, u)} onDelete={() => handleDeleteField(selectedField.id)} openPanel={openPanel} onTogglePanel={setOpenPanel} />}
            {selectedImage && <ImageToolbarQuick imgEl={selectedImage} onUpdate={(u) => handleUpdateImage(selectedImage.id, u)} onDelete={() => handleDeleteImage(selectedImage.id)} openPanel={openPanel} onTogglePanel={setOpenPanel} />}
            {selectedShape && <ShapeToolbarQuick shapeEl={selectedShape} onUpdate={(u) => handleUpdateShape(selectedShape.id, u)} onDelete={() => handleDeleteShape(selectedShape.id)} openPanel={openPanel} onTogglePanel={setOpenPanel} />}
            {selectedPath && activeTool === 'select' && (
              <PathToolbarQuick
                pathEl={selectedPath}
                onUpdate={(u) => handleUpdatePathProps(selectedPath.id, u)}
                onDelete={() => handleDeletePath(selectedPath.id)}
                onEditNodes={() => setActiveTool('node')}
                openPanel={openPanel}
                onTogglePanel={setOpenPanel}
              />
            )}
          </div>
        )}
      </div>

      {/* Cuerpo: riel + canvas — una sola pieza, sin cajas dentro de cajas,
          ocupando todo el alto disponible bajo la barra de arriba. */}
      <div className="flex-1 min-h-0 flex">
        {template.image && (
          <div className="flex-shrink-0 self-center bg-white border border-line shadow-md rounded-xl p-1.5 flex flex-col gap-1 ml-2">
            <button
              onClick={() => actions.fileInputRef.current?.click()}
              disabled={actions.isUploading}
              title="Cambiar imagen de fondo"
              className={`${railBtn} disabled:opacity-50`}
            >
              {actions.isUploading ? <IconLoader /> : <IconChangeBackground />}
            </button>

            <div className="h-px bg-line my-1" />

            <CreationToolRail actions={actions} />

            <div className="h-px bg-line my-1" />

            {/* Herramientas de vector — colapsadas por defecto (son las
                menos usadas); un clic las despliega debajo. */}
            <button
              onClick={() => setVectorMenuOpen((o) => !o)}
              title="Herramientas de vector"
              className={`${railBtn} ${vectorMenuOpen ? 'bg-black text-white' : ''}`}
            >
              <IconVectorGroup />
            </button>
            {vectorMenuOpen && (
              <div className="flex flex-col gap-1 pt-1 mt-0.5 border-t border-line">
                <VectorToolRail
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  nodeEditEnabled={selection?.type === 'path'}
                />
              </div>
            )}

            <input ref={actions.fileInputRef} type="file" accept="image/png,image/jpeg" onChange={actions.handleFileSelect} className="hidden" />
          </div>
        )}

        {/* Panel lateral (Fuente/Efectos/Relleno/Borde/...) — columna a la
            izquierda del canvas en escritorio, como en Canva. En celular
            se muestra abajo como hoja emergente en vez de achicar el
            certificado (era el problema que notaste en modo móvil). */}
        {openPanelContent && !isMobile && (
          <div className="flex-shrink-0 self-center max-h-full overflow-hidden flex flex-col bg-white border border-line shadow-md rounded-xl ml-2 w-64">
            {openPanelContent}
          </div>
        )}

        <div ref={canvasWrapperRef} className="flex-1 min-w-0 relative bg-paper overflow-hidden">
          {/* El zoom puede hacer que el contenido sea más grande que este
              contenedor; el scroll vive en un div INTERNO separado del que
              medimos con ResizeObserver. Si midiéramos el mismo div que
              tiene la barra de scroll, aparecer/desaparecer la barra
              cambia el ancho medido, lo que recalcula el zoom de ajuste,
              lo que vuelve a mostrar/ocultar la barra... y así se genera
              el "temblor" en 120% de zoom. */}
          <div className="w-full h-full overflow-auto no-scrollbar">
          {!template.image ? (
            <div className="h-full p-4">
              <EditorToolbar actions={actions} />
            </div>
          ) : (
            <>
              <div className="w-full h-full flex items-center justify-center p-4">
                <div
                  ref={previewRef}
                  className="relative flex-shrink-0 shadow-sm select-none"
                  style={{ width: displayWidth || '100%', height: displayHeight || 'auto', minHeight: 160, WebkitUserSelect: 'none' }}
                  onMouseDown={() => {
                    // Clic en el fondo del lienzo: suelta la selección y,
                    // si estabas editando nodos, vuelve a "Selección" para
                    // poder usar el resto de las herramientas de nuevo
                    // (antes se quedaba pegado en modo edición de vectores).
                    if (activeTool === 'select') setSelection(null);
                    else if (activeTool === 'node') { setActiveTool('select'); setSelection(null); }
                  }}
                >
                  <img
                    src={template.image}
                    alt="Template background"
                    draggable={false}
                    className="w-full h-full object-contain pointer-events-none"
                  />

                  {shapes.map((shapeEl) => (
                    <ShapeElement
                      key={shapeEl.id}
                      shapeEl={shapeEl}
                      isSelected={selection?.type === 'shape' && selection.id === shapeEl.id}
                      left={shapeEl.x * displayWidth}
                      top={shapeEl.y * displayHeight}
                      width={shapeEl.w * displayWidth}
                      height={shapeEl.h * displayHeight}
                      zIndex={zIndexFor('shape', shapeEl.id)}
                      onStartDrag={(e, handle) => startShapeDrag(e, shapeEl, handle)}
                    />
                  ))}

                  <VectorCanvasLayer
                    paths={[...paths].sort((a, b) => zIndexFor('path', a.id) - zIndexFor('path', b.id))}
                    activeTool={activeTool}
                    displayWidth={displayWidth}
                    displayHeight={displayHeight}
                    selectedPathId={selection?.type === 'path' ? selection.id : null}
                    zIndex={paths.length ? Math.max(...paths.map((p) => zIndexFor('path', p.id))) : 0}
                    onSelectPath={(id) => setSelection(id ? { type: 'path', id } : null)}
                    onAddPath={handleAddPath}
                    onUpdatePath={handleUpdatePathPoints}
                    onFinishPenTool={() => setActiveTool('select')}
                    onEnterNodeEdit={() => setActiveTool('node')}
                  />

                  {images.map((imgEl) => (
                    <ImageElement
                      key={imgEl.id}
                      imgEl={imgEl}
                      isSelected={selection?.type === 'image' && selection.id === imgEl.id}
                      left={imgEl.x * displayWidth}
                      top={imgEl.y * displayHeight}
                      width={imgEl.w * displayWidth}
                      height={imgEl.h * displayHeight}
                      zIndex={zIndexFor('image', imgEl.id)}
                      onStartDrag={(e, handle) => startImageDrag(e, imgEl, handle)}
                    />
                  ))}

                  {template.fields.map((field) => (
                    <FieldElement
                      key={field.id}
                      field={field}
                      isSelected={selection?.type === 'field' && selection.id === field.id}
                      left={field.x * displayWidth}
                      top={field.y * displayHeight}
                      width={field.w * displayWidth}
                      scale={scale}
                      zIndex={zIndexFor('field', field.id)}
                      onLabelChange={(newLabel) => handleUpdateField(field.id, { label: newLabel })}
                      onSelect={() => setSelection({ type: 'field', id: field.id })}
                      onStartDrag={(e, handle) => startFieldDrag(e, field, handle)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          </div>

          {/* Botones flotantes arriba a la derecha: Imprimir y Capas */}
          {template.image && (
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={() => printRef.current()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md text-xs font-medium transition-colors bg-white text-ink border border-line hover:bg-slate-50"
                title="Imprimir en hoja A4 (Ctrl+P)"
              >
                <IconPrint /> Imprimir
              </button>
              {layerOrder.length > 0 && (
                <button
                  onClick={() => setShowLayers((o) => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md text-xs font-medium transition-colors ${
                    showLayers ? 'bg-black text-white' : 'bg-white text-ink border border-line hover:bg-slate-50'
                  }`}
                  title="Capas"
                >
                  <IconLayers /> Capas
                </button>
              )}
            </div>
          )}

          {/* Zoom — barra ancha y arrastrable, abajo a la derecha; fuera
              del área con scroll para que se quede fija en la esquina.
              El número también se puede escribir/editar con el teclado. */}
          {template.image && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-white border border-line rounded-full shadow-md px-3 py-1.5">
              <input
                type="number"
                min={Math.round(ZOOM_MIN * 100)}
                max={Math.round(ZOOM_MAX * 100)}
                value={Math.round(zoom * 100)}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  if (!Number.isNaN(pct)) {
                    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct / 100)));
                  }
                }}
                className="w-11 text-[11px] text-ink text-center border border-line rounded px-1 py-0.5 outline-none focus:border-blue"
                title="Escribe el zoom (%)"
              />
              <span className="text-[10px] text-ink-soft select-none">%</span>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-36 accent-blue cursor-grab active:cursor-grabbing"
                title="Arrastra para hacer zoom"
              />
              {zoom !== 1 && (
                <button onClick={() => setZoom(1)} className="text-[9px] text-blue hover:underline flex-shrink-0">
                  Auto
                </button>
              )}
            </div>
          )}
        </div>

        {/* Panel de capas (escritorio) — columna a la derecha del canvas,
            se puede mostrar/ocultar con el botón "Capas". */}
        {showLayers && !isMobile && (
          <div className="flex-shrink-0 self-center max-h-full flex flex-col bg-white border border-line shadow-md rounded-xl mr-2 w-64 my-2">
            {renderLayersList()}
          </div>
        )}
      </div>

      {/* Hoja emergente — en celular ya NO ocupa todo el ancho ni tapa el
          riel de herramientas de la izquierda: empieza justo después de
          él, y su ancho/alto se ajustan a lo que necesita mostrar. */}
      {openPanelContent && isMobile && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpenPanel(null)}>
          <div
            className="absolute left-[76px] bottom-3 min-w-[240px] w-fit max-w-[calc(100vw-92px)] max-h-[75vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {openPanelContent}
          </div>
        </div>
      )}

      {/* Capas en celular — mismo criterio: no tapa el riel, ancho y alto
          según lo que tenga (sin forzar que empiece a media pantalla). */}
      {showLayers && isMobile && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setShowLayers(false)}>
          <div
            className="absolute left-[76px] bottom-3 min-w-[240px] w-fit max-w-[calc(100vw-92px)] max-h-[75vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {renderLayersList()}
          </div>
        </div>
      )}
    </div>
  );
};
