import { useCallback } from 'react';
import { createWorker, type Worker } from 'tesseract.js';
import { useActaStore } from '../store/actaStore';
import { cargarCanvas } from '../utils/cropImage';
import { parsearActa } from '../utils/parsearActa';
import { analizarCelda, binarizarCelda, medianaLuma } from '../utils/analizarCelda';
import { celdaNueva } from '../utils/celdas';
import {
  ELECCIONES,
  type ActaElectoral, type BoundingBox, type CampoNumerico, type CeldaVoto, type Columnas, type VotoOrganizacion,
} from '../types/acta';

const base = import.meta.env.BASE_URL;
let workerPromise: Promise<Worker> | null = null;
let silenciar = false; // mientras se leen celdas, el logger de Tesseract no pisa el progreso propio

// Worker único reutilizable. Todo se sirve desde /public (sin CDN, sin red).
function obtenerWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;
  const p: Promise<Worker> = createWorker('spa', 1, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/core`,
    langPath: `${base}tessdata`,
    workerBlobURL: false,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      const s = useActaStore.getState();
      if (s.procesando && !silenciar) s.setProcesando(true, m.progress ?? 0, m.status);
    },
  }).catch((e: unknown) => {
    workerPromise = null; // permitir reintento
    throw e;
  });
  workerPromise = p;
  return p;
}

const modoPagina = { tessedit_char_whitelist: '', tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' };
const modoDigitos = { tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' };

async function leerDigitosW(w: Worker, canvas: HTMLCanvasElement) {
  const { data } = await w.recognize(canvas);
  return { texto: data.text.replace(/\D/g, ''), confianza: (data.confidence ?? 0) / 100 };
}

// Una celda: 1) análisis de píxeles (negro / blanco / escrito)  2) si hay escritura, OCR de dígitos.
async function leerCelda(
  w: Worker, canvas: HTMLCanvasElement, box: BoundingBox, mediana: number, ciudadanos: number,
): Promise<CeldaVoto> {
  const a = analizarCelda(canvas, box, mediana);
  const base: CeldaVoto = { ...celdaNueva(), estado: a.estado, tinta: a.tinta, oscuro: a.oscuro, confianza: a.confianza, bbox: box };
  if (a.estado !== 'MANUSCRITO') return { ...base, valor: 0, valor_ocr: 0 };

  const r = await leerDigitosW(w, binarizarCelda(canvas, box, mediana));
  if (!r.texto) return { ...base, valor: null, valor_ocr: null, confianza: 0.2 }; // hay tinta pero no se leyó número
  const valor = parseInt(r.texto.slice(0, 4), 10);
  let conf = Math.min(0.9, r.confianza); // el OCR nunca llega a "seguro" con manuscritos
  if (r.texto.length > 3) conf *= 0.5;
  if (ciudadanos > 0 && valor > ciudadanos) conf = Math.min(conf, 0.35); // heurística: más votos que votantes
  return { ...base, valor, valor_ocr: valor, confianza: conf };
}

async function leerCeldasActa(canvas: HTMLCanvasElement, acta: ActaElectoral, columnas: Columnas) {
  const w = await obtenerWorker();
  const mediana = medianaLuma(canvas);
  const store = useActaStore.getState();
  const total = (acta.organizaciones.length + acta.filas_totales.length) * 2;
  let n = 0;
  silenciar = true;
  await w.setParameters(modoDigitos as any);
  try {
    const organizaciones: VotoOrganizacion[] = [];
    for (const o of acta.organizaciones) {
      const out = { ...o };
      if (o.fila_y) {
        for (const e of ELECCIONES) {
          store.setProcesando(true, ++n / total, `Leyendo celdas ${n}/${total}…`);
          const c = columnas[e];
          out[e] = await leerCelda(w, canvas, { x: c.x0, y: o.fila_y.y0, w: c.x1 - c.x0, h: o.fila_y.y1 - o.fila_y.y0 }, mediana, acta.ciudadanos_votaron);
        }
      }
      organizaciones.push(out);
    }
    // Blancos / nulos / impugnados: mismas columnas, filas inferiores.
    const campos: Partial<Record<CampoNumerico, { valor: number; conf: number }>> = {};
    for (const f of acta.filas_totales) {
      for (const e of ELECCIONES) {
        store.setProcesando(true, ++n / total, `Leyendo celdas ${n}/${total}…`);
        const c = columnas[e];
        const celda = await leerCelda(w, canvas, { x: c.x0, y: f.y0, w: c.x1 - c.x0, h: f.y1 - f.y0 }, mediana, acta.ciudadanos_votaron);
        campos[`${f.clave}_${e}` as CampoNumerico] = { valor: celda.valor ?? 0, conf: celda.confianza };
      }
    }
    return { organizaciones, campos };
  } finally {
    silenciar = false;
    await w.setParameters(modoPagina as any);
  }
}

export function useOCR() {
  const procesando = useActaStore((s) => s.procesando);

  const ejecutarOCR = useCallback(async () => {
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina || !s.archivo) return;
    s.setProcesando(true, 0, 'Inicializando OCR local…');
    try {
      const w = await obtenerWorker();
      await w.setParameters(modoPagina as any);
      const { data } = await w.recognize(pagina.url);
      s.setProcesando(true, 1, 'Ubicando filas, columnas y firmas…');
      const canvas = await cargarCanvas(pagina.url);
      const acta = parsearActa(data, canvas, { hash: s.archivo.hash, nombre: s.archivo.nombre });
      useActaStore.getState().setActa(acta);
      const l = await leerCeldasActa(canvas, acta, acta.columnas);
      useActaStore.getState().aplicarLectura(l.organizaciones, acta.columnas, l.campos);
      useActaStore.getState().setProcesando(
        false, 1,
        acta.columnas_confiables
          ? `OCR completo: ${acta.organizaciones.length} filas leídas.`
          : `${acta.organizaciones.length} filas leídas, pero NO se ubicaron las columnas: calibre las columnas y re-lea.`,
      );
    } catch (e) {
      useActaStore.getState().setProcesando(false, 0, `Error de OCR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Re-lee todas las celdas con columnas calibradas a mano.
  const releerCeldas = useCallback(async (columnas: Columnas) => {
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina || !s.acta) return;
    s.setProcesando(true, 0, 'Re-leyendo celdas…');
    try {
      const canvas = await cargarCanvas(pagina.url);
      const l = await leerCeldasActa(canvas, s.acta, columnas);
      useActaStore.getState().aplicarLectura(l.organizaciones, columnas, l.campos, true);
      useActaStore.getState().setProcesando(false, 1, 'Celdas re-leídas con las columnas calibradas.');
    } catch (e) {
      useActaStore.getState().setProcesando(false, 0, `Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Re-lectura de UNA celda (comparador), con la tinta aislada.
  const releerCelda = useCallback(async (box: BoundingBox) => {
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina) return { texto: '', confianza: 0 };
    const w = await obtenerWorker();
    const canvas = await cargarCanvas(pagina.url);
    silenciar = true;
    await w.setParameters(modoDigitos as any);
    try {
      return await leerDigitosW(w, binarizarCelda(canvas, box, medianaLuma(canvas)));
    } finally {
      silenciar = false;
      await w.setParameters(modoPagina as any);
    }
  }, []);

  return { ejecutarOCR, releerCeldas, releerCelda, ocupado: procesando };
}
