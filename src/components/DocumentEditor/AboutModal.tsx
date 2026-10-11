import { useState } from 'react';
import {
  X, FileStack, FilePenLine, PenLine, Hash, Shapes, ShieldCheck, Download, Share2, Play,
  Check, Smartphone,
} from 'lucide-react';
import { SITE } from '../../engine/siteConfig';
import type { InstallHelpKind } from '../../hooks/useInstall';

interface Props {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  canInstall: boolean;
  onInstall: () => void;
  firstRun?: boolean;
}

const FEATURES = [
  { icon: <FileStack className="w-5 h-5" />, t: 'Une todo en un solo documento', d: 'PDF, Word e imágenes juntos; reordena, gira y elimina hojas.' },
  { icon: <FilePenLine className="w-5 h-5" />, t: 'Edita el texto de un PDF', d: 'Toca una palabra y cámbiala con la misma tipografía, sin cajas encima.' },
  { icon: <PenLine className="w-5 h-5" />, t: 'Firma y sella', d: 'Dibuja tu firma, ponla donde quieras y exporta lista para enviar.' },
  { icon: <Hash className="w-5 h-5" />, t: 'Foliado profesional', d: 'Numera hojas con el formato y la tipografía que pidan en tu oficina.' },
  { icon: <Shapes className="w-5 h-5" />, t: 'Formas, marcos y stickers', d: 'Diseña certificados, invitaciones y diapositivas con +140 tipografías.' },
  { icon: <ShieldCheck className="w-5 h-5" />, t: 'Privado por diseño', d: 'Todo ocurre en tu navegador: tus archivos no se suben a ningún servidor.' },
];

/** Bienvenida / "Nosotros": presenta la herramienta e invita a la comunidad a usarla. */
export function AboutModal({ open, onClose, onStartTour, canInstall, onInstall, firstRun }: Props) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const share = async () => {
    const url = SITE.shareUrl || location.origin;
    const data = { title: SITE.name, text: `${SITE.name}: ${SITE.tagline}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch { /* cancelado */ }
  };

  return (
    <div data-keep-selection className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden" onClick={onClose}>
      <div className="relative w-full sm:max-w-2xl max-h-[94dvh] overflow-y-auto bg-slate-900 sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} title="Cerrar" className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/25 text-white" style={{ color: '#fff' }}>
          <X className="w-4 h-4" />
        </button>

        <header className="px-6 pt-10 pb-8 text-center" style={{ background: 'linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#38bdf8 100%)', color: '#fff' }}>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-4 ring-1 ring-white/30">
            <FileStack className="w-7 h-7" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] opacity-80 mb-1">Bienvenido a</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{SITE.name}</h1>
          <p className="mt-2 text-sm sm:text-base opacity-95 max-w-md mx-auto">{SITE.tagline}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full bg-white text-blue-700 font-semibold text-sm shadow">
              {firstRun ? 'Comenzar el recorrido' : 'Empezar ahora'}
            </button>
            {!firstRun && (
              <button type="button" onClick={() => { onClose(); onStartTour(); }} className="px-5 py-2.5 rounded-full bg-white/15 ring-1 ring-white/40 font-semibold text-sm flex items-center gap-1.5">
                <Play className="w-4 h-4" /> Recorrido guiado
              </button>
            )}
          </div>
        </header>

        <div className="p-6 space-y-7">
          <section>
            <h2 className="text-base font-bold text-white mb-1">Nuestra misión</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{SITE.mission}</p>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              {[['Gratis', 'sin registro'], ['100%', 'en tu navegador'], ['Offline', 'instalable como app']].map(([a, b]) => (
                <div key={a} className="rounded-xl border border-slate-800 bg-slate-800/40 py-3">
                  <div className="text-lg font-extrabold text-blue-500">{a}</div>
                  <div className="text-[11px] text-slate-400">{b}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">Qué puedes hacer</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div key={f.t} className="flex gap-3 rounded-xl border border-slate-800 p-3">
                  <div className="w-9 h-9 shrink-0 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center">{f.icon}</div>
                  <div>
                    <div className="text-sm font-semibold text-white">{f.t}</div>
                    <div className="text-xs text-slate-400 leading-snug">{f.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-blue-600/30 bg-blue-600/5 p-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2"><Smartphone className="w-4 h-4 text-blue-600" /> Llévala contigo</h2>
            <p className="text-sm text-slate-300 mt-1">
              Instálala como aplicación para abrirla desde tu pantalla de inicio, a pantalla completa y también sin internet.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {canInstall && (
                <button type="button" onClick={onInstall} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium">
                  <Download className="w-4 h-4" /> Instalar la app
                </button>
              )}
              <button type="button" onClick={() => void share()} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-700 text-slate-200 text-sm">
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} {copied ? 'Enlace copiado' : 'Compartir'}
              </button>
            </div>
          </section>

          <footer className="text-center text-xs text-slate-500 pb-1">
            Hecho por {SITE.author} · {SITE.name} © {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
}

/** Pasos para instalar a mano cuando el navegador no ofrece el aviso automático. */
export function InstallHelp({ kind, onClose }: { kind: InstallHelpKind | null; onClose: () => void }) {
  if (!kind) return null;
  const steps: Record<InstallHelpKind, { title: string; items: string[]; note?: string }> = {
    ios: {
      title: 'Instalar en iPhone / iPad',
      items: ['Abre esta página en <b>Safari</b>.', 'Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).', 'Elige <b>«Añadir a pantalla de inicio»</b> y confirma.'],
      note: 'Apple no permite un botón automático de instalación.',
    },
    android: {
      title: 'Instalar en Android',
      items: ['Abre esta página en <b>Chrome</b> (o Edge / Samsung Internet).', 'Toca el menú <b>⋮</b> (tres puntos) arriba a la derecha.', 'Elige <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.'],
      note: 'Si Chrome ya te lo ofreció y lo cerraste varias veces, deja de mostrar el aviso solo; este camino manual siempre funciona.',
    },
    inapp: {
      title: 'Ábrela en tu navegador',
      items: ['Estás dentro de otra app (WhatsApp, Facebook, Instagram…), que no permite instalar.', 'Toca el menú <b>⋮</b> o <b>Compartir</b> y elige <b>«Abrir en el navegador»</b> (Chrome o Safari).', 'Ahí vuelve a tocar «Instalar».'],
    },
    desktop: {
      title: 'Instalar en el computador',
      items: ['Usa <b>Chrome o Edge</b>.', 'En la barra de direcciones toca el icono de <b>instalar</b> (monitor con una flecha) o el menú <b>⋮ → Guardar y compartir → Instalar</b>.'],
    },
  };
  const c = steps[kind];
  return (
    <div data-keep-selection className="fixed inset-0 z-[85] bg-slate-950/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-2">{c.title}</h3>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal pl-5">
          {c.items.map((t) => <li key={t} dangerouslySetInnerHTML={{ __html: t }} />)}
        </ol>
        {c.note && <p className="text-xs text-slate-500 mt-3">{c.note}</p>}
        <button type="button" onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium">Entendido</button>
      </div>
    </div>
  );
}
