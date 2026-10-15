import { useMemo } from 'react';
import { ELECCIONES, type ActaElectoral, type Eleccion, type ResumenEleccion, type ResumenValidacion } from '../types/acta';
import { aporte, pendiente } from '../utils/celdas';

const NOMBRE: Record<Eleccion, string> = { provincial: 'PROVINCIAL', distrital: 'DISTRITAL' };

// Función pura (la usa también el store para recalcular el estado tras cada edición).
// Reglas: ANULADA (negro) no cuenta · VACIA = 0 · MANUSCRITO = valor escrito.
// Cada elección debe cuadrar: válidos + blancos + nulos + impugnados = ciudadanos que votaron.
export function validarActa(a: ActaElectoral): ResumenValidacion {
  const por = {} as Record<Eleccion, ResumenEleccion>;
  for (const e of ELECCIONES) {
    const validos = a.organizaciones.reduce((s, o) => s + aporte(o[e]), 0);
    const emitidos = validos + a[`blanco_${e}`] + a[`nulos_${e}`] + a[`impugnados_${e}`];
    const diferencia = emitidos - a.ciudadanos_votaron;
    por[e] = { validos, emitidos, diferencia, cuadra: diferencia === 0 };
  }
  const firmas = a.miembros_mesa.filter((m) => m.firma_detectada).length;
  const excede_habiles = a.electores_habiles > 0 && a.ciudadanos_votaron > a.electores_habiles;
  const dni_ok = a.miembros_mesa.every((m) => !!m.dni && /^\d{8}$/.test(m.dni));
  const sinValor = a.organizaciones.reduce(
    (s, o) => s + ELECCIONES.filter((e) => o[e].estado === 'MANUSCRITO' && o[e].valor === null).length, 0);
  const celdas_pendientes = a.organizaciones.reduce(
    (s, o) => s + ELECCIONES.filter((e) => pendiente(o[e])).length, 0);

  const errores: string[] = [];
  const avisos: string[] = [];
  if (firmas < 3) errores.push(`INCOMPLETA: solo ${firmas}/3 firmas de miembros de mesa.`);
  if (excede_habiles)
    errores.push(`EXCESO DE VOTANTES: ciudadanos que votaron (${a.ciudadanos_votaron}) > electores hábiles (${a.electores_habiles}).`);
  for (const e of ELECCIONES) {
    const r = por[e];
    if (!r.cuadra)
      errores.push(`INCONSISTENCIA ${NOMBRE[e]}: votos emitidos (${r.emitidos}) ≠ ciudadanos que votaron (${a.ciudadanos_votaron}); diferencia ${r.diferencia > 0 ? '+' : ''}${r.diferencia}.`);
  }
  if (sinValor > 0) errores.push(`${sinValor} celda(s) con número escrito pero ilegible.`);
  if (a.electores_habiles === 0) avisos.push('Electores hábiles no leídos: no se pudo validar el límite de votantes.');
  if (!dni_ok) avisos.push('Algún DNI de miembro de mesa es ilegible o no tiene 8 dígitos.');
  if (celdas_pendientes > 0) avisos.push(`${celdas_pendientes} celda(s) con lectura dudosa sin verificar por el fiscalizador.`);

  const estado = errores.length ? 'ENVIADA_A_JURADO' : avisos.length ? 'APROBADA_CON_OBSERVACIONES' : 'APROBADA';
  return {
    por_eleccion: por, firmas, cuadra: ELECCIONES.every((e) => por[e].cuadra),
    excede_habiles, dni_ok, celdas_pendientes, errores, avisos, estado,
  };
}

export function useValidacionActa(acta: ActaElectoral | null): ResumenValidacion | null {
  return useMemo(() => (acta ? validarActa(acta) : null), [acta]);
}
