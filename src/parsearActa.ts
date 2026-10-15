import type { ActaElectoral, BoundingBox, CampoNumerico, Columnas, FilaTotal, MiembroMesa, VotoOrganizacion } from '../types/acta';
import { detectarFirmas } from './detectarFirmas';
import { celdaNueva } from './celdas';

interface Palabra { t: string; conf: number; x0: number; y0: number; x1: number; y1: number }
interface Linea { texto: string; conf: number; palabras: Palabra[] }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function extraerLineas(data: any): Linea[] {
  const crudas: any[] =
    data.lines ?? (data.blocks ?? []).flatMap((b: any) => (b.paragraphs ?? []).flatMap((p: any) => p.lines ?? []));
  return crudas
    .map((l) => ({
      texto: String(l.text ?? '').trim(),
      conf: (l.confidence ?? 0) / 100,
      palabras: (l.words ?? []).map((w: any) => ({
        t: String(w.text ?? '').trim(),
        conf: (w.confidence ?? 0) / 100,
        x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1,
      })) as Palabra[],
    }))
    .filter((l) => l.texto.length > 0);
}

// Confusiones típicas de OCR en dígitos (O↔0, I↔1, S↔5...). Solo se usa para totales impresos.
const MAPA: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', B: '8', G: '6' };
function leerNumero(texto: string): { valor: number; corregido: boolean } | null {
  const t = norm(texto).replace(/[.,;:_]/g, '');
  if (!/^[0-9OQDIL|ZSBG]{1,4}$/.test(t) || !/[0-9]/.test(t)) return null;
  let corregido = false;
  const limpio = t.replace(/[^0-9]/g, (c) => { corregido = true; return MAPA[c]; });
  return { valor: parseInt(limpio, 10), corregido };
}
function ultimoNumero(l: Linea) {
  for (let i = l.palabras.length - 1; i >= 0; i--) {
    const r = leerNumero(l.palabras[i].t);
    if (r) return { ...r, conf: l.palabras[i].conf };
  }
  return null;
}
function buscarCampo(lineas: Linea[], patron: RegExp): { valor: number; conf: number } | null {
  for (let i = 0; i < lineas.length; i++) {
    if (!patron.test(norm(lineas[i].texto))) continue;
    const n = ultimoNumero(lineas[i]);
    if (n) return { valor: n.valor, conf: n.conf * (n.corregido ? 0.85 : 1) };
    const sig = lineas[i + 1] && ultimoNumero(lineas[i + 1]);
    if (sig) return { valor: sig.valor, conf: sig.conf * 0.9 };
  }
  return null;
}
function campoTexto(texto: string, clave: string, paradas: string): string {
  const m = new RegExp(`${clave}\\s*[:\\-]?\\s*([A-Z ]{3,40}?)\\s*(?:\\||${paradas}|\\d|$)`).exec(texto);
  return m ? m[1].trim() : '';
}

const PROHIBIDAS = /ELECTORES|CIUDADANOS|VOTOS|TOTAL|BLANCO|NULO|IMPUGNAD|MESA|PRESIDENTE|SECRETARIO|MIEMBRO|FIRMA|DNI|ORGANIZACION/;

const ROLES = [
  { rol: 'PRESIDENTE', clave: 'PRESIDENTE' },
  { rol: 'SECRETARIO', clave: 'SECRETARIO' },
  { rol: 'TERCER_MIEMBRO', clave: 'TERCER' },
] as const;

// Distancia vertical entre filas: se toma de las filas detectadas (tolera filas intermedias perdidas).
function estimarPaso(ys: number[], porDefecto: number): number {
  if (ys.length < 2) return porDefecto;
  const d = ys.slice(1).map((y, i) => y - ys[i]).filter((x) => x > 4).sort((a, b) => a - b);
  if (!d.length) return porDefecto;
  const base = d[Math.floor(d.length * 0.25)];
  const r = d.map((x) => x / Math.max(1, Math.round(x / base)));
  return r.reduce((a, b) => a + b, 0) / r.length;
}

