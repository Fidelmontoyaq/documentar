export type EstadoLectura =
  | 'CONFIABLE'
  | 'VERIFICACION_ASISTIDA'
  | 'REVISION_MANUAL'
  | 'OBSERVADO_TRAZO_DUDOSO'
  | 'CRITICO_BORRON';

export interface BoundingBox {
  x: number; // píxeles sobre la imagen de la página
  y: number;
  w: number;
  h: number;
}

// El acta tiene DOS elecciones, cada una con su columna de votos.
export type Eleccion = 'provincial' | 'distrital';
export const ELECCIONES: Eleccion[] = ['provincial', 'distrital'];

// MANUSCRITO = hay número escrito (tinta azul o negra)
// VACIA      = casilla en blanco → nadie votó → vale 0
// ANULADA    = casilla tapada en negro → NO cuenta (vale 0 y no se exige)
export type EstadoCelda = 'MANUSCRITO' | 'VACIA' | 'ANULADA';

export interface CeldaVoto {
  estado: EstadoCelda;
  valor: number | null; // valor vigente (editable)
  valor_ocr: number | null; // lectura original (evidencia forense)
  confianza: number; // 0..1
  tinta: number; // fracción de píxeles con tinta
  oscuro: number; // fracción de píxeles casi negros (relleno)
  bbox?: BoundingBox;
  verificada: boolean; // el fiscalizador la confirmó/corrigió
}

export interface VotoOrganizacion {
  id: string;
  codigo: string; // N° de orden de la organización
  nombre_partido: string;
  provincial: CeldaVoto;
  distrital: CeldaVoto;
  fila_y?: { y0: number; y1: number }; // banda vertical de la fila en la imagen
}

export interface MiembroMesa {
  rol: 'PRESIDENTE' | 'SECRETARIO' | 'TERCER_MIEMBRO';
  nombre: string | null;
  dni: string | null;
  firma_detectada: boolean;
  nivel_confianza: number;
  densidad_firma?: number;
  roi_firma?: BoundingBox;
  firma_confirmada_manual?: boolean;
}

export type EstadoActa = 'APROBADA' | 'APROBADA_CON_OBSERVACIONES' | 'ENVIADA_A_JURADO';

export type Columnas = Record<Eleccion, { x0: number; x1: number }>;

export interface FilaTotal {
  clave: 'blanco' | 'nulos' | 'impugnados';
  y0: number;
  y1: number;
}

export type CampoNumerico =
  | 'electores_habiles'
  | 'ciudadanos_votaron'
  | 'blanco_provincial'
  | 'nulos_provincial'
  | 'impugnados_provincial'
  | 'blanco_distrital'
  | 'nulos_distrital'
  | 'impugnados_distrital';

export type CampoTexto = 'mesa' | 'departamento' | 'provincia' | 'distrito';

export interface ActaElectoral {
  mesa: string;
  departamento: string;
  provincia: string;
  distrito: string;
  electores_habiles: number;
  ciudadanos_votaron: number;
  blanco_provincial: number;
  nulos_provincial: number;
  impugnados_provincial: number;
  blanco_distrital: number;
  nulos_distrital: number;
  impugnados_distrital: number;
  miembros_mesa: MiembroMesa[];
  organizaciones: VotoOrganizacion[];
  hash_sha256: string;
  estado_acta: EstadoActa;
  observaciones: string[];
  nombre_archivo: string;
  confianza_campos: Partial<Record<CampoNumerico, number>>;
  columnas: Columnas; // posición X de las dos columnas de votos
  columnas_confiables: boolean; // false = se usaron valores por defecto → calibrar
  filas_totales: FilaTotal[]; // filas de blancos / nulos / impugnados
}

export interface PaginaActa {
  url: string;
  width: number;
  height: number;
}

export interface Seleccion {
  id: string;
  eleccion: Eleccion;
}

export interface CambioAuditoria {
  campo: string;
  antes: unknown;
  despues: unknown;
}

export interface EntradaAuditoria {
  id?: number;
  timestamp: string;
  usuario: string;
  accion: string;
  hash_acta: string | null;
  cambios: CambioAuditoria[];
}

export interface ResumenEleccion {
  validos: number;
  emitidos: number;
  diferencia: number; // emitidos - ciudadanos que votaron
  cuadra: boolean;
}

export interface ResumenValidacion {
  por_eleccion: Record<Eleccion, ResumenEleccion>;
  firmas: number;
  cuadra: boolean; // cuadran ambas elecciones
  excede_habiles: boolean;
  dni_ok: boolean;
  celdas_pendientes: number;
  errores: string[];
  avisos: string[];
  estado: EstadoActa;
}
