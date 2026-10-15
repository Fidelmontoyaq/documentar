import { useEffect, useMemo, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { recortar } from '../utils/cropImage';
import { aporte } from '../utils/celdas';
import { CLASE_BADGE, ETIQUETA, clasificarConfianza } from '../utils/clasificarConfianza';

export default function ComparadorCasosDificiles() {
  const { acta, paginas, paginaActual, seleccion, actualizarCelda } = useActaStore();
  const { releerCelda, ocupado } = useOCR();
  const org = acta?.organizaciones.find((o) => o.id === seleccion?.id);
  const e = seleccion?.eleccion;
  const celda = org && e ? org[e] : undefined;
  const pagina = paginas[paginaActual];

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [valor, setValor] = useState('');
  const [zoom, setZoom] = useState(1);
  const [lectura, setLectura] = useState<{ texto: string; confianza: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    setCanvas(null);
    setLectura(null);
    setValor(celda?.estado === 'MANUSCRITO' && celda.valor != null ? String(celda.valor) : '');
    if (celda?.bbox && pagina) recortar(pagina.url, celda.bbox, { margenPx: 12, anchoMin: 360 }).then((c) => vivo && setCanvas(c));
    return () => { vivo = false; };
  }, [org?.id, e, pagina?.url]);

  const dataUrl = useMemo(() => (canvas ? canvas.toDataURL('image/png') : null), [canvas]);

  if (!acta || !org || !e || !celda) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
        Comparador de casos difíciles: pulse 🔍 en una celda de la tabla o una caja sobre el visor.
      </div>
    );
  }

  // Corrección aritmética: valor de ESTA celda que cuadra la elección, si las demás son correctas.
  const sumaOtras = acta.organizaciones.reduce((s, o) => s + (o.id === org.id ? 0 : aporte(o[e])), 0);
  const fijos = acta[`blanco_${e}`] + acta[`nulos_${e}`] + acta[`impugnados_${e}`];
  const sugerido = acta.ciudadanos_votaron - sumaOtras - fijos;
  const sugeridoValido = sugerido >= 0;

  const hipotetico = valor === '' ? null : parseInt(valor, 10);
  const diff = hipotetico === null || Number.isNaN(hipotetico) ? null : sumaOtras + hipotetico + fijos - acta.ciudadanos_votaron;
  const nivel = clasificarConfianza(celda.confianza);

  const aplicar = () => {
    if (hipotetico === null || Number.isNaN(hipotetico)) return;
    actualizarCelda(org.id, e, { estado: 'MANUSCRITO', valor: hipotetico });
  };
  const releer = async () => { if (celda.bbox) setLectura(await releerCelda(celda.bbox)); };

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-sm font-bold text-gray-700">
        Comparador · {org.codigo} {org.nombre_partido} · <span className="uppercase">{e}</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border p-2">
          <p className="mb-1 text-xs font-semibold">1 · Recorte original</p>
          {dataUrl ? (
            <>
              <div className="max-h-40 overflow-auto rounded border bg-gray-50">
                <img src={dataUrl} alt="Recorte de la celda" style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
              </div>
              <input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(ev) => setZoom(Number(ev.target.value))} className="mt-1 w-full" />
            </>
          ) : (
            <p className="text-xs text-gray-400">Sin recuadro de lectura.</p>
          )}
        </div>

        <div className="rounded border p-2 text-xs">
          <p className="mb-1 font-semibold">2 · Lectura automática</p>
          <p className="text-2xl font-bold">
            {celda.estado === 'ANULADA' ? 'NEGRO' : celda.estado === 'VACIA' ? 'VACÍO' : celda.valor_ocr ?? '—'}
          </p>
          <p>Confianza: {Math.round(celda.confianza * 100)} % · tinta {(celda.tinta * 100).toFixed(1)} %</p>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 font-semibold ${CLASE_BADGE[nivel]}`}>{ETIQUETA[nivel]}</span>
          <button onClick={() => void releer()} disabled={!celda.bbox || ocupado} className="mt-2 block w-full rounded border px-2 py-1 disabled:opacity-40">
            Re-leer celda (solo dígitos)
          </button>
          {lectura && (
            <p className="mt-1">
              Re-lectura: <b>{lectura.texto || '∅'}</b> ({Math.round(lectura.confianza * 100)} %){' '}
              {lectura.texto && <button className="underline" onClick={() => setValor(lectura.texto.slice(0, 4))}>usar</button>}
            </p>
          )}
        </div>

        <div className="rounded border p-2 text-xs">
          <p className="mb-1 font-semibold">3 · Sugerido aritmético</p>
          <p className={`text-2xl font-bold ${sugeridoValido ? 'text-blue-700' : 'text-gray-400'}`}>{sugeridoValido ? sugerido : 'n/a'}</p>
          <p className="text-gray-500">Valor de esta celda que cuadra con «ciudadanos que votaron», si las demás son correctas.</p>
          {sugeridoValido && <button onClick={() => setValor(String(sugerido))} className="mt-1 rounded border px-2 py-0.5">Usar sugerido</button>}
          <label className="mt-2 block font-semibold">Corrección del fiscalizador</label>
          <div className="flex gap-1">
            <input type="number" min={0} value={valor} onChange={(ev) => setValor(ev.target.value)} className="w-full rounded border px-1 py-1 font-bold" />
            <button onClick={aplicar} className="rounded bg-blue-800 px-2 py-1 font-semibold text-white">Aplicar</button>
          </div>
          {diff !== null && (
            <p className={`mt-1 rounded p-1 font-semibold ${diff === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {diff === 0 ? '✓ Con este valor la elección cuadra.' : `⚠ Sigue sin cuadrar (${diff > 0 ? '+' : ''}${diff}).`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
