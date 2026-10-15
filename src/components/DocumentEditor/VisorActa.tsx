import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useActaStore } from '../store/actaStore';
import { COLOR_CAJA, clasificarConfianza } from '../utils/clasificarConfianza';
import { ELECCIONES } from '../types/acta';

export default function VisorActa() {
  const { paginas, paginaActual, setPaginaActual, acta, seleccion, seleccionar, columnasGuia } = useActaStore();
  const pagina = paginas[paginaActual];

  if (!pagina) {
    return (
      <div className="flex h-[640px] items-center justify-center rounded border bg-gray-50 text-sm text-gray-400">
        Sin documento cargado
      </div>
    );
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="rounded border bg-gray-100">
      <TransformWrapper minScale={0.5} maxScale={8} centerOnInit wheel={{ step: 0.15 }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex items-center gap-1 border-b bg-white p-1 text-xs">
              <button onClick={() => zoomIn()} className="rounded border px-2 py-1">＋</button>
              <button onClick={() => zoomOut()} className="rounded border px-2 py-1">－</button>
              {/* "Ajustar": reencuadra tanto escaneos a hoja completa como imágenes pequeñas */}
              <button onClick={() => resetTransform()} className="rounded border px-2 py-1">Ajustar</button>
              {paginas.length > 1 && (
                <span className="ml-auto flex items-center gap-1">
                  <button disabled={paginaActual === 0} onClick={() => setPaginaActual(paginaActual - 1)} className="rounded border px-2 py-1 disabled:opacity-40">‹</button>
                  Pág. {paginaActual + 1}/{paginas.length}
                  <button disabled={paginaActual === paginas.length - 1} onClick={() => setPaginaActual(paginaActual + 1)} className="rounded border px-2 py-1 disabled:opacity-40">›</button>
                </span>
              )}
            </div>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: 640 }}
              contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* El wrapper toma exactamente el tamaño de la imagen → los overlays en % no se desalinean */}
              <div className="relative inline-block max-w-full">
                <img
                  src={pagina.url}
                  alt="Acta electoral escaneada"
                  draggable={false}
                  className="block max-w-full object-contain"
                  style={{ maxHeight: 620, width: 'auto', height: 'auto' }}
                />
                {/* Bandas de las dos columnas de votos (calibración) */}
                {columnasGuia && acta && acta.organizaciones.length > 0 && (() => {
                  const ys = acta.organizaciones.flatMap((o) => (o.fila_y ? [o.fila_y.y0, o.fila_y.y1] : []));
                  if (!ys.length) return null;
                  const y0 = Math.min(...ys);
                  const y1 = Math.max(...ys);
                  return ELECCIONES.map((e) => (
                    <div
                      key={`guia-${e}`}
                      className="pointer-events-none absolute border border-dashed border-blue-600 bg-blue-400/10"
                      style={{
                        left: pct(columnasGuia[e].x0, pagina.width),
                        top: pct(y0, pagina.height),
                        width: pct(columnasGuia[e].x1 - columnasGuia[e].x0, pagina.width),
                        height: pct(y1 - y0, pagina.height),
                      }}
                    />
                  ));
                })()}
                {/* Cajas de cada celda: negro = gris oscuro, vacío = gris, escrito = semáforo */}
                {acta?.organizaciones.flatMap((o) =>
                  ELECCIONES.map((e) => {
                    const c = o[e];
                    if (!c.bbox) return null;
                    const sel = seleccion?.id === o.id && seleccion.eleccion === e;
                    const color =
                      c.estado === 'ANULADA' ? '#374151' : c.estado === 'VACIA' && c.confianza >= 0.75 ? '#9ca3af' : COLOR_CAJA[clasificarConfianza(c.confianza)];
                    return (
                      <div
                        key={`${o.id}-${e}`}
                        onClick={() => seleccionar({ id: o.id, eleccion: e })}
                        title={`${o.codigo} ${o.nombre_partido} (${e}): ${c.estado === 'MANUSCRITO' ? c.valor ?? '?' : c.estado}`}
                        className="absolute cursor-pointer"
                        style={{
                          left: pct(c.bbox.x, pagina.width),
                          top: pct(c.bbox.y, pagina.height),
                          width: pct(c.bbox.w, pagina.width),
                          height: pct(c.bbox.h, pagina.height),
                          border: `${sel ? 3 : 1.5}px ${c.estado === 'MANUSCRITO' ? 'solid' : 'dashed'} ${color}`,
                          background: sel ? 'rgba(59,130,246,0.2)' : 'transparent',
                        }}
                      />
                    );
                  }),
                )}
                {acta?.miembros_mesa.map((m) =>
                  m.roi_firma ? (
                    <div
                      key={m.rol}
                      className="pointer-events-none absolute border border-dashed border-purple-600"
                      style={{
                        left: pct(m.roi_firma.x, pagina.width),
                        top: pct(m.roi_firma.y, pagina.height),
                        width: pct(m.roi_firma.w, pagina.width),
                        height: pct(m.roi_firma.h, pagina.height),
                      }}
                    />
                  ) : null,
                )}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
