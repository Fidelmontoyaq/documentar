import { useMemo, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { compararActas, estadoCuadre, veredicto } from '../utils/comparar';
import type { ActaGuardada } from '../types/acta';

// Si el acta no cuadra se sube la misma acta reescrita: aquí se contrastan y se ve cuál cuadra.
export default function ComparadorActas() {
  const { versiones, acta, archivo, quitarVersion } = useActaStore();
  const etiquetaActual = String.fromCharCode(65 + versiones.length);
  const todas: ActaGuardada[] = useMemo(
    () => [...versiones, ...(acta && archivo ? [{ id: 'actual', etiqueta: etiquetaActual, archivo, acta }] : [])],
    [versiones, acta, archivo, etiquetaActual],
  );
  const [ia, setIa] = useState<number | null>(null);
  const [ib, setIb] = useState<number | null>(null);
  const [soloDif, setSoloDif] = useState(true);

  if (!todas.length) return null;
  const a = Math.min(ia ?? Math.max(0, todas.length - 2), todas.length - 1);
  const b = Math.min(ib ?? todas.length - 1, todas.length - 1);
  const diffs = todas.length >= 2 ? compararActas(todas[a].acta, todas[b].acta) : [];
  const mostrar = soloDif ? diffs.filter((d) => d.cambia) : diffs;

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <h3 className="text-sm font-bold text-gray-700">Comparación de actas (original vs reescrita)</h3>
      <p className="text-xs text-gray-500">Cuando un acta no cuadra, cargue la misma acta reescrita: la anterior se guarda como versión y aquí se contrasta.</p>

      <p className={`rounded border p-2 text-sm font-semibold ${todas.length < 2 ? 'border-gray-300 bg-gray-50 text-gray-600' : todas.some((t) => estadoCuadre(t).ambas) ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>
        {veredicto(versiones, acta, etiquetaActual)}
      </p>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {todas.map((t) => {
          const e = estadoCuadre(t);
          const mesa = t.acta.mesa || 'sin mesa';
          return (
            <div key={t.id} className={`rounded border p-2 text-xs ${e.ambas ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
              <p className="font-bold">Acta {t.etiqueta}{t.id === 'actual' ? ' (actual)' : ''} · mesa {mesa}</p>
              <p className="truncate text-gray-600">{t.archivo.nombre}</p>
              <p>Ciudadanos que votaron: <b>{t.acta.ciudadanos_votaron}</b></p>
              <p className={e.provincial ? 'text-green-700' : 'text-red-700'}>{e.provincial ? '✓' : '✗'} Provincial {e.provincial ? 'cuadra' : `no cuadra (${e.dif_prov > 0 ? '+' : ''}${e.dif_prov})`}</p>
              <p className={e.distrital ? 'text-green-700' : 'text-red-700'}>{e.distrital ? '✓' : '✗'} Distrital {e.distrital ? 'cuadra' : `no cuadra (${e.dif_dist > 0 ? '+' : ''}${e.dif_dist})`}</p>
              {t.id !== 'actual' && <button onClick={() => quitarVersion(t.id)} className="mt-1 underline">quitar versión</button>}
            </div>
          );
        })}
      </div>

      {todas.length >= 2 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            Comparar
            <select value={a} onChange={(e) => setIa(Number(e.target.value))} className="rounded border px-1 py-0.5">
              {todas.map((t, i) => <option key={t.id} value={i}>Acta {t.etiqueta}</option>)}
            </select>
            con
            <select value={b} onChange={(e) => setIb(Number(e.target.value))} className="rounded border px-1 py-0.5">
              {todas.map((t, i) => <option key={t.id} value={i}>Acta {t.etiqueta}</option>)}
            </select>
            <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> solo diferencias ({diffs.filter((d) => d.cambia).length})</label>
          </div>
          {todas[a].acta.mesa && todas[b].acta.mesa && todas[a].acta.mesa !== todas[b].acta.mesa && (
            <p className="rounded border border-red-400 bg-red-100 p-2 text-xs text-red-800">⛔ Las actas son de mesas distintas ({todas[a].acta.mesa} ≠ {todas[b].acta.mesa}).</p>
          )}
          <div className="max-h-72 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-100 uppercase text-gray-700">
                <tr><th className="px-2 py-1">Campo</th><th className="px-2 py-1 text-center">Acta {todas[a].etiqueta}</th><th className="px-2 py-1 text-center">Acta {todas[b].etiqueta}</th></tr>
              </thead>
              <tbody>
                {mostrar.length === 0 && <tr><td colSpan={3} className="px-2 py-2 text-gray-500">Sin diferencias entre ambas lecturas.</td></tr>}
                {mostrar.map((d) => (
                  <tr key={d.clave} className={`border-t ${d.cambia ? 'bg-amber-50' : ''}`}>
                    <td className="px-2 py-1">{d.etiqueta}</td>
                    <td className="px-2 py-1 text-center font-mono">{d.a}</td>
                    <td className={`px-2 py-1 text-center font-mono ${d.cambia ? 'font-bold text-amber-800' : ''}`}>{d.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
