import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Unlock, Save, Trash2, Magnet, Grid3x3, Crop, Maximize2, Minimize2, ScanLine, Instagram, Facebook, Youtube, Linkedin, Twitter, MessageCircle, Pin, Music2, Check } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import {
  SIZE_GROUPS,
  SOCIAL_NETS,
  OTHER_SIZES,
  fromPx,
  loadSavedSizes,
  sizeLabel,
  storeSavedSizes,
  toPx,
  type SavedSize,
  type SizePreset,
  type SizeUnit,
} from '../../engine/pageSizes';
import type { PageInfo, PageScope } from '../../types/documentEditor';

interface CanvasPanelProps {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
  info: PageInfo | null;
  pageCount: number;
  /** Posición (0 = primera) de la hoja donde estás. */
  activeIndex: number;
}

const sec = 'bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 space-y-2.5';
const ttl = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
const fld = 'bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 py-1.5 px-2 outline-none focus:border-blue-500 w-full';
const chip = (on: boolean) =>
  `px-2.5 py-1.5 rounded-lg text-xs border transition ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`;

type ScopeKind = 'page' | 'all' | 'from' | 'until' | 'pick';
type Tab = 'doc' | 'screen' | 'social' | 'own';

/** Rectángulo en miniatura con la proporción real del tamaño (para reconocerlo de un vistazo). */
function Mini({ w, h, on, box = 40 }: { w: number; h: number; on?: boolean; box?: number }) {
  const k = Math.min(box / w, box / h);
  return (
    <span className="flex items-center justify-center shrink-0" style={{ width: box, height: box }}>
      <span
        className={`block rounded-[3px] border ${on ? 'border-blue-300 bg-white/90' : 'border-slate-500 bg-slate-700/40'}`}
        style={{ width: Math.max(8, Math.round(w * k)), height: Math.max(8, Math.round(h * k)) }}
      />
    </span>
  );
}

function SizeTile({ p, on, onPick }: { p: SizePreset; on: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500'}`}>
      <Mini w={p.w} h={p.h} on={on} />
      <span className="text-[11px] font-semibold leading-tight">{p.label}</span>
      <span className="text-[10px] opacity-70 leading-none">{p.hint}</span>
    </button>
  );
}

const NET_ICON: Record<string, ReactNode> = {
  instagram: <Instagram className="w-4 h-4" />,
  facebook: <Facebook className="w-4 h-4" />,
  youtube: <Youtube className="w-4 h-4" />,
  linkedin: <Linkedin className="w-4 h-4" />,
  x: <Twitter className="w-4 h-4" />,
  whatsapp: <MessageCircle className="w-4 h-4" />,
  tiktok: <Music2 className="w-4 h-4" />,
  pinterest: <Pin className="w-4 h-4" />,
};

