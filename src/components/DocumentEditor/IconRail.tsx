import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import {
  UploadCloud, Image as ImageIcon, Type, FilePlus, LayoutTemplate,
  Shapes, ScanSearch, Frame, FilePenLine, Menu, X, ArrowUp, ArrowDown, RotateCw, CopyPlus, Trash2,
  Sun, Moon, MonitorSmartphone, HelpCircle, Download, ChevronLeft, ChevronRight, LayoutDashboard,
} from 'lucide-react';
import { ArrangeMenu } from './ArrangeMenu';
import { ShapesMenu } from './ShapesMenu';
import { SignatureIcon } from './icons';
import { SITE } from '../../engine/siteConfig';
import type { ThemeMode } from '../../engine/theme';
import type { ArrangeLayoutId, ShapeKind } from '../../types/documentEditor';

export type PageAction = 'move-up' | 'move-down' | 'orientation' | 'duplicate' | 'delete';

interface IconRailProps {
  onOpenPanel: (mode: 'import' | 'format') => void;
  activePanel: 'import' | 'format' | null;
  pdfEditOn: boolean;
  onTogglePdfEdit: () => void;
  onExtractObject: () => void;
  onAddImages: (files: File[]) => void;
  onAddTextBox: () => void;
  onAddPage: () => void;
  onOpenSignature: () => void;
  imageCount: number;
  onArrange: (layout: ArrangeLayoutId, perPage: number) => void;
  onInsertShape: (kind: ShapeKind, size: { w: number; h: number }, filled: boolean) => void;
  onInsertFrame: (kind: ShapeKind, size: { w: number; h: number }) => void;
  onPageAction: (a: PageAction) => void;
  onGoToPage: (d: 1 | -1) => void;
  theme: ThemeMode;
  onTheme: (m: ThemeMode) => void;
  onOpenTour: () => void;
  onOpenHome: () => void;
  canInstall: boolean;
  onInstall: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}

interface Tool {
  id: string;
  label: string;
  title: string;
  icon: ReactNode;
  group: 'archivo' | 'insertar' | 'editar';
  onClick: (e: MouseEvent<HTMLElement>) => void;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  accent?: boolean;
}

const GROUPS: { id: Tool['group']; label: string }[] = [
  { id: 'archivo', label: 'Archivo' },
  { id: 'insertar', label: 'Insertar' },
  { id: 'editar', label: 'Editar' },
];

const THEMES: { id: ThemeMode; label: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Claro', icon: <Sun className="w-4 h-4" /> },
  { id: 'dark', label: 'Oscuro', icon: <Moon className="w-4 h-4" /> },
  { id: 'navy', label: 'Marino', icon: <Moon className="w-4 h-4 text-blue-500" /> },
  { id: 'auto', label: 'Auto', icon: <MonitorSmartphone className="w-4 h-4" /> },
];

/**
 * Navegación del editor.
 *  - PC: barra lateral izquierda con las herramientas agrupadas (las simples van en la barra de arriba).
 *  - Celular: barra inferior FIJA con lo esencial + un menú lateral (cajón) con todo lo demás, que se abre y se cierra.
 */
