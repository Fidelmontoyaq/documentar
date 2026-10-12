import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { SIZE_GROUPS } from '../../engine/pageSizes';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';

export const TOUR_KEY = 'docucraft.tour.off';
export const tourDisabled = () => {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; }
};

interface Step {
  id: string;
  title: string;
  text: string;
  /** Selector del elemento a señalar; sin él, la tarjeta va al centro. */
  target?: string;
  only?: 'desktop' | 'mobile';
  choose?: boolean;
}

const STEPS: Step[] = [
  { id: 'size', title: '1 · Elige el tipo de hoja', text: 'Empieza por el papel. Puedes cambiarlo después desde «Tamaño» (arriba a la izquierda).', choose: true },
  { id: 'home', title: 'Inicio: tareas a un clic', text: 'Con este botón vuelves al inicio, donde están todas las tareas (unir, dividir, foliar, firmar, quitar fondo…) sin preparar la hoja.', target: '[data-tour="home"]' },
  { id: 'doctools', title: 'Herramientas del documento', text: 'Tamaño de hoja, formato, foliado y organizar páginas están aquí arriba a la izquierda.', target: '[data-tour="doc-tools"]', only: 'desktop' },
  { id: 'doctoolsm', title: 'Herramientas del documento', text: 'En «Documento» tienes el tamaño de hoja, el formato, el foliado y organizar páginas.', target: '[data-tour="doc-tools-m"]', only: 'mobile' },
  { id: 'import', title: '2 · Sube tus archivos', text: 'Aquí subes PDF, Word o imágenes. También puedes arrastrarlos directo sobre la hoja.', target: '[data-tour="import"]' },
  { id: 'image', title: '3 · Agrega imágenes', text: 'Con este botón pones fotos en la hoja actual. Luego las mueves, giras y recortas con el dedo o el mouse.', target: '[data-tour="image"]' },
  { id: 'text', title: '4 · Escribe texto', text: 'Crea un cuadro de texto en cualquier parte. Al tocarlo, arriba aparecen la tipografía, el tamaño y el color.', target: '[data-tour="text"]' },
  { id: 'pdfedit', title: '5 · Edita el texto de un PDF', text: 'Con «Editar PDF» activo, toca cualquier texto de un PDF importado y cámbialo con su misma tipografía.', target: '[data-tour="pdfedit"]' },
  { id: 'rail', title: '6 · Tus herramientas', text: 'Aquí están las herramientas agrupadas: Archivo, Insertar y Editar. Las acciones simples (deshacer, copiar, formato) están en la barra de arriba.', target: '[data-tour-area="rail"]', only: 'desktop' },
  { id: 'menu', title: '6 · Menú con todo', text: 'Este botón abre el menú lateral con todas las herramientas, las acciones de la hoja actual y el tema claro/oscuro. La barra de abajo siempre queda a la vista.', target: '[data-tour="menu"]', only: 'mobile' },
  { id: 'top', title: '7 · Barra superior', text: 'Deshacer, rehacer, copiar y pegar siempre están aquí. Al seleccionar un texto o una imagen aparecen sus opciones.', target: '[data-element-toolbar]' },
  { id: 'pages', title: '8 · Tus hojas', text: 'Desliza hacia arriba o abajo para pasar de hoja en hoja. Con los dedos puedes hacer zoom; abajo está el control de zoom.', target: '#editorContainer' },
  { id: 'theme', title: '9 · Claro u oscuro', text: 'Cambia entre el tema claro (de oficina), el oscuro o el automático.', target: '[data-tour="theme"]', only: 'desktop' },
  { id: 'export', title: '10 · Exporta', text: 'Cuando termines, «Descargar» te da PDF, PNG o JPG, y «Compartir» lo manda por WhatsApp o correo. ¡Listo! Puedes repetir este recorrido desde «Ayuda».', target: '[data-tour="export"]' },
];

const visible = (sel?: string): HTMLElement | null => {
  if (!sel) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
  onOpenCanvas: () => void;
}

