import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { COLOR_ZONA, ETIQUETA_ZONA, ZONAS } from '../utils/plantilla';

// Zonas de trabajo = los recuadros azules. Se detectan solas, pero se pueden redibujar sobre el acta.
export default function PanelZonas() {
  const { zonas, zonaActiva, setZonaActiva, nOrganizaciones, setNOrg, procesando } = useActaStore();
  const { detectarZonas } = useOCR();
  if (!zonas) return null;

  return (
    <div className="rounded-lg border bg-white p-3 text-xs">
      <p className="mb-1 font-bold text-gray-700">Zonas de trabajo (recuadros)</p>
      <p className="mb-2 text-gray-500">
        Pulse una zona y <b>dibuje un rectángulo</b> sobre el acta si la detectada no coincide. Las líneas punteadas muestran en vivo las filas y los 3 casilleros
        (centena · decena · unidad); deben caer sobre los casilleros impresos. Luego pulse «Leer acta».
      </p>
      <div className="flex flex-wrap gap-1">
        {ZONAS.map((n) => (
          <button key={n} disabled={procesando} onClick={() => setZonaActiva(zonaActiva === n ? null : n)}
            className={`rounded border px-2 py-1 font-semibold ${zonaActiva === n ? 'text-white' : 'bg-white'}`}
            style={{ borderColor: COLOR_ZONA[n], background: zonaActiva === n ? COLOR_ZONA[n] : undefined, color: zonaActiva === n ? undefined : COLOR_ZONA[n] }}>
            ✎ {ETIQUETA_ZONA[n]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          N.° de organizaciones
          <input type="number" min={1} max={60} value={nOrganizaciones} onChange={(e) => setNOrg(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))} className="w-14 rounded border px-1 py-0.5 text-center font-bold" />
          <span className="text-gray-500">(+ blancos, nulos, impugnados y total)</span>
        </label>
        <button disabled={procesando} onClick={() => void detectarZonas()} className="rounded border bg-white px-2 py-1 disabled:opacity-40">Detectar zonas automáticamente</button>
      </div>
    </div>
  );
}
