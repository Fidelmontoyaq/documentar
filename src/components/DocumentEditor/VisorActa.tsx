import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useActaStore } from '../store/actaStore';
import { COLOR_CAJA, clasificarConfianza } from '../utils/clasificarConfianza';
import { COLOR_ZONA, ETIQUETA_ZONA, ZONAS } from '../utils/plantilla';
import { ELECCIONES } from '../types/acta';

export default function VisorActa() {
  const { paginas, paginaActual, setPaginaActual, acta, seleccion, seleccionar, zonas, zonaActiva, setZona, setZonaActiva, nOrganizaciones } = useActaStore();
  const pagina = paginas[paginaActual];
  const capa = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  if (!pagina) {
    return <div className="flex h-[640px] items-center justify-center rounded border bg-gray-50 text-sm text-gray-400">Sin documento cargado</div>;
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  // Coordenadas del puntero → píxeles de la imagen (correcto aunque haya zoom/desplazamiento).
  const aImagen = (e: RPointerEvent) => {
    const r = capa.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * pagina.width, y: ((e.clientY - r.top) / r.height) * pagina.height };
  };
  const bajar = (e: RPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = aImagen(e);
    setRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const mover = (e: RPointerEvent) => { if (rect) { const p = aImagen(e); setRect({ ...rect, x1: p.x, y1: p.y }); } };
  const soltar = () => {
    if (rect && zonaActiva) {
      const w = Math.abs(rect.x1 - rect.x0);
      const h = Math.abs(rect.y1 - rect.y0);
      if (w > 15 && h > 15) { setZona(zonaActiva, { x: Math.min(rect.x0, rect.x1), y: Math.min(rect.y0, rect.y1), w, h }); setZonaActiva(null); }
    }
    setRect(null);
  };
  const filas = nOrganizaciones + 4;

  return (
    <div className="rounded border bg-gray-100">
      <TransformWrapper minScale={0.5} maxScale={8} centerOnInit wheel={{ step: 0.15 }} panning={{ disabled: !!zonaActiva }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex items-center gap-1 border-b bg-white p-1 text-xs">
              <button onClick={() => zoomIn()} className="rounded border px-2 py-1">＋</button>
              <button onClick={() => zoomOut()} className="rounded border px-2 py-1">－</button>
              <button onClick={() => resetTransform()} className="rounded border px-2 py-1">Ajustar</button>
              {zonaActiva && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900">
                  Dibuje el recuadro «{ETIQUETA_ZONA[zonaActiva]}» arrastrando sobre el acta
                  <button onClick={() => setZonaActiva(null)} className="ml-2 underline">cancelar</button>
                </span>
              )}
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
              <div ref={capa} className="relative inline-block max-w-full">
                <img src={pagina.url} alt="Acta electoral escaneada" draggable={false} className="block max-w-full object-contain" style={{ maxHeight: 620, width: 'auto', height: 'auto' }} />

                {/* Zonas de trabajo + rejilla (filas y casilleros de dígitos) en vivo */}
                {zonas && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${pagina.width} ${pagina.height}`} preserveAspectRatio="none">
                    {ZONAS.map((n) => {
                      const z = zonas[n];
                      return (
                        <g key={n} stroke={COLOR_ZONA[n]} fill="none" strokeWidth={zonaActiva === n ? 3 : 1.5} vectorEffect="non-scaling-stroke">
                          <rect x={z.x} y={z.y} width={z.w} height={z.h} vectorEffect="non-scaling-stroke" strokeWidth={zonaActiva === n ? 3 : 1.5} />
                          {(n === 'votos_provincial' || n === 'votos_distrital') && (
                            <>
                              {Array.from({ length: filas - 1 }, (_, i) => (
                                <line key={i} x1={z.x} x2={z.x + z.w} y1={z.y + ((i + 1) * z.h) / filas} y2={z.y + ((i + 1) * z.h) / filas} strokeOpacity={0.35} vectorEffect="non-scaling-stroke" strokeWidth={0.6} />
                              ))}
                              {[1, 2].map((k) => (
                                <line key={k} x1={z.x + (k * z.w) / 3} x2={z.x + (k * z.w) / 3} y1={z.y} y2={z.y + z.h} strokeDasharray="2 3" strokeOpacity={0.6} vectorEffect="non-scaling-stroke" strokeWidth={0.8} />
                              ))}
                            </>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
                {zonas && ZONAS.map((n) => (
                  <span key={`l-${n}`} className="pointer-events-none absolute rounded px-1 text-[9px] font-bold text-white"
                    style={{ left: pct(zonas[n].x, pagina.width), top: pct(zonas[n].y, pagina.height), background: COLOR_ZONA[n], transform: 'translateY(-100%)' }}>
                    {ETIQUETA_ZONA[n]}
                  </span>
                ))}

                {/* Cajas de cada celda leída: negro = gris oscuro, vacío = gris, escrito = semáforo */}
                {acta?.organizaciones.flatMap((o) =>
                  ELECCIONES.map((e) => {
                    const c = o[e];
                    if (!c.bbox) return null;
                    const sel = seleccion?.id === o.id && seleccion.eleccion === e;
                    const color = c.estado === 'ANULADA' ? '#374151' : c.estado === 'VACIA' && c.confianza >= 0.75 ? '#9ca3af' : COLOR_CAJA[clasificarConfianza(c.confianza)];
                    return (
                      <div key={`${o.id}-${e}`} onClick={() => seleccionar({ id: o.id, eleccion: e })}
                        title={`${o.codigo} ${o.nombre_partido} (${e}): ${c.estado === 'MANUSCRITO' ? c.valor ?? '?' : c.estado}`}
                        className="absolute cursor-pointer"
                        style={{
                          left: pct(c.bbox.x, pagina.width), top: pct(c.bbox.y, pagina.height),
                          width: pct(c.bbox.w, pagina.width), height: pct(c.bbox.h, pagina.height),
                          border: `${sel ? 3 : 1}px ${c.estado === 'MANUSCRITO' ? 'solid' : 'dashed'} ${color}`,
                          background: sel ? 'rgba(59,130,246,0.25)' : c.estado === 'MANUSCRITO' && c.confianza < 0.75 ? 'rgba(245,158,11,0.15)' : 'transparent',
                        }} />
                    );
                  }),
                )}

                {/* Capa de dibujo: solo activa mientras se marca una zona */}
                {zonaActiva && (
                  <div className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={bajar} onPointerMove={mover} onPointerUp={soltar}>
                    {rect && (
                      <div className="absolute border-2 border-dashed border-amber-500 bg-amber-300/20"
                        style={{ left: pct(Math.min(rect.x0, rect.x1), pagina.width), top: pct(Math.min(rect.y0, rect.y1), pagina.height), width: pct(Math.abs(rect.x1 - rect.x0), pagina.width), height: pct(Math.abs(rect.y1 - rect.y0), pagina.height) }} />
                    )}
                  </div>
                )}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
