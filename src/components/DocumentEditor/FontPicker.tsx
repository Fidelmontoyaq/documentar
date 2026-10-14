import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Link2, Search, Trash2, Upload, X } from 'lucide-react';
import {
  BUILTIN_FONTS,
  CATEGORY_LABELS,
  addFontFromLink,
  addFontFiles,
  ensurePreviewCss,
  ensureValueLoaded,
  fontLabelFor,
  getCustomFonts,
  initCustomFonts,
  matchesQuery,
  removeCustomFont,
  subscribeFonts,
  type FontCategory,
  type LibFont,
} from '../../engine/fontLibrary';

interface FontPickerProps {
  value: string;
  recentFonts: string[];
  onChange: (value: string) => void;
  /** Texto del botón cuando `value` está vacío. */
  placeholder?: string;
  /** Botón estrecho (barra superior) o ancho completo (panel). */
  compact?: boolean;
  /** Se llama al abrir (p. ej. para guardar la selección de texto). */
  onOpen?: () => void;
  /** Mostrar el panel hacia arriba (por si el botón está muy abajo). */
  className?: string;
}

type Filter = 'all' | 'mine' | FontCategory;

const CHIPS: [Filter, string][] = [
  ['all', 'Todas'],
  ['mine', 'Mis fuentes'],
  ['sans', CATEGORY_LABELS.sans],
  ['serif', CATEGORY_LABELS.serif],
  ['display', CATEGORY_LABELS.display],
  ['script', CATEGORY_LABELS.script],
  ['mono', CATEGORY_LABELS.mono],
];