/** Panel de tamaño de hoja: tamaños vistos en miniatura, redes sociales, orientación y a qué hojas se aplica. */
export function CanvasPanel({ open, onClose, engine, info, pageCount, activeIndex }: CanvasPanelProps) {
  const [scopeKind, setScopeKind] = useState<ScopeKind>('page');
  const [picked, setPicked] = useState<number[]>([]);
  const [tab, setTab] = useState<Tab>('doc');
  const [unit, setUnit] = useState<SizeUnit>('px');
  const [cw, setCw] = useState(1080);
  const [ch, setCh] = useState(1080);
  const [lock, setLock] = useState(false);
  const [saved, setSaved] = useState<SavedSize[]>(() => loadSavedSizes());
  const [bgColor, setBgColor] = useState('#ffffff');
  const [pad, setPad] = useState(0);

  // Al abrir o cambiar de hoja, los campos muestran el tamaño actual.
  useEffect(() => {
    if (!open || !info) return;
    setCw(fromPx(info.w, unit));
    setCh(fromPx(info.h, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, info?.w, info?.h, unit]);

  if (!open) return null;

  const scope: PageScope = scopeKind === 'pick' ? picked : scopeKind;
  const noTarget = scopeKind === 'pick' && picked.length === 0;
  const pdfOnly = info?.pdf ?? false;
  const apply = (w: number, h: number, kind: 'doc' | 'design') => { if (!noTarget) engine?.setCanvasSize(w, h, { scope, kind }); };
  const ratio = cw > 0 && ch > 0 ? cw / ch : 1;
  const hasImages = (info?.images ?? 0) > 0;
  const bg = info?.bg ?? 'white';
  const isOn = (p: SizePreset) => !!info && Math.abs(info.w - p.w) <= 2 && Math.abs(info.h - p.h) <= 2;
  const landscape = !!info && info.w > info.h;
  const bgScope: PageScope = noTarget ? 'page' : scope;

  const save = () => {
    const w = toPx(cw, unit);
    const h = toPx(ch, unit);
    const name = window.prompt('Nombre para este tamaño:', `${w}×${h}`)?.trim();
    if (!name) return;
    const next = [{ name, w, h }, ...saved.filter((s) => s.name !== name)];
    setSaved(next);
    storeSavedSizes(next);
  };
  const removeSaved = (name: string) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next);
    storeSavedSizes(next);
  };
  const togglePick = (i: number) => setPicked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i].sort((a, b) => a - b)));

  const scopes: [ScopeKind, string][] = [
    ['page', 'Solo esta hoja'],
    ['all', `Todas (${pageCount})`],
    ['from', `De la ${activeIndex + 1} en adelante`],
    ['until', `Hasta la ${activeIndex + 1} (atrás)`],
    ['pick', 'Elegir hojas…'],
  ];

  return createPortal(
    <div className="de-portal"><div data-keep-selection className="fixed inset-0 z-[75] flex items-end md:items-start md:justify-end print:hidden max-md:pointer-events-auto md:pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/50 md:hidden" onClick={onClose} />
      <div className="relative md:pointer-events-auto bg-slate-900 border border-slate-700 shadow-2xl w-full md:w-[400px] h-[90dvh] md:h-auto md:max-h-[calc(100vh-70px)] md:mt-[56px] md:mr-3 rounded-t-2xl md:rounded-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-white font-bold text-base leading-tight">Tamaño de hoja</h2>
            <p className="text-[11px] text-slate-400">
              {info ? `Ahora: ${sizeLabel(info.w, info.h)} · ${info.w}×${info.h} px` : 'Elige el tamaño de tu hoja o lienzo'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className={sec}>
            <div className={ttl}>Aplicar a</div>
            <div className="flex flex-wrap gap-1.5">
              {scopes.map(([v, l]) => (
                <button key={v} type="button" disabled={(v === 'from' || v === 'until') && pageCount < 2} onClick={() => setScopeKind(v)} className={`${chip(scopeKind === v)} disabled:opacity-40`}>
                  {l}
                </button>
              ))}
            </div>
            {scopeKind === 'pick' && (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button key={i} type="button" onClick={() => togglePick(i)} className={`w-8 h-8 rounded-lg text-xs font-semibold border flex items-center justify-center ${picked.includes(i) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                      {picked.includes(i) ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{picked.length ? `Hojas elegidas: ${picked.map((i) => i + 1).join(', ')}` : 'Toca los números de las hojas que quieres cambiar.'}</p>
              </div>
            )}
          </div>

          <div className={sec}>
            <div className={ttl}>Orientación</div>
            <div className="grid grid-cols-2 gap-2">
              {([['portrait', 'Vertical', 24, 32], ['landscape', 'Horizontal', 32, 24]] as const).map(([o, l, w, h]) => {
                const on = !!info && (o === 'landscape') === landscape;
                return (
                  <button key={o} type="button" disabled={!info || noTarget} onClick={() => engine?.setOrientationScope(o, scope)} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition disabled:opacity-40 ${on ? 'border-blue-500 bg-blue-600/10 text-blue-500' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                    <span className="block rounded-[3px] border-2 border-current" style={{ width: w * 0.7, height: h * 0.7 }} /> {l}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500">Se aplica a las hojas elegidas arriba: así puedes dejar unas en vertical y otras en horizontal.</p>
          </div>

          <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            {([['doc', 'Documento'], ['screen', 'Pantalla'], ['social', 'Redes'], ['own', 'Propio']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTab(v)} className={`flex-1 text-xs py-1.5 rounded-md transition ${tab === v ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>{l}</button>
            ))}
          </div>

          {tab === 'doc' && (
            <div className="grid grid-cols-3 gap-2">
              {SIZE_GROUPS.find((g) => g.id === 'doc')!.items.map((p) => <SizeTile key={p.id} p={p} on={isOn(p)} onPick={() => apply(p.w, p.h, 'doc')} />)}
            </div>
          )}
          {tab === 'screen' && (
            <div className="grid grid-cols-3 gap-2">
              {SIZE_GROUPS.find((g) => g.id === 'slides')!.items.map((p) => <SizeTile key={p.id} p={p} on={isOn(p)} onPick={() => apply(p.w, p.h, 'design')} />)}
            </div>
          )}
          {tab === 'social' && (
            <div className="space-y-3">
              {SOCIAL_NETS.map((n) => (
                <div key={n.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: n.color, color: '#fff' }}>{NET_ICON[n.id]}</span>
                    <span className="text-sm font-semibold text-white">{n.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {n.items.map((p) => <SizeTile key={p.id} p={p} on={isOn(p)} onPick={() => apply(p.w, p.h, 'design')} />)}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-sm font-semibold text-white mb-1.5">Otros</div>
                <div className="grid grid-cols-3 gap-2">
                  {OTHER_SIZES.map((p) => <SizeTile key={p.id} p={p} on={isOn(p)} onPick={() => apply(p.w, p.h, 'design')} />)}
                </div>
              </div>
            </div>
          )}
          {tab === 'own' && (
            <div className="space-y-3">
              <div className={sec}>
                <div className={ttl}>Tamaño propio</div>
                <div className="flex items-end gap-1.5">
                  <label className="flex-1 text-[10px] text-slate-500">Ancho
                    <input type="number" min={1} value={cw} onChange={(e) => { const v = Number(e.target.value) || 0; setCw(v); if (lock && ratio) setCh(Math.round((v / ratio) * 100) / 100); }} className={fld} />
                  </label>
                  <button type="button" onClick={() => setLock((v) => !v)} title="Mantener proporción" className={`${chip(lock)} !px-2 mb-px`}>
                    {lock ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                  <label className="flex-1 text-[10px] text-slate-500">Alto
                    <input type="number" min={1} value={ch} onChange={(e) => { const v = Number(e.target.value) || 0; setCh(v); if (lock && ratio) setCw(Math.round(v * ratio * 100) / 100); }} className={fld} />
                  </label>
                  <select value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)} className={`${fld} !w-[64px] mb-px`}>
                    <option value="px">px</option>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => apply(toPx(cw, unit), toPx(ch, unit), 'design')} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white">Aplicar tamaño</button>
                  <button type="button" onClick={save} title="Guardar este tamaño" className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"><Save className="w-4 h-4" /></button>
                </div>
              </div>
              {saved.length > 0 && (
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">Mis tamaños guardados</div>
                  <div className="space-y-1">
                    {saved.map((sv) => (
                      <div key={sv.name} className="flex items-center gap-1">
                        <button type="button" onClick={() => apply(sv.w, sv.h, 'design')} className={`flex-1 text-left flex items-center gap-2 ${chip(false)}`}>
                          <Mini w={sv.w} h={sv.h} box={24} /><span className="text-xs">{sv.name}</span> <span className="text-[10px] opacity-60">{sv.w}×{sv.h}</span>
                        </button>
                        <button type="button" onClick={() => removeSaved(sv.name)} className="p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={sec}>
            <div className={ttl}>Fondo</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => engine?.setPageBackground('white', bgScope)} className={chip(bg === 'white')}>Blanco</button>
              <button type="button" onClick={() => engine?.setPageBackground('transparent', bgScope)} className={chip(bg === 'transparent')}>Transparente</button>
              <label className={`${chip(bg !== 'white' && bg !== 'transparent')} flex items-center gap-1.5 cursor-pointer`}>
                Color
                <input type="color" value={bg.startsWith('#') ? bg : bgColor} onChange={(e) => { setBgColor(e.target.value); engine?.setPageBackground(e.target.value, bgScope); }} className="w-6 h-5 bg-transparent cursor-pointer" />
              </label>
            </div>
            {bg === 'transparent' && <p className="text-[11px] text-slate-400">Los cuadritos grises solo se ven aquí. Exporta como PNG para conservar la transparencia (JPG y PDF salen con fondo blanco).</p>}
          </div>

          <div className={sec}>
            <div className={ttl}>Ajustar a la imagen</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" disabled={!hasImages} onClick={() => engine?.fitCanvasToImage()} className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-40`}><ScanLine className="w-4 h-4" /> Lienzo a la imagen</button>
              <button type="button" disabled={!info || (info.images === 0 && pageCount === 0)} onClick={() => engine?.fitCanvasToContent(pad)} className={`${chip(false)} flex items-center gap-1.5`}><Crop className="w-4 h-4" /> Recortar al contenido</button>
              <button type="button" disabled={!hasImages} onClick={() => engine?.fitImageToCanvas('cover')} className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-40`}><Maximize2 className="w-4 h-4" /> Imagen llena el lienzo</button>
              <button type="button" disabled={!hasImages} onClick={() => engine?.fitImageToCanvas('contain')} className={`${chip(false)} flex items-center gap-1.5 disabled:opacity-40`}><Minimize2 className="w-4 h-4" /> Imagen entera</button>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">Margen al recortar (px)
              <input type="number" min={0} max={200} value={pad} onChange={(e) => setPad(Math.max(0, Number(e.target.value) || 0))} className={`${fld} !w-20`} />
            </label>
            <p className="text-[10px] text-slate-500">«Recortar al contenido» deja el lienzo justo del tamaño de lo que hay en la hoja: ideal para stickers y logos.</p>
          </div>

          {info?.kind === 'design' && !pdfOnly && (
            <label className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={info.hf} onChange={(e) => engine?.setHeaderFooterVisible(e.target.checked, bgScope)} />
              <span className="text-xs text-slate-200">Mostrar título, texto y pie de página</span>
            </label>
          )}

          <div className={sec}>
            <div className={ttl}>Guías</div>
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={info?.snap ?? true} onChange={(e) => engine?.setSnap(e.target.checked)} />
              <Magnet className="w-4 h-4 text-pink-400" /> Imán: pegar a bordes, centro y otros elementos
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={info?.grid ?? false} onChange={(e) => engine?.setGrid(e.target.checked)} />
              <Grid3x3 className="w-4 h-4 text-blue-400" /> Cuadrícula (cada 50 px)
            </label>
            <p className="text-[10px] text-slate-500">Mantén Alt al arrastrar para mover sin imán.</p>
          </div>
        </div>
      </div>
    </div></div>,
    document.body
  );
}