export function IconRail(p: IconRailProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [arrangeTop, setArrangeTop] = useState(0);
  const [shapesMode, setShapesMode] = useState<'shapes' | 'frames' | null>(null);
  const [shapesTop, setShapesTop] = useState(0);
  const canArrange = p.imageCount >= 2;
  const closeDrawer = () => p.setDrawerOpen(false);

  const tools: Tool[] = [
    { id: 'import', label: 'Subir', title: 'Importar archivos (PDF, Word, imágenes)', icon: <UploadCloud className="w-5 h-5" />, group: 'archivo', active: p.activePanel === 'import', onClick: () => p.onOpenPanel('import') },
    { id: 'image', label: 'Imagen', title: 'Agregar imágenes a la hoja actual', icon: <ImageIcon className="w-5 h-5" />, group: 'insertar', onClick: () => imageInputRef.current?.click() },
    { id: 'text', label: 'Texto', title: 'Agregar cuadro de texto', icon: <Type className="w-5 h-5" />, group: 'insertar', onClick: p.onAddTextBox },
    { id: 'shapes', label: 'Formas', title: 'Agregar formas', icon: <Shapes className="w-5 h-5" />, group: 'insertar', active: shapesMode === 'shapes', onClick: (e) => { setShapesTop(e.currentTarget.getBoundingClientRect().top); setShapesMode((m) => (m === 'shapes' ? null : 'shapes')); } },
    { id: 'frames', label: 'Marcos', title: 'Agregar marcos para imágenes', icon: <Frame className="w-5 h-5" />, group: 'insertar', active: shapesMode === 'frames', onClick: (e) => { setShapesTop(e.currentTarget.getBoundingClientRect().top); setShapesMode((m) => (m === 'frames' ? null : 'frames')); } },
    { id: 'sign', label: 'Firma', title: 'Agregar firma', icon: <SignatureIcon className="w-5 h-5" />, group: 'insertar', onClick: p.onOpenSignature },
    { id: 'page', label: 'Hoja', title: 'Agregar una hoja en blanco', icon: <FilePlus className="w-5 h-5" />, group: 'insertar', onClick: p.onAddPage },
    { id: 'pdfedit', label: 'Editar PDF', title: 'Editar el texto de un PDF importado (toca un texto)', icon: <FilePenLine className="w-5 h-5" />, group: 'editar', active: p.pdfEditOn, onClick: p.onTogglePdfEdit },
    { id: 'extract', label: 'Objeto PDF', title: 'Sacar un logo u objeto de la hoja de un PDF como imagen aparte', icon: <ScanSearch className="w-5 h-5" />, group: 'editar', onClick: p.onExtractObject },
    // «Ordenar» solo aparece cuando la hoja tiene 2 o más imágenes (las firmas no cuentan).
    ...(canArrange
      ? [{ id: 'arrange', label: 'Ordenar', title: 'Ordenar las imágenes de esta hoja', icon: <LayoutTemplate className="w-5 h-5" />, group: 'editar' as const, badge: p.imageCount, active: arrangeOpen, onClick: (e: MouseEvent<HTMLElement>) => { setArrangeTop(e.currentTarget.getBoundingClientRect().top); setArrangeOpen((v) => !v); } }]
      : []),
  ];
  const byId = (id: string) => tools.find((t) => t.id === id)!;
  const essentials = ['import', 'image', 'text', 'pdfedit', 'sign'].map(byId);

  const tone = (t: Tool) =>
    t.active ? 'text-blue-600 bg-blue-600/10' : t.accent ? 'text-blue-500 hover:bg-blue-600/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/70';

  const ToolBtn = ({ t, variant }: { t: Tool; variant: 'rail' | 'bar' | 'drawer' }) => {
    const size =
      variant === 'rail' ? 'py-2 mx-1.5' : variant === 'bar' ? 'flex-1 min-w-0 py-1.5' : 'py-3 border border-slate-800 bg-slate-900/40';
    return (
      <button
        type="button"
        data-tour={t.id}
        data-keep-selection
        disabled={t.disabled}
        title={t.title}
        onClick={(e) => {
          t.onClick(e);
          if (variant === 'drawer') closeDrawer();
        }}
        className={`relative flex flex-col items-center gap-1 rounded-lg transition disabled:opacity-30 ${size} ${tone(t)}`}
      >
        {t.icon}
        <span className="text-[10px] leading-none">{t.label}</span>
        {t.badge ? (
          <span className="absolute top-1 right-2 bg-blue-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{t.badge}</span>
        ) : null}
      </button>
    );
  };

  const nextTheme = () => p.onTheme(p.theme === 'light' ? 'dark' : p.theme === 'dark' ? 'navy' : p.theme === 'navy' ? 'auto' : 'light');
  const themeNow = THEMES.find((t) => t.id === p.theme)!;

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.gif,.webp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) p.onAddImages(files);
          e.target.value = '';
        }}
      />

      {/* ============ PC: barra lateral izquierda ============ */}
      <nav
        data-icon-rail
        data-tour-area="rail"
        className="max-md:hidden w-[84px] bg-slate-950 border-r border-slate-800 flex flex-col py-2 gap-0.5 print:hidden shrink-0 overflow-y-auto no-scrollbar"
      >
        {GROUPS.map((g) => (
          <div key={g.id} className="flex flex-col gap-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 px-3 pt-2 pb-0.5">{g.label}</div>
            {tools.filter((t) => t.group === g.id).map((t) => (
              <ToolBtn key={t.id} t={t} variant="rail" />
            ))}
          </div>
        ))}
        <div className="mt-auto pt-2 border-t border-slate-800 mx-2 flex flex-col gap-0.5">
          <button type="button" data-tour="theme" onClick={nextTheme} title={`Tema: ${themeNow.label} (clic para cambiar)`} className="flex flex-col items-center gap-1 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70">
            {themeNow.icon}
            <span className="text-[10px] leading-none">{themeNow.label}</span>
          </button>
          <button type="button" data-tour="help" onClick={p.onOpenTour} title="Ver el tutorial paso a paso" className="flex flex-col items-center gap-1 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70">
            <HelpCircle className="w-5 h-5" />
            <span className="text-[10px] leading-none">Ayuda</span>
          </button>
        </div>
      </nav>

      {/* ============ Celular: barra inferior fija (solo lo esencial) ============ */}
      <nav
        data-icon-rail
        data-tour-area="bar"
        className="md:hidden bg-slate-950 border-t border-slate-800 flex items-stretch gap-0.5 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] print:hidden shrink-0 z-30"
      >
        <button
          type="button"
          data-tour="menu"
          data-keep-selection
          onClick={() => p.setDrawerOpen(!p.drawerOpen)}
          title="Todas las herramientas"
          className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-1.5 rounded-lg ${p.drawerOpen ? 'text-blue-600 bg-blue-600/10' : 'text-slate-400'}`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] leading-none">Menú</span>
        </button>
        {essentials.map((t) => (
          <ToolBtn key={t.id} t={t} variant="bar" />
        ))}
      </nav>

      {/* ============ Celular: menú lateral (cajón) ============ */}
      {p.drawerOpen && <div className="md:hidden fixed inset-0 z-[44] bg-slate-950/50" onClick={closeDrawer} />}
      <aside
        data-keep-selection
        className={`md:hidden fixed top-0 bottom-0 left-0 z-[45] w-[84%] max-w-[320px] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col transition-transform duration-200 print:hidden ${
          p.drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!p.drawerOpen}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <div className="text-sm font-bold text-white">{SITE.name}</div>
            <div className="text-[11px] text-slate-400">Todas las herramientas</div>
          </div>
          <button type="button" onClick={closeDrawer} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700" title="Cerrar menú">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {GROUPS.map((g) => (
            <section key={g.id}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{g.label}</h3>
              <div className="grid grid-cols-3 gap-2">
                {tools.filter((t) => t.group === g.id).map((t) => (
                  <ToolBtn key={t.id} t={t} variant="drawer" />
                ))}
              </div>
            </section>
          ))}

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Hoja actual</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                ['move-up', 'Subir', <ArrowUp key="u" className="w-4 h-4" />],
                ['move-down', 'Bajar', <ArrowDown key="d" className="w-4 h-4" />],
                ['orientation', 'Girar', <RotateCw key="r" className="w-4 h-4" />],
                ['duplicate', 'Copiar', <CopyPlus key="c" className="w-4 h-4" />],
                ['delete', 'Borrar', <Trash2 key="x" className="w-4 h-4" />],
              ] as [PageAction, string, ReactNode][]).map(([a, label, icon]) => (
                <button key={a} type="button" onClick={() => { p.onPageAction(a); }} className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border border-slate-800 bg-slate-900/40 ${a === 'delete' ? 'text-rose-500' : 'text-slate-300'}`}>
                  {icon}
                  <span className="text-[10px] leading-none">{label}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <button type="button" onClick={() => p.onGoToPage(-1)} className="flex items-center justify-center gap-1 py-2 rounded-lg border border-slate-800 text-xs text-slate-300"><ChevronLeft className="w-4 h-4" />Hoja anterior</button>
              <button type="button" onClick={() => p.onGoToPage(1)} className="flex items-center justify-center gap-1 py-2 rounded-lg border border-slate-800 text-xs text-slate-300">Hoja siguiente<ChevronRight className="w-4 h-4" /></button>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Apariencia</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map((t) => (
                <button key={t.id} type="button" onClick={() => p.onTheme(t.id)} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs ${p.theme === t.id ? 'border-blue-600 text-blue-600 bg-blue-600/10' : 'border-slate-800 text-slate-300'}`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Ayuda</h3>
            <button type="button" onClick={() => { closeDrawer(); p.onOpenHome(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-800 text-sm text-slate-200"><LayoutDashboard className="w-4 h-4 text-blue-600" />Inicio · todas las tareas</button>
            <button type="button" onClick={() => { closeDrawer(); p.onOpenTour(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-800 text-sm text-slate-200"><HelpCircle className="w-4 h-4 text-blue-600" />Tutorial paso a paso</button>
            {p.canInstall && (
              <button type="button" onClick={() => { closeDrawer(); p.onInstall(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 text-sm text-white font-medium"><Download className="w-4 h-4" />Instalar la aplicación</button>
            )}
          </section>
        </div>
      </aside>

      <ShapesMenu open={shapesMode !== null} mode={shapesMode ?? 'shapes'} top={shapesTop} onPickShape={p.onInsertShape} onPickFrame={p.onInsertFrame} onClose={() => setShapesMode(null)} />
      <ArrangeMenu open={arrangeOpen && canArrange} top={arrangeTop} imageCount={p.imageCount} onSelect={p.onArrange} onClose={() => setArrangeOpen(false)} />
    </>
  );
}
