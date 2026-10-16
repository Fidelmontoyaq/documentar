import { useActaStore } from '../store/actaStore';
import { useValidacionActa } from '../hooks/useValidacionActa';
import { CLASE_BADGE, CLASE_FILA, ETIQUETA, clasificarConfianza } from '../utils/clasificarConfianza';
import { ELECCIONES, type Eleccion, type EstadoCelda, type VotoOrganizacion } from '../types/acta';

const TITULO: Record<Eleccion, string> = { provincial: 'Municipal PROVINCIAL', distrital: 'Municipal DISTRITAL' };

// Editor de una celda: negro (no cuenta) / vacío (0) / con voto escrito.
function Celda({ o, e }: { o: VotoOrganizacion; e: Eleccion }) {
  const { actualizarCelda, confirmarCelda, seleccionar, seleccion } = useActaStore();
  const c = o[e];
  const nivel = clasificarConfianza(c.confianza);
  const sel = seleccion?.id === o.id && seleccion.eleccion === e;

  const cambiarEstado = (est: EstadoCelda) =>
    actualizarCelda(o.id, e, est === 'MANUSCRITO' ? { estado: est, valor: c.valor_ocr ?? c.valor } : { estado: est, valor: 0 });

  return (
    <div className={`space-y-0.5 rounded p-1 ${CLASE_FILA[nivel]} ${sel ? 'outline outline-2 outline-blue-500' : ''}`}>
      <div className="flex items-center gap-1">
        {c.estado === 'ANULADA' ? (
          <span className="w-14 rounded bg-gray-800 px-1 py-1 text-center text-[10px] font-bold text-white">NEGRO</span>
        ) : (
          <input
            type="number" min={0} placeholder="0"
            value={c.estado === 'VACIA' ? '' : c.valor ?? ''}
            onChange={(ev) =>
              ev.target.value === ''
                ? actualizarCelda(o.id, e, c.estado === 'VACIA' ? {} : { valor: null })
                : actualizarCelda(o.id, e, { estado: 'MANUSCRITO', valor: Math.max(0, parseInt(ev.target.value, 10) || 0) })
            }
            className="w-14 rounded border bg-white px-1 py-0.5 text-center font-bold"
          />
        )}
        <select value={c.estado} onChange={(ev) => cambiarEstado(ev.target.value as EstadoCelda)} className="rounded border bg-white px-0.5 py-0.5 text-[10px]">
          <option value="MANUSCRITO">Con voto</option>
          <option value="VACIA">Vacío = 0</option>
          <option value="ANULADA">Negro (no cuenta)</option>
        </select>
        <button onClick={() => seleccionar({ id: o.id, eleccion: e })} className="rounded border bg-white px-1" title="Comparar con el original">🔍</button>
        <button onClick={() => confirmarCelda(o.id, e)} className="rounded border bg-white px-1" title="Confirmar">✔</button>
      </div>
      <div className="flex items-center gap-1 text-[10px]">
        {c.verificada ? (
          <span className="rounded bg-blue-600 px-1 font-semibold text-white">VERIFICADO</span>
        ) : (
          <span className={`rounded px-1 font-semibold ${CLASE_BADGE[nivel]}`}>{ETIQUETA[nivel]}</span>
        )}
        <span className="font-mono text-gray-500">{Math.round(c.confianza * 100)} %</span>
        {c.estado === 'MANUSCRITO' && c.valor_ocr !== null && c.valor_ocr !== c.valor && <span className="text-gray-500">OCR: {c.valor_ocr}</span>}
      </div>
    </div>
  );
}

export default function TablaOrganizaciones() {
  const { acta, actualizarOrg, agregarOrg, eliminarOrg } = useActaStore();
  const resumen = useValidacionActa(acta);
  if (!acta || !resumen) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Conteo y asignación de votos (editable)</h3>
        <button onClick={agregarOrg} className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50">＋ Agregar fila</button>
      </div>
      <p className="mb-1 text-[11px] text-gray-500">Negro = no cuenta · Vacío = nadie votó (0) · Con voto = número escrito a lapicero.</p>
      <div className="max-h-[420px] overflow-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-100 uppercase text-gray-700">
            <tr>
              <th className="px-2 py-2">N°</th>
              <th className="px-2 py-2">Organización política</th>
              {ELECCIONES.map((e) => <th key={e} className="px-2 py-2 text-center">{TITULO[e]}</th>)}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {acta.organizaciones.map((o) => (
              <tr key={o.id} className="border-t align-top">
                <td className="px-2 py-1">
                  <input value={o.codigo} onChange={(ev) => actualizarOrg(o.id, { codigo: ev.target.value })} className="w-10 rounded border bg-white px-1 py-0.5" />
                </td>
                <td className="px-2 py-1">
                  <input value={o.nombre_partido} placeholder="(nombre no leído)" onChange={(ev) => actualizarOrg(o.id, { nombre_partido: ev.target.value.toUpperCase() })} className="w-full min-w-[140px] rounded border bg-white px-1 py-0.5" />
                </td>
                {ELECCIONES.map((e) => <td key={e} className="px-1 py-1"><Celda o={o} e={e} /></td>)}
                <td className="px-1 py-1"><button onClick={() => eliminarOrg(o.id)} className="rounded border bg-white px-1.5 py-0.5" title="Eliminar fila">✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-gray-100 font-semibold">
            <tr className="border-t">
              <td colSpan={2} className="px-2 py-1">Total votos válidos</td>
              {ELECCIONES.map((e) => <td key={e} className="px-2 py-1 text-center">{resumen.por_eleccion[e].validos}</td>)}
              <td />
            </tr>
            <tr>
              <td colSpan={2} className="px-2 py-1">Blancos · Nulos · Impugnados</td>
              {ELECCIONES.map((e) => (
                <td key={e} className="px-2 py-1 text-center">{acta[`blanco_${e}`]} · {acta[`nulos_${e}`]} · {acta[`impugnados_${e}`]}</td>
              ))}
              <td />
            </tr>
            <tr>
              <td colSpan={2} className="px-2 py-1">Total votos emitidos (calculado)</td>
              {ELECCIONES.map((e) => (
                <td key={e} className={`px-2 py-1 text-center ${resumen.por_eleccion[e].cuadra ? 'text-green-700' : 'text-red-700'}`}>{resumen.por_eleccion[e].emitidos}</td>
              ))}
              <td />
            </tr>
            <tr>
              <td colSpan={2} className="px-2 py-1">Total emitido ESCRITO en el acta</td>
              {ELECCIONES.map((e) => (
                <td key={e} className={`px-2 py-1 text-center ${resumen.por_eleccion[e].escrito_ok ? 'text-green-700' : 'text-red-700'}`}>{acta[`emitidos_escrito_${e}`]}</td>
              ))}
              <td />
            </tr>
            <tr>
              <td colSpan={2} className="px-2 py-1">Ciudadanos que votaron · Electores hábiles</td>
              <td colSpan={2} className="px-2 py-1 text-center">{acta.ciudadanos_votaron} · {acta.electores_habiles}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
