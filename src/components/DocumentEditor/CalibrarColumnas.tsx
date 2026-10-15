import { useEffect, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { ELECCIONES, type Columnas, type Eleccion } from '../types/acta';

// Permite ajustar a mano dónde están las dos columnas de votos (en % del ancho de la página).
// Las bandas se ven en vivo sobre el visor; "Re-leer celdas" aplica el cambio.
export default function CalibrarColumnas() {
  const { acta, paginas, paginaActual, setColumnasGuia, procesando } = useActaStore();
  const { releerCeldas } = useOCR();
  const W = paginas[paginaActual]?.width ?? 0;
  const [pct, setPct] = useState<Record<Eleccion, [number, number]> | null>(null);

  useEffect(() => {
    if (!acta || !W) return;
    setPct({
      provincial: [(acta.columnas.provincial.x0 / W) * 100, (acta.columnas.provincial.x1 / W) * 100],
      distrital: [(acta.columnas.distrital.x0 / W) * 100, (acta.columnas.distrital.x1 / W) * 100],
    });
  }, [acta?.columnas, W]);

  if (!acta || !pct || !W) return null;

  const aColumnas = (p: Record<Eleccion, [number, number]>): Columnas => ({
    provincial: { x0: (p.provincial[0] / 100) * W, x1: (p.provincial[1] / 100) * W },
    distrital: { x0: (p.distrital[0] / 100) * W, x1: (p.distrital[1] / 100) * W },
  });
  const cambiar = (e: Eleccion, i: 0 | 1, v: number) => {
    const n = { ...pct, [e]: i === 0 ? [v, pct[e][1]] : [pct[e][0], v] } as Record<Eleccion, [number, number]>;
    setPct(n);
    setColumnasGuia(aColumnas(n));
  };
  const aplicar = () => {
    const hay = acta.organizaciones.some((o) => o.provincial.verificada || o.distrital.verificada);
    if (hay && !confirm('Re-leer sobrescribe las celdas ya verificadas manualmente. ¿Continuar?')) return;
    void releerCeldas(aColumnas(pct));
  };

  return (
    <div className={`rounded-lg border p-3 text-xs ${acta.columnas_confiables ? 'bg-white' : 'border-amber-400 bg-amber-50'}`}>
      <p className="mb-1 font-bold text-gray-700">Calibrar columnas de votos (% del ancho de la página)</p>
      {!acta.columnas_confiables && (
        <p className="mb-2 text-amber-900">No se encontraron los encabezados PROVINCIAL / DISTRITAL: ajuste las bandas sobre el visor hasta que cubran cada columna y pulse «Re-leer celdas».</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {ELECCIONES.map((e) => (
          <div key={e} className="space-y-1">
            <p className="font-semibold uppercase">{e}</p>
            {([0, 1] as const).map((i) => (
              <label key={i} className="flex items-center gap-2">
                <span className="w-12">{i === 0 ? 'Inicio' : 'Fin'}</span>
                <input type="range" min={0} max={100} step={0.1} value={pct[e][i]} onChange={(ev) => cambiar(e, i, Number(ev.target.value))} className="flex-1" />
                <span className="w-10 font-mono">{pct[e][i].toFixed(1)}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <button onClick={aplicar} disabled={procesando} className="mt-2 w-full rounded bg-blue-800 px-3 py-1.5 font-semibold text-white disabled:opacity-40">
        Re-leer celdas con estas columnas
      </button>
    </div>
  );
}
