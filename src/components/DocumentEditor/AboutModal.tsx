import { useState } from 'react';
import {
  X, FileStack, FilePenLine, PenLine, Hash, Shapes, ShieldCheck, Download, Share2, Play, Heart,
  Globe, Github, MessageCircle, Facebook, Instagram, Mail, Check, Smartphone,
} from 'lucide-react';
import { SITE } from '../../engine/siteConfig';

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

const LINKS: { key: string; label: string; icon: JSX.Element; href: (v: string) => string }[] = [
  { key: 'web', label: 'Sitio web', icon: <Globe className="w-4 h-4" />, href: (v) => v },
  { key: 'github', label: 'GitHub', icon: <Github className="w-4 h-4" />, href: (v) => v },
  { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-4 h-4" />, href: (v) => v },
  { key: 'facebook', label: 'Facebook', icon: <Facebook className="w-4 h-4" />, href: (v) => v },
  { key: 'instagram', label: 'Instagram', icon: <Instagram className="w-4 h-4" />, href: (v) => v },
  { key: 'correo', label: 'Escríbenos', icon: <Mail className="w-4 h-4" />, href: (v) => (v.startsWith('mailto:') ? v : `mailto:${v}`) },
];

/** Bienvenida / "Nosotros": presenta la herramienta e invita a la comunidad a usarla. */
export function AboutModal({ open, onClose, onStartTour, canInstall, onInstall, firstRun }: Props) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const links = LINKS.filter((l) => SITE.links[l.key]);

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
            <h2 className="text-base font-bold text-white flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" /> Únete a la comunidad</h2>
            <p className="text-sm text-slate-300 mt-1">
              Esta herramienta crece con quienes la usan: estudiantes, oficinas y emprendedores. Compártela con tu equipo, tu salón o tu iglesia, y cuéntanos qué te gustaría que haga.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => void share()} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium">
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} {copied ? 'Enlace copiado' : 'Compartir'}
              </button>
              {canInstall && (
                <button type="button" onClick={onInstall} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-blue-600 text-blue-600 text-sm font-medium">
                  <Download className="w-4 h-4" /> Instalar la app
                </button>
              )}
              {links.map((l) => (
                <a key={l.key} href={l.href(SITE.links[l.key])} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-700 text-slate-200 text-sm">
                  {l.icon} {l.label}
                </a>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1"><Smartphone className="w-3 h-3" /> Funciona en Android, iPhone, tablet y computadora.</p>
          </section>

          <footer className="text-center text-xs text-slate-500 pb-1">
            Hecho con <Heart className="inline w-3 h-3 text-rose-500" /> por {SITE.author} · {SITE.name} © {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
}

/** Instrucciones para instalar en iPhone/iPad (Safari no ofrece el aviso automático). */
export function IosInstallHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div data-keep-selection className="fixed inset-0 z-[85] bg-slate-950/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-2">Instalar en iPhone / iPad</h3>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal pl-5">
          <li>Abre esta página en <b>Safari</b>.</li>
          <li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
          <li>Elige <b>«Añadir a pantalla de inicio»</b> y confirma.</li>
        </ol>
        <p className="text-xs text-slate-500 mt-3">Después la abres desde su icono, a pantalla completa, como cualquier app.</p>
        <button type="button" onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium">Entendido</button>
      </div>
    </div>
  );
}
