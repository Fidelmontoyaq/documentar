import { useRef, useState } from 'react';
import { X, Combine, Split, Scissors, FileOutput, FilePlus2, FileMinus2, LayoutGrid, Hash, FilePenLine, Eraser, SlidersHorizontal, Download, Share2, Play, Check, ArrowRight } from 'lucide-react';
import { LogoMark, PageSizeIcon, RemoveBgIcon, SignatureIcon } from './icons';
import { SITE } from '../../engine/siteConfig';

export type HomeTask = 'merge' | 'split' | 'cut' | 'extract' | 'addpage' | 'delpages' | 'organize' | 'folio' | 'sign' | 'editpdf' | 'removebg' | 'removeobj' | 'size' | 'format';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (task: HomeTask, files?: File[]) => void;
  onTour: () => void;
  canInstall: boolean;
  onInstall: () => void;
}

interface Card {
  id: HomeTask;
  title: string;
  hint: string;
  icon: JSX.Element;
  color: string;
  /** Si necesita un archivo, la tarjeta abre directamente el selector. */
  accept?: string;
}

const CARDS: Card[] = [
  { id: 'merge', title: 'Unir PDF', hint: 'Junta PDF y fotos en uno', icon: <Combine />, color: '#3f63a6' },
  { id: 'split', title: 'Dividir PDF', hint: 'Por páginas, cada N o rangos', icon: <Split />, color: '#b0584a' },
  { id: 'cut', title: 'Cortar PDF', hint: 'En dos partes, donde quieras', icon: <Scissors />, color: '#a8643a' },
  { id: 'extract', title: 'Extraer páginas', hint: 'Saca solo las que necesitas', icon: <FileOutput />, color: '#397265' },
  { id: 'addpage', title: 'Añadir página', hint: 'En blanco o de otro PDF', icon: <FilePlus2 />, color: '#2f7a8f' },
  { id: 'delpages', title: 'Eliminar páginas', hint: 'Quita las que sobran', icon: <FileMinus2 />, color: '#a04877' },
  { id: 'organize', title: 'Ordenar páginas', hint: 'Mover, girar o borrar', icon: <LayoutGrid />, color: '#5a55a3', accept: '.pdf,.docx,.png,.jpg,.jpeg' },
  { id: 'folio', title: 'Foliar PDF', hint: 'Ascendente o en reverso', icon: <Hash />, color: '#9a7425' },
  { id: 'sign', title: 'Firmar PDF', hint: 'Dibuja y coloca tu firma', icon: <SignatureIcon />, color: '#5a55a3', accept: '.pdf,.png,.jpg,.jpeg' },
  { id: 'editpdf', title: 'Editar texto', hint: 'Corrige el texto de un PDF', icon: <FilePenLine />, color: '#a04877', accept: '.pdf' },
  { id: 'removebg', title: 'Quitar fondo', hint: 'De tus imágenes, en lote', icon: <RemoveBgIcon />, color: '#2f7a8f' },
  { id: 'removeobj', title: 'Quitar objeto', hint: 'Borra algo de una foto', icon: <Eraser />, color: '#b0584a', accept: 'image/*' },
  { id: 'size', title: 'Tamaño de hoja', hint: 'A4, Carta, redes sociales…', icon: <PageSizeIcon />, color: '#4a5568' },
  { id: 'format', title: 'Formato', hint: 'Tipografía y márgenes', icon: <SlidersHorizontal />, color: '#4a5568' },
];

/**
 * Inicio: todas las tareas a un clic (como iLovePDF), más una presentación breve de la herramienta.
 * Está pensado para verse completo sin desplazarse.
 */
export function HomeScreen({ open, onClose, onPick, onTour, canInstall, onInstall }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<HomeTask | null>(null);
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const choose = (c: Card) => {
    if (!c.accept) { onPick(c.id); return; }
    pending.current = c.id;
    const el = fileRef.current!;
    el.accept = c.accept;
    el.multiple = false;
    el.click();
  };

  const share = async () => {
    const url = SITE.shareUrl || location.origin;
    try {
      if (navigator.share) await navigator.share({ title: SITE.name, text: `${SITE.name}: ${SITE.tagline}`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    } catch { /* cancelado */ }
  };

  return (
    <div data-keep-selection className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 print:hidden" onClick={onClose}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const t = pending.current;
          e.target.value = '';
          if (t && files.length) onPick(t, files);
        }}
      />
      <div className="relative w-full max-w-[900px] max-h-[calc(100dvh-20px)] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3">
          <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#2c4270', color: '#fff' }}>
            <LogoMark className="w-6 h-6" />
          </span>
          <div className="min-w-0 mr-auto">
            <h1 className="text-lg sm:text-xl font-bold text-white leading-tight tracking-tight">{SITE.name}</h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-snug">¿Qué quieres hacer hoy? Elige una tarea y empieza con un clic.</p>
          </div>
          <button type="button" onClick={onClose} title="Cerrar e ir al editor" className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 px-3 sm:px-6 py-2 sm:py-3 min-h-0">
          {CARDS.map((c) => (
            <button
              key={c.id}
              type="button"
              data-home-task={c.id}
              onClick={() => choose(c)}
              className="group text-left rounded-xl border border-slate-700 bg-slate-900 hover:border-slate-500 hover:shadow-md transition flex items-center gap-2.5 px-2.5 py-2 sm:px-3 sm:py-2.5"
            >
              <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 transition group-hover:scale-105" style={{ background: `${c.color}1f`, color: c.color }}>
                <span className="[&>svg]:w-[18px] [&>svg]:h-[18px] sm:[&>svg]:w-5 sm:[&>svg]:h-5 flex">{c.icon}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] sm:text-[13px] font-bold text-white leading-tight">{c.title}</span>
                <span className="block text-[10.5px] text-slate-400 leading-snug mt-0.5 [@media(max-height:760px)]:hidden">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <footer className="border-t border-slate-800 bg-slate-950/30 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="min-w-0 flex-1 basis-[260px]">
            <p className="text-[12px] text-slate-300 leading-snug">
              <b className="text-white">Nosotros:</b> una herramienta gratuita para estudiantes y oficinas. Todo ocurre en tu navegador, <b className="text-white">tus archivos nunca se suben</b> a un servidor.
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Hecho por {SITE.author} · {SITE.name} © {new Date().getFullYear()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onTour} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500">
              <Play className="w-3.5 h-3.5" /> Recorrido
            </button>
            <button type="button" onClick={() => void share()} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />} {copied ? 'Enlace copiado' : 'Compartir'}
            </button>
            {canInstall && (
              <button type="button" onClick={onInstall} className="md:hidden flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-200">
                <Download className="w-3.5 h-3.5" /> Instalar
              </button>
            )}
            <button type="button" data-home-editor onClick={onClose} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">
              Ir al editor <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
