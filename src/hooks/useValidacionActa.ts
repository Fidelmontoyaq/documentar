import { useMemo } from 'react';
import { ELECCIONES, type ActaElectoral, type Eleccion, type ResumenEleccion, type ResumenValidacion } from '../types/acta';
import { aporte, pendiente } from '../utils/celdas';

const NOMBRE: Record<Eleccion, string> = { provincial: 'PROVINCIAL', distrital: 'DISTRITAL' };

// Función pura (también la usa el store y el comparador de actas).
// Negro = no cuenta · Vacío = 0 · Con voto = valor escrito.
// REGLA PRINCIPAL: por cada elección, votos válidos + blancos + nulos + impugnados = ciudadanos que votaron.
export function validarActa(a: ActaElectoral): ResumenValidacion {
  const por = {} as Record<Eleccion, ResumenEleccion>;
  for (const e of ELECCIONES) {
    const validos = a.organizaciones.reduce((s, o) => s + aporte(o[e]), 0);
    const emitidos = validos + a[`blanco_${e}`] + a[`nulos_${e}`] + a[`impugnados_${e}`];
    const escrito = a[`emitidos_escrito_${e}`];
    por[e] = { validos, emitidos, diferencia: emitidos - a.ciudadanos_votaron, cuadra: emitidos === a.ciudadanos_votaron, escrito, escrito_ok: escrito === emitidos };
  }
  const firmas = a.miembros_mesa.filter((m) => m.firma_detectada).length;
  const excede_habiles = a.electores_habiles > 0 && a.ciudadanos_votaron > a.electores_habiles;
  const datos_ok = a.miembros_mesa.every((m) => m.datos_presentes);
  const dni_ok = a.miembros_mesa.every((m) => m.dni_presente);
  const sinValor = a.organizaciones.reduce((s, o) => s + ELECCIONES.filter((e) => o[e].estado === 'MANUSCRITO' && o[e].valor === null).length, 0);
  const celdas_pendientes = a.organizaciones.reduce((s, o) => s + ELECCIONES.filter((e) => pendiente(o[e])).length, 0);

  const errores: string[] = [];
  const avisos: string[] = [];
  if (firmas < 3) errores.push(`INCOMPLETA: solo ${firmas}/3 firmas de miembros de mesa.`);
  if (excede_habiles) errores.push(`EXCESO DE VOTANTES: ciudadanos que votaron (${a.ciudadanos_votaron}) > electores hábiles (${a.electores_habiles}).`);
  for (const e of ELECCIONES) {
    const r = por[e];
    if (!r.cuadra) errores.push(`NO CUADRA ${NOMBRE[e]}: votos sumados (${r.emitidos}) ≠ ciudadanos que votaron (${a.ciudadanos_votaron}); diferencia ${r.diferencia > 0 ? '+' : ''}${r.diferencia}.`);
    if (r.escrito > 0 && !r.escrito_ok) avisos.push(`${NOMBRE[e]}: el TOTAL DE VOTOS EMITIDOS escrito (${r.escrito}) no coincide con la suma (${r.emitidos}).`);
  }
  if (sinValor > 0) errores.push(`${sinValor} celda(s) con número escrito pero ilegible.`);
  if (a.ciudadanos_votaron === 0) avisos.push('Ciudadanos que votaron: no se leyó ningún valor.');
  if (a.electores_habiles === 0) avisos.push('Electores hábiles no leídos: no se pudo validar el límite de votantes.');
  if (!datos_ok) avisos.push('Falta nombres/apellidos de algún miembro de mesa.');
  if (!dni_ok) avisos.push('Falta el DNI de algún miembro de mesa.');
  if (a.observaciones_escritas) avisos.push('El acta tiene texto en el recuadro de OBSERVACIONES: léalo.');
  if (celdas_pendientes > 0) avisos.push(`${celdas_pendientes} celda(s) con lectura dudosa sin verificar por el fiscalizador.`);

  const estado = errores.length ? 'ENVIADA_A_JURADO' : avisos.length ? 'APROBADA_CON_OBSERVACIONES' : 'APROBADA';
  return { por_eleccion: por, firmas, cuadra: ELECCIONES.every((e) => por[e].cuadra), excede_habiles, datos_ok, dni_ok, celdas_pendientes, errores, avisos, estado };
}

export function useValidacionActa(acta: ActaElectoral | null): ResumenValidacion | null {
  return useMemo(() => (acta ? validarActa(acta) : null), [acta]);
}