/** Selector de tipografías con buscador, categorías, fuentes propias (archivo o enlace) y recientes. */
export function FontPicker({ value, recentFonts, onChange, placeholder = 'Fuente', compact = false, onOpen, className = '' }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const custom = useSyncExternalStore(subscribeFonts, getCustomFonts, getCustomFonts);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

  useEffect(() => {
    void initCustomFonts();
  }, []);

  const openPicker = () => {
    onOpen?.();
    ensurePreviewCss();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = 360;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const useAbove = below < 320 && above > below;
      const maxH = Math.max(260, Math.min(720, useAbove ? above : below));
      setPos({ left, top: useAbove ? Math.max(8, r.top - maxH - 6) : r.bottom + 6, maxH });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => !isMobile && searchRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  const pick = (f: LibFont) => {
    ensureValueLoaded(f.value);
    onChange(f.value);
    setOpen(false);
  };

  const filtered = useMemo(() => {
    const all = [...custom, ...BUILTIN_FONTS];
    const base = filter === 'mine' ? custom : filter === 'all' ? all : all.filter((f) => f.category === filter);
    return base.filter((f) => matchesQuery(f, query));
  }, [custom, filter, query]);

  const recents = useMemo(() => {
    if (query || filter !== 'all') return [];
    const all = [...custom, ...BUILTIN_FONTS];
    return recentFonts.map((v) => all.find((f) => f.value === v)).filter((f): f is LibFont => !!f).slice(0, 5);
  }, [recentFonts, custom, query, filter]);

  const mine = filter === 'all' && !query ? custom : [];
  const rest = filter === 'all' && !query ? BUILTIN_FONTS.filter((f) => matchesQuery(f, query)) : filtered;

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const res = await addFontFiles(files);
    setBusy(false);
    if (res.added.length) {
      setFilter('mine');
      setMsg({ ok: true, text: `Añadida${res.added.length > 1 ? 's' : ''}: ${res.added.map((a) => a.label).join(', ')}` });
    } else setMsg({ ok: false, text: res.errors[0] ?? 'No se pudo añadir.' });
  };

  const onLink = async () => {
    if (!linkUrl.trim()) return;
    setBusy(true);
    const res = await addFontFromLink(linkUrl, linkName);
    setBusy(false);
    if (res.needsName) {
      setNeedsName(true);
      setMsg({ ok: false, text: 'No pude deducir el nombre. Escríbelo tal como lo usa la hoja de estilos.' });
    } else if (res.added.length) {
      setLinkUrl('');
      setLinkName('');
      setNeedsName(false);
      setLinkOpen(false);
      setFilter('mine');
      setMsg({ ok: true, text: `Añadida${res.added.length > 1 ? 's' : ''}: ${res.added.map((a) => a.label).join(', ')}` });
    } else setMsg({ ok: false, text: res.errors[0] ?? 'No se pudo añadir.' });
  };

  const row = (f: LibFont, key: string) => {
    const on = f.value === value || f.label === fontLabelFor(value);
    return (
      <div key={key} className={`group flex items-center border-b border-slate-800/60 ${on ? 'bg-blue-600/20' : 'hover:bg-slate-800'}`}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(f)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left px-3 py-[10px]"
        >
          <span className="truncate text-[15px] leading-tight text-slate-100" style={{ fontFamily: f.value }}>{f.label}</span>
          <span className="ml-auto shrink-0 text-xs text-slate-500" style={{ fontFamily: f.value }}>AaBbCc</span>
          {on && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
        </button>
        {f.source === 'custom' && f.customId && (
          <button
            type="button"
            title="Quitar esta fuente"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void removeCustomFont(f.customId!)}
            className="px-2 text-slate-500 hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const section = (label: string) => (
    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400 sticky top-0 bg-slate-900/95">{label}</div>
  );

  const panel = (
    <div
      data-keep-selection
      onMouseDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName !== 'INPUT') e.preventDefault();
      }}
      className={
        isMobile
          ? 'fixed inset-x-0 bottom-0 z-[95] bg-slate-900 border-t border-slate-700 rounded-t-2xl shadow-xl flex flex-col max-h-[78dvh]'
          : 'fixed z-[95] w-[360px] bg-slate-900 border border-slate-700 rounded-xl shadow-xl flex flex-col'
      }
      style={!isMobile && pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxH } : undefined}
    >
      <div className="p-2 space-y-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Prueba con “Caligrafía” o “Aleo”"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 pl-8 pr-7 py-1.5 outline-none focus:border-blue-500"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button type="button" title="Subir fuente (TTF, OTF, WOFF)" onClick={() => fileRef.current?.click()} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-blue-500">
            <Upload className="w-4 h-4" />
          </button>
          <button type="button" title="Añadir desde un enlace" onClick={() => setLinkOpen((v) => !v)} className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border ${linkOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-blue-500'}`}>
            <Link2 className="w-4 h-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={(e) => {
              void onFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>

        {linkOpen && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void onLink()}
                placeholder="Enlace de Google Fonts o archivo .ttf/.woff"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 px-2 py-1.5 outline-none focus:border-blue-500"
              />
              <button type="button" disabled={busy || !linkUrl.trim()} onClick={() => void onLink()} className="px-3 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">
                Añadir
              </button>
            </div>
            {needsName && (
              <input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Nombre de la fuente"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 px-2 py-1.5 outline-none focus:border-blue-500"
              />
            )}
          </div>
        )}

        {msg && <div className={`text-[11px] ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{busy ? 'Cargando…' : msg.text}</div>}

        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
          {CHIPS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition ${filter === id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
            >
              {label}{id === 'mine' && custom.length ? ` (${custom.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 pb-2">
        {mine.length > 0 && (<>{section('Mis fuentes')}{mine.map((f) => row(f, `m-${f.value}`))}</>)}
        {recents.length > 0 && (<>{section('Usadas recientemente')}{recents.map((f) => row(f, `r-${f.value}`))}</>)}
        {rest.length > 0 && (<>{section(filter === 'all' && !query ? 'Todas las fuentes' : `${rest.length} resultado${rest.length === 1 ? '' : 's'}`)}{rest.map((f) => row(f, `a-${f.value}`))}</>)}
        {filter === 'mine' && custom.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">
            Aún no tienes fuentes propias. Sube un archivo con <Upload className="inline w-3 h-3" /> o pega un enlace con <Link2 className="inline w-3 h-3" />.
          </div>
        )}
        {filtered.length === 0 && filter !== 'mine' && (
          <div className="px-4 py-6 text-center text-xs text-slate-400">No hay fuentes con “{query}”.</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="Elegir tipografía"
        className={`flex items-center gap-2 bg-slate-800 border rounded-lg text-slate-100 outline-none transition ${open ? 'border-blue-500' : 'border-slate-700 hover:border-slate-500'} ${compact ? 'text-xs py-1.5 px-2 max-w-[150px]' : 'w-full text-sm py-2.5 px-3'} ${className}`}
      >
        <span className="truncate" style={value ? { fontFamily: value } : undefined}>{value ? fontLabelFor(value) : placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0 text-slate-400" />
      </button>
      {open &&
        createPortal(
          <div className="de-portal">
            <div data-keep-selection className="fixed inset-0 z-[94] bg-black/40 md:bg-transparent" onClick={() => setOpen(false)} />
            {panel}
          </div>,
          document.body
        )}
    </>
  );
}