/** Recorrido guiado: señala cada parte de la pantalla con un foco y una tarjeta explicativa. */
export function GuidedTour({ open, onClose, engine, onOpenCanvas }: Props) {
  const isMobile = () => matchMedia('(max-width: 767px)').matches;
  const steps = STEPS.filter((s) => !s.only || (s.only === 'mobile') === isMobile());
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [off, setOff] = useState(tourDisabled());
  const [, force] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => { if (open) { setI(0); setPicked(null); } }, [open]);

  const measure = useCallback(() => {
    const el = visible(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = visible(step?.target);
    if (el && step.target !== '#editorContainer' && step.target !== '[data-element-toolbar]') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
    const on = () => { measure(); force((n) => n + 1); };
    window.addEventListener('resize', on);
    const t = setInterval(measure, 400);
    return () => { window.removeEventListener('resize', on); clearInterval(t); };
  }, [open, i, step, measure]);

  if (!open || !step) return null;

  const close = () => {
    try { localStorage.setItem(TOUR_KEY, off ? '1' : '0'); } catch { /* ignore */ }
    onClose();
  };
  const last = i >= steps.length - 1;
  const pad = 6;
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(340, vw - 24);
  let style: React.CSSProperties;
  if (!rect) {
    style = { left: (vw - W) / 2, top: Math.max(16, vh / 2 - 150), width: W };
  } else if (rect.width > vw * 0.6 && rect.height > vh * 0.5) {
    style = { left: (vw - W) / 2, bottom: isMobile() ? 84 : 90, width: W };
  } else if (isMobile()) {
    const targetInBottom = rect.top > vh / 2;
    style = targetInBottom ? { left: (vw - W) / 2, top: 64, width: W } : { left: (vw - W) / 2, bottom: 84, width: W };
  } else if (rect.right + W + 24 < vw && rect.width < 200) {
    style = { left: rect.right + 16, top: Math.min(Math.max(12, rect.top), vh - 260), width: W };
  } else if (rect.bottom + 230 < vh) {
    style = { left: Math.min(Math.max(12, rect.left), vw - W - 12), top: rect.bottom + 14, width: W };
  } else {
    style = { left: Math.min(Math.max(12, rect.left), vw - W - 12), bottom: vh - rect.top + 14, width: W };
  }
  // El área grande (hojas) no se resalta con foco: solo se indica con un marco.
  const big = rect && rect.width > vw * 0.6 && rect.height > vh * 0.5;

  const chooseSize = (kind: 'a4' | 'letter' | 'creative') => {
    setPicked(kind);
    if (!engine) return;
    if (kind === 'creative') {
      engine.setCanvasSize(1080, 1080, { scope: 'all', kind: 'design' });
    } else {
      const p = SIZE_GROUPS[0].items.find((x) => x.id === kind)!;
      engine.setCanvasSize(p.w, p.h, { scope: 'all', kind: 'doc' });
    }
  };

  return (
    <div data-keep-selection className="fixed inset-0 z-[95] print:hidden" onPointerDown={(e) => e.stopPropagation()}>
      {rect && !big ? (
        <div
          className="fixed rounded-xl pointer-events-none transition-all duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(15,23,42,.62), 0 0 0 3px #5b7fbd' }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/60 pointer-events-none" />
      )}
      {big && rect && <div className="fixed rounded-xl pointer-events-none border-[3px] border-blue-500" style={{ left: rect.left + 6, top: rect.top + 6, width: rect.width - 12, height: rect.height - 12 }} />}

      <div className="fixed bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4" style={style} role="dialog" aria-label="Tutorial">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-white leading-snug">{step.title}</h3>
          <button type="button" onClick={close} title="Cerrar tutorial" className="shrink-0 w-7 h-7 -mt-1 -mr-1 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[13px] text-slate-300 mt-1 leading-relaxed">{step.text}</p>

        {step.choose && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {([['a4', 'A4', 'Documento'], ['letter', 'Carta', 'Documento'], ['creative', 'Creativo', 'Cuadrado 1080']] as const).map(([k, a, b]) => (
              <button key={k} type="button" onClick={() => chooseSize(k)} className={`rounded-xl border py-2.5 text-center ${picked === k ? 'border-blue-600 bg-blue-600/10 text-blue-600' : 'border-slate-700 text-slate-200 hover:border-blue-500'}`}>
                <div className="text-sm font-bold">{a}</div>
                <div className="text-[10px] text-slate-400">{b}</div>
              </button>
            ))}
            <button type="button" onClick={() => { close(); onOpenCanvas(); }} className="col-span-3 text-[11px] text-blue-600 underline text-left">Ver más tamaños (diapositivas, redes sociales…)</button>
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            {steps.map((s, k) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-600'}`} />
            ))}
          </div>
          <span className="text-[11px] text-slate-500">{i + 1}/{steps.length}</span>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button type="button" onClick={close} className="text-xs text-slate-400 hover:text-white px-2 py-2">Saltar</button>
          <div className="flex-1" />
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="flex items-center gap-0.5 text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200">
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
          )}
          <button type="button" onClick={() => (last ? close() : setI(i + 1))} className="flex items-center gap-0.5 text-xs px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">
            {last ? 'Terminar' : 'Siguiente'} {!last && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        <label className="flex items-center gap-2 mt-3 text-[11px] text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} />
          No mostrar el tutorial al abrir (puedes verlo desde «Ayuda»)
        </label>
      </div>
    </div>
  );
}