// Ubica las dos columnas de votos usando los encabezados "MUNICIPAL PROVINCIAL" / "MUNICIPAL DISTRITAL".
// Si no los encuentra devuelve valores por defecto y ok=false → el usuario debe calibrar.
function detectarColumnas(lineas: Linea[], yPrimeraFila: number, W: number): { col: Columnas; ok: boolean } {
  const palabras = lineas.flatMap((l) => l.palabras);
  const buscar = (kw: string) =>
    palabras
      .filter((w) => norm(w.t).replace(/[^A-Z]/g, '').startsWith(kw) && w.y1 <= yPrimeraFila + 5)
      .sort((a, b) => b.y0 - a.y0)[0];
  const prov = buscar('PROVINCIAL');
  const dist = buscar('DISTRITAL');
  if (!prov || !dist) {
    return { col: { provincial: { x0: 0.55 * W, x1: 0.67 * W }, distrital: { x0: 0.68 * W, x1: 0.8 * W } }, ok: false };
  }
  const span = (k: Palabra) => {
    const izq = palabras
      .filter((w) => /^MUNICIPAL/.test(norm(w.t)) && Math.abs(w.y0 - k.y0) < k.y1 - k.y0 && w.x1 <= k.x0 + 2 && k.x0 - w.x1 < 0.04 * W)
      .sort((a, b) => b.x1 - a.x1)[0];
    const x0 = izq ? izq.x0 : k.x0 - 0.35 * (k.x1 - k.x0);
    const pad = 0.03 * (k.x1 - x0);
    return { x0: x0 - pad, x1: k.x1 + pad };
  };
  return { col: { provincial: span(prov), distrital: span(dist) }, ok: dist.x0 > prov.x1 };
}

