// Tipos compartidos por el motor del editor de documentos y sus componentes.

/** Una tipografía del catálogo disponible en los selectores de fuente. */
export interface FontDefinition {
  label: string;
  value: string;
}

/** Los 4 presets de margen expresados como clases de Tailwind (padding). */
export type MarginPresetClass =
  | 'p-[25mm_20mm]'
  | 'p-[12mm_10mm]'
  | 'p-[35mm_30mm]'
  | 'p-[5mm]';

/** Margen activo: por clase de Tailwind (preset) o personalizado en cm. */
export type CurrentMargin =
  | { type: 'class'; value: MarginPresetClass }
  | { type: 'custom'; value: number };

/** Valor seleccionado en el <select> de márgenes del panel lateral. */
export type MarginSelectValue = MarginPresetClass | 'custom';

/** Cuántas imágenes se colocan por hoja durante una carga masiva. */
export type ImagesPerPageMode = 'current' | '1' | '2';

/** Orientación de una hoja. */
export type PageOrientation = 'portrait' | 'landscape';

/** Formas de acomodar varias imágenes dentro de una hoja. */
export type ArrangeLayoutId =
  | 'cols'
  | 'rows'
  | 'half-h'
  | 'half-v'
  | 'h-60-40'
  | 'h-70-30'
  | 'v-60-40'
  | 'v-70-30'
  | 'grid'
  | 'flex';

/** Tipo de elemento flotante que se puede colocar sobre una hoja. */
export type FloatingBoxType = 'image' | 'text' | 'caption' | 'shape' | 'frame';

/** Geometría de una forma o marco. */
export type ShapeKind = 'rect' | 'rounded' | 'ellipse';

/** Propiedades editables de una forma o marco (se muestran en la barra superior). */
export interface ShapeState {
  kind: ShapeKind;
  /** Si la forma está rellena (si no, solo se ve el borde). */
  fillOn: boolean;
  fill: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
  /** Lados con borde: [arriba, derecha, abajo, izquierda]. */
  sides: [boolean, boolean, boolean, boolean];
  /** Radio de esquinas como % del lado menor (0–50). */
  radiusPct: number;
  /** Solo marcos: ya tiene una imagen dentro. */
  frameFilled: boolean;
}

/** A qué se le está mostrando la barra de herramientas contextual. */
export type ToolbarTargetKind = 'text' | 'box' | null;

/** Estado de la selección, publicado por el motor para la barra superior. */
export interface ToolbarState {
  kind: ToolbarTargetKind;
  /** Verdadero si el objetivo es un elemento flotante (imagen/texto/pie de foto). */
  isBox: boolean;
  boxType: FloatingBoxType | null;
  fontFamily: string;
  fontSize: string;
  /** Color de relleno de la casilla (hex) o '' si no tiene. */
  fill: string;
  /** Separación imagen–pie de foto en px (null si no aplica). */
  captionGap: number | null;
  /** Si la imagen seleccionada está actualmente en modo recorte. */
  cropping: boolean;
  /** Si la imagen seleccionada tiene un recorte aplicado (aunque no esté en modo recorte ahora). */
  hasCrop: boolean;
  /** Esquinas redondeadas (% del lado menor) de una imagen; null si no aplica. */
  imageRadiusPct: number | null;
  /** Datos de la forma o marco seleccionado; null si no es ninguno. */
  shape: ShapeState | null;
}

/** Callbacks con los que el motor avisa a React de cambios de estado. */
export interface DocumentEditorEngineListeners {
  onPageCountChange?: (count: number) => void;
  /** Cantidad de imágenes en la hoja activa (para habilitar el botón Ordenar). */
  onActiveImagesChange?: (count: number) => void;
  onToolbarStateChange?: (state: ToolbarState | null) => void;
  onFontUsed?: (fontFamily: string) => void;
  onLoadingChange?: (loading: { show: boolean; title: string; status: string }) => void;
  onError?: (message: string) => void;
  onHistoryChange?: (h: { canUndo: boolean; canRedo: boolean }) => void;
  onZoomChange?: (percent: number) => void;
  onPageInfoChange?: (info: PageInfo | null) => void;
}

/** Datos de la hoja/lienzo activo, publicados por el motor para el panel de lienzo. */
export interface PageInfo {
  w: number;
  h: number;
  kind: 'doc' | 'design';
  /** 'white', 'transparent' o un color #rrggbb. */
  bg: string;
  /** En lienzos de diseño: si se muestran título, texto y pie de página. */
  hf: boolean;
  pdf: boolean;
  images: number;
  snap: boolean;
  grid: boolean;
}

export interface ExportOptions {
  format: 'pdf' | 'png' | 'jpg';
  scope: 'page' | 'all';
  /** Multiplicador de resolución: 1 = tamaño exacto del lienzo en píxeles. */
  scale: number;
}
