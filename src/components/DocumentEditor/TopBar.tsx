import { useState } from 'react';
import { SlidersHorizontal, Hash, LayoutGrid, Share2, ChevronDown, Keyboard } from 'lucide-react';
import { LogoMark, PageSizeIcon, RemoveBgIcon } from './icons';
import { SITE } from '../../engine/siteConfig';

interface Props {
  onHome: () => void;
  onSize: () => void;
  onFormat: () => void;
  onFolio: () => void;
  onOrganize: () => void;
  onRemoveBg: () => void;
  onShortcuts: () => void;
  onShare: () => void;
  folioActive: boolean;
  formatActive: boolean;
}

/** Barra superior: inicio y herramientas del documento a la izquierda; descargar y compartir a la derecha. */
export function TopBar(p: Props) {
  const [menu, setMenu] = useState(false);
  const docItems = [
    { id: 'size', label: 'Tamaño de hoja', short: 'Tamaño', title: 'Tamaño de la hoja o del lienzo (A4, Carta, redes sociales…)', icon: <PageSizeIcon className="w-[18px] h-[18px]" />, on: p.onSize, active: false },
    { id: 'format', label: 'Formato', short: 'Formato', title: 'Formato del documento (tipografía y márgenes)', icon: <SlidersHorizontal className="w-[18px] h-[18px]" />, on: p.onFormat, active: p.formatActive },
    { id: 'folio', label: 'Foliado', short: 'Foliado', title: 'Numerar las páginas (foliado)', icon: <Hash className="w-[18px] h-[18px]" />, on: p.onFolio, active: p.folioActive },
    { id: 'removebg', label: 'Quitar fondo', short: 'Quitar fondo', title: 'Quitar el fondo de una imagen (o de varias a la vez)', icon: <RemoveBgIcon className="w-[18px] h-[18px]" />, on: p.onRemoveBg, active: false },
    { id: 'organize', label: 'Organizar páginas', short: 'Organizar', title: 'Organizar las páginas del documento', icon: <LayoutGrid className="w-[18px] h-[18px]" />, on: p.onOrganize, active: false },
  ];

  return (
    <header data-top-bar data-keep-selection className="relative shrink-0 h-12 flex items-center gap-2 px-2 md:px-3 bg-slate-950 border-b border-slate-800 print:hidden z-30">
      <button type="button" data-tour="home" onClick={p.onHome} title="Inicio: todas las tareas" className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-800/70 transition">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#2c4270', color: '#fff' }}><LogoMark className="w-5 h-5" /></span>
        <span className="text-sm font-bold text-white hidden sm:block">{SITE.name}</span>
      </button>

      <div className="w-px h-6 bg-slate-800 max-md:hidden" />
      <nav data-tour="doc-tools" className="hidden md:flex items-center gap-0.5">
        {docItems.map((t) => (
          <button key={t.id} type="button" data-doc-tool={t.id} title={t.title} onClick={t.on} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] transition ${t.active ? 'text-blue-500 bg-blue-600/10' : 'text-slate-300 hover:text-white hover:bg-slate-800/70'}`}>
            {t.icon}<span>{t.short}</span>
          </button>
        ))}
      </nav>

      <div className="md:hidden relative">
        <button type="button" data-tour="doc-tools-m" onClick={() => setMenu((v) => !v)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] border ${menu ? 'border-blue-600 text-blue-500' : 'border-slate-700 text-slate-200'}`}>
          <SlidersHorizontal className="w-4 h-4" /> Documento <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menu ? 'rotate-180' : ''}`} />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute left-0 top-full mt-1.5 z-50 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5">
              {docItems.map((t) => (
                <button key={t.id} type="button" onClick={() => { setMenu(false); t.on(); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left ${t.active ? 'text-blue-500' : 'text-slate-200'} hover:bg-slate-800/70`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={p.onShortcuts} title="Atajos de teclado (?)" className="max-md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition">
          <Keyboard className="w-[18px] h-[18px]" />
        </button>
        <button type="button" data-tour="export" onClick={p.onShare} title="Descargar, o enviar por WhatsApp y otras apps" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm" style={{ color: '#fff' }}>
          <Share2 className="w-4 h-4" /> Compartir
        </button>
      </div>
    </header>
  );
}