export function parsearActa(
  data: any,
  canvas: HTMLCanvasElement,
  meta: { hash: string; nombre: string },
): ActaElectoral {
  const lineas = extraerLineas(data);
  const textoNorm = lineas.map((l) => norm(l.texto)).join(' | ');
  const W = canvas.width;
  const H = canvas.height;

  // --- Cabecera (heurística; editable) ---
  const mesa = /MESA\D{0,30}(\d{6})/.exec(textoNorm)?.[1] ?? /\b(\d{6})\b/.exec(textoNorm)?.[1] ?? '';
  const departamento = campoTexto(textoNorm, 'DEPARTAMENTO', 'PROVINCIA|DISTRITO|MESA');
  const provincia = campoTexto(textoNorm, 'PROVINCIA', 'DEPARTAMENTO|DISTRITO|MESA');
  const distrito = campoTexto(textoNorm, 'DISTRITO', 'DEPARTAMENTO|PROVINCIA|MESA');

  // --- Totales impresos/manuscritos de una sola cifra ---
  const confianza_campos: Partial<Record<CampoNumerico, number>> = {};
  const tomar = (campo: CampoNumerico, patron: RegExp): number => {
    const r = buscarCampo(lineas, patron);
    confianza_campos[campo] = r ? r.conf : 0;
    return r ? r.valor : 0;
  };
  const electores_habiles = tomar('electores_habiles', /ELECTORES\s+HABILES/);
  const ciudadanos_votaron = tomar('ciudadanos_votaron', /CIUDADANOS\s+(QUE\s+)?VOTARON|TOTAL\s+CIUDADANOS/);

  // --- Filas de organizaciones: la fila se ubica por el N° de orden + nombre (columna izquierda) ---
  interface Cand { codigo: number; palabras: Palabra[]; yc: number; h: number }
  const cand: Cand[] = [];
  for (const l of lineas) {
    const p = l.palabras;
    if (p.length < 2 || !/^\d{1,2}$/.test(p[0].t) || p[0].x0 > 0.2 * W) continue;
    if (!p.slice(1).some((w) => /[A-ZÁÉÍÓÚÑ]{3,}/i.test(w.t))) continue;
    cand.push({ codigo: parseInt(p[0].t, 10), palabras: p.slice(1), yc: (p[0].y0 + p[0].y1) / 2, h: p[0].y1 - p[0].y0 });
  }
  cand.sort((a, b) => a.yc - b.yc);

  const { col: columnas, ok: columnas_confiables } = detectarColumnas(lineas, cand[0]?.yc ?? 0, W);
  const limiteNombre = columnas.provincial.x0 - 0.035 * W; // el nombre termina antes del logo

  const conNombre = cand
    .map((c) => {
      const toks: string[] = [];
      for (const w of c.palabras) {
        if (w.x1 > limiteNombre) break;
        const t = w.t.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ.&'-]/g, '');
        if (!t || (t.length < 2 && t !== '-' && t !== 'Y')) break;
        toks.push(t);
      }
      return { ...c, nombre: toks.join(' ') };
    })
    .filter((c) => c.nombre.length >= 4 && !PROHIBIDAS.test(norm(c.nombre)));

  const organizaciones: VotoOrganizacion[] = [];
  let paso = 0;
  let yUltima = 0;
  if (conNombre.length) {
    const primero = conNombre[0];
    paso = estimarPaso(conNombre.map((c) => c.yc), Math.max(20, primero.h * 1.6));
    const porIdx = new Map<number, (typeof conNombre)[number]>();
    for (const c of conNombre) {
      const f = (c.yc - primero.yc) / paso;
      const idx = Math.round(f);
      if (Math.abs(f - idx) <= 0.3 && !porIdx.has(idx)) porIdx.set(idx, c);
    }
    const ultimo = Math.max(...porIdx.keys());
    for (let i = 0; i <= ultimo; i++) {
      const c = porIdx.get(i);
      const yc = c ? c.yc : primero.yc + i * paso; // fila perdida por el OCR → se interpola
      yUltima = yc;
      organizaciones.push({
        id: crypto.randomUUID(),
        codigo: String(primero.codigo + i).padStart(2, '0'),
        nombre_partido: c ? c.nombre : '',
        provincial: celdaNueva(),
        distrital: celdaNueva(),
        fila_y: { y0: yc - paso * 0.46, y1: yc + paso * 0.46 },
      });
    }
  }

  // --- Filas de totales (blancos / nulos / impugnados) debajo de la tabla ---
  const filas_totales: FilaTotal[] = [];
  const defs: { clave: FilaTotal['clave']; re: RegExp }[] = [
    { clave: 'blanco', re: /BLANCO/ }, { clave: 'nulos', re: /NULO/ }, { clave: 'impugnados', re: /IMPUGNAD/ },
  ];
  for (const d of defs) {
    const l = lineas.find((x) => x.palabras.length && d.re.test(norm(x.texto)) &&
      Math.min(...x.palabras.map((w) => w.y0)) > yUltima);
    if (!l) continue;
    const y0 = Math.min(...l.palabras.map((w) => w.y0));
    const y1 = Math.max(...l.palabras.map((w) => w.y1));
    const yc = (y0 + y1) / 2;
    const hb = Math.max((paso || 30) * 0.46, (y1 - y0) * 0.8);
    filas_totales.push({ clave: d.clave, y0: yc - hb, y1: yc + hb });
  }

  // --- Miembros de mesa: nombre, DNI y firma (densidad de tinta) ---
  const miembros_mesa: MiembroMesa[] = ROLES.map((r, i) => {
    const idx = lineas.findIndex((l) => norm(l.texto).includes(r.clave));
    const ventana = idx >= 0 ? lineas.slice(idx, idx + 3) : [];
    let dni: string | null = null;
    let dniConf = 0;
    for (const l of ventana) {
      const w = l.palabras.find((q) => q.t.replace(/\D/g, '').length === 8);
      if (w) { dni = w.t.replace(/\D/g, ''); dniConf = w.conf; break; }
    }
    let nombre: string | null = null;
    if (idx >= 0) {
      const limpio = norm(lineas[idx].texto)
        .replace(/PRESIDENTE|SECRETARIO|TERCER|MIEMBRO|DE|MESA|DNI|NOMBRES?|APELLIDOS?/g, ' ')
        .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (limpio.length >= 5) nombre = limpio;
    }
    const etiqueta = ventana[0]?.palabras.find((q) => norm(q.t).startsWith(r.clave));
    const roi: BoundingBox = etiqueta
      ? { x: Math.max(0, etiqueta.x0 - 0.04 * W), y: Math.max(0, etiqueta.y0 - 0.08 * H), w: 0.3 * W, h: 0.075 * H }
      : { x: (0.04 + 0.32 * i) * W, y: 0.82 * H, w: 0.28 * W, h: 0.1 * H };
    const f = detectarFirmas(canvas, roi);
    return {
      rol: r.rol, nombre, dni,
      firma_detectada: f.detectada,
      nivel_confianza: dni ? Math.min(f.confianza, dniConf || f.confianza) : Math.min(f.confianza, 0.5),
      densidad_firma: f.densidad, roi_firma: roi, firma_confirmada_manual: false,
    };
  });

  return {
    mesa, departamento, provincia, distrito,
    electores_habiles, ciudadanos_votaron,
    blanco_provincial: 0, nulos_provincial: 0, impugnados_provincial: 0,
    blanco_distrital: 0, nulos_distrital: 0, impugnados_distrital: 0,
    miembros_mesa, organizaciones,
    hash_sha256: meta.hash,
    estado_acta: 'ENVIADA_A_JURADO',
    observaciones: [],
    nombre_archivo: meta.nombre,
    confianza_campos,
    columnas, columnas_confiables, filas_totales,
  };
}
