import { useEffect, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { recortar } from '../utils/cropImage';
import type { MiembroMesa } from '../types/acta';

const ROL: Record<string, string> = { PRESIDENTE: 'Presidente', SECRETARIO: 'Secretario', TERCER_MIEMBRO: '3.er Miembro' };

function Fila({ ok, texto, onChange }: { ok: boolean; texto: string; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-1 ${ok ? 'text-green-700' : 'text-red-700'}`}>
      <input type="checkbox" checked={ok} onChange={(e) => onChange(e.target.checked)} />
      {ok ? '✓' : '✗'} {texto}
    </label>
  );
}

export default function PanelFirmas() {
  const { acta, setMiembro, paginas, paginaActual } = useActaStore();
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const pagina = paginas[paginaActual];

  useEffect(() => {
    let vivo = true;
    if (!acta || !pagina) return;
    void Promise.all(acta.miembros_mesa.map(async (m) => {
      if (!m.caja) return [m.rol, ''] as const;
      const c = await recortar(pagina.url, m.caja, { margenPx: 0, anchoMin: 360 });
      return [m.rol, c.toDataURL('image/jpeg', 0.85)] as const;
    })).then((r) => vivo && setFotos(Object.fromEntries(r)));
    return () => { vivo = false; };
  }, [acta?.hash_sha256, pagina?.url, acta?.miembros_mesa.map((m) => `${m.caja?.x}${m.caja?.y}${m.caja?.w}${m.caja?.h}`).join()]);

  if (!acta) return null;
  const firmas = acta.miembros_mesa.filter((m) => m.firma_detectada).length;
  const cambiar = (rol: MiembroMesa['rol'], patch: Partial<MiembroMesa>) => setMiembro(rol, { ...patch, confirmado_manual: true });

  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Miembros de mesa · la firma es lo más importante</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${firmas === 3 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>Firmas {firmas}/3</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {acta.miembros_mesa.map((m) => (
          <div key={m.rol} className={`space-y-1 rounded border p-2 text-xs ${m.firma_detectada ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <p className="font-bold">{ROL[m.rol]}</p>
            {fotos[m.rol] && <img src={fotos[m.rol]} alt={`Recuadro ${ROL[m.rol]}`} className="w-full rounded border bg-white" />}
            <Fila ok={m.firma_detectada} texto={`Firma (tinta ${(m.densidad_firma * 100).toFixed(1)} %)`} onChange={(v) => cambiar(m.rol, { firma_detectada: v })} />
            <Fila ok={m.datos_presentes} texto="Nombres y apellidos" onChange={(v) => cambiar(m.rol, { datos_presentes: v })} />
            <Fila ok={m.dni_presente} texto="DNI" onChange={(v) => cambiar(m.rol, { dni_presente: v })} />
            {m.confirmado_manual && <p className="text-[10px] text-gray-500">confirmado manualmente</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
