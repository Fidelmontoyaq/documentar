import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Hash, FileUp, Trash2, Download, Loader2, CheckCircle2, AlertTriangle, ArrowDown10, ArrowUp01 } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import {
  FOLIO_PRESETS,
  folioPosition,
  folioText,
  loadFolioConfig,
  renderFolioBadge,
  saveFolioConfig,
  type FolioConfig,
  type FolioHorizontal,
  type FolioVertical,
} from '../../engine/folio';
import { BATCH_ACCEPT, downloadBlob, foliateFiles, type FolioBatchFileResult } from '../../engine/folioBatch';
import { groupedFontOptions } from '../../engine/fontCatalog';

interface FolioModalProps {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
  pageCount: number;
  recentFonts: string[];
}

const field = 'bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 py-1.5 px-2 outline-none focus:border-blue-500';
const label = 'block text-[11px] font-medium text-slate-400 mb-1';
const section = 'bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 space-y-3';
const h = 'text-[11px] font-bold uppercase tracking-wider text-slate-400';

const PAGE_W = 794;
const PAGE_H = 1123;

/** Vista previa en vivo: una hoja en miniatura con el sello donde quedará. */
function Preview({ cfg, index, total }: { cfg: FolioConfig; index: number; total: number }) {
  const [badge, setBadge] = useState<{ url: string; w: number; h: number } | null>(null);
  const text = folioText(index, total, cfg) ?? folioText(Math.max(cfg.skipFirst, 0), total, cfg);
  useEffect(() => {
    let alive = true;
    if (!text) return;
    void renderFolioBadge(text, cfg, 3).then((b) => {
      if (alive) setBadge({ url: b.canvas.toDataURL('image/png'), w: b.w, h: b.h });
    });
    return () => {
      alive = false;
    };
  }, [text, cfg]);
  const pos = badge ? folioPosition(cfg, PAGE_W, PAGE_H, badge.w, badge.h) : null;
  return (
    <div className="mx-auto bg-white rounded shadow-xl relative overflow-hidden" style={{ width: 170, aspectRatio: `${PAGE_W} / ${PAGE_H}` }}>
      <div className="absolute inset-0 p-3 space-y-1.5 opacity-40">
        <div className="h-2 w-2/3 bg-slate-400 rounded mx-auto mb-2" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-1 bg-slate-300 rounded" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
        ))}
      </div>
      {badge && pos && (
        <img
          src={badge.url}
          alt=""
          className="absolute"
          style={{ left: `${(pos.x / PAGE_W) * 100}%`, top: `${(pos.y / PAGE_H) * 100}%`, width: `${(badge.w / PAGE_W) * 100}%` }}
        />
      )}
    </div>
  );
}

/**
 * Foliado: un solo diseño (texto, orden, posición, tipografía, forma, color,
 * transparencia) que se usa de dos maneras: sobre el documento abierto o
 * aplicado a muchos archivos a la vez, descargándolos ya foliados.
 */
export function FolioModal({ open, onClose, engine, pageCount, recentFonts }: FolioModalProps) {
  const [cfg, setCfg] = useState<FolioConfig>(() => loadFolioConfig());
  const [tab, setTab] = useState<'doc' | 'batch'>('doc');
  const [files, setFiles] = useState<File[]>([]);
  const [numbering, setNumbering] = useState<'each' | 'continuous'>('each');
  const [output, setOutput] = useState<'zip' | 'merged'>('zip');
  const [running, setRunning] = useState<{ done: number; total: number; current: string } | null>(null);
  const [results, setResults] = useState<FolioBatchFileResult[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { recent, rest } = groupedFontOptions(recentFonts);

  // Al abrir, retoma el estado real del documento (por si ya estaba activado).
  useEffect(() => {
    if (!open || !engine) return;
    const live = engine.getFolioConfig();
    setCfg((prev) => ({ ...prev, enabled: live.enabled }));
    setResults(null);
    setBatchError(null);
  }, [open, engine]);

  const update = (patch: Partial<FolioConfig>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      saveFolioConfig(next);
      // El diseño se ve al instante en el documento si el folio está activado.
      if (engine && (next.enabled || engine.getFolioConfig().enabled)) engine.setFolioConfig(next);
      return next;
    });
  };

  const previewTotal = tab === 'doc' ? Math.max(pageCount, 3) : 12;
  const previewIndex = Math.min(Math.max(cfg.skipFirst, 0) + 1, previewTotal - 1);

  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => /\.(pdf|png|jpe?g|webp|gif)$/i.test(f.name));
    setFiles((prev) => [...prev, ...ok]);
    setResults(null);
    setBatchError(null);
  };

  const runBatch = async () => {
    if (!files.length) return;
    setBatchError(null);
    setResults(null);
    setRunning({ done: 0, total: files.length * 2, current: 'Preparando…' });
    try {
      const res = await foliateFiles(files, cfg, { numbering, output }, (done, total, current) =>
        setRunning({ done, total, current })
      );
      downloadBlob(res.blob, res.filename);
      setResults(res.results);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Ocurrió un error al foliar.');
    } finally {
      setRunning(null);
    }
  };

  const grid = useMemo(
    () =>
      (['top', 'middle', 'bottom'] as FolioVertical[]).flatMap((v) =>
        (['left', 'center', 'right'] as FolioHorizontal[]).map((hz) => ({ v, hz }))
      ),
    []
  );
  const vLabel = { top: 'arriba', middle: 'centro', bottom: 'abajo' } as const;
  const hLabel = { left: 'izquierda', center: 'centro', right: 'derecha' } as const;

  if (!open) return null;

  return createPortal(
    <div data-keep-selection className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-4 print:hidden">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 md:rounded-2xl shadow-2xl w-full max-w-5xl h-[94dvh] md:h-auto md:max-h-[92vh] flex flex-col rounded-t-2xl">
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-white font-bold text-base leading-tight">Foliado de páginas</h2>
              <p className="text-[11px] text-slate-400">Numera este documento o muchos archivos a la vez</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1fr_320px] min-h-0">
          {/* ---------- DISEÑO ---------- */}
          <div className="md:overflow-y-auto p-4 md:p-5 space-y-3 md:border-r border-slate-800">
            <div className={section}>
              <div className={h}>Estilos rápidos</div>
              <div className="flex flex-wrap gap-1.5">
                {FOLIO_PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => update(p.patch)} className="px-2.5 py-1 rounded-full text-xs bg-slate-800 hover:bg-blue-600 border border-slate-700 text-slate-200 hover:text-white transition">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={section}>
              <div className={h}>Texto y numeración</div>
              <div>
                <label className={label}>Texto (usa {'{n}'} para el número y {'{total}'} para el último)</label>
                <input value={cfg.template} onChange={(e) => update({ template: e.target.value })} className={`${field} w-full`} placeholder="Pág. {n} de {total}" />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['{n}', '{total}', 'Pág. ', 'Folio ', 'N.º ', ' de ', ' / ', '— ', ' —', '•', '·', '°'].map((t) => (
                    <button key={t} type="button" onClick={() => update({ template: cfg.template + t })} className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono">
                      {t.replace(/ /g, '␣')}
                    </button>
                  ))}
                  <button type="button" onClick={() => update({ template: '{n}' })} className="px-2 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400">
                    Borrar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                  {(
                    [
                      ['asc', 'Ascendente 1, 2, 3…', ArrowUp01],
                      ['desc', 'Descendente …3, 2, 1', ArrowDown10],
                    ] as const
                  ).map(([v, l, Icon]) => (
                    <button key={v} type="button" onClick={() => update({ order: v })} className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition ${cfg.order === v ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>
                      <Icon className="w-4 h-4" /> {l}
                    </button>
                  ))}
                </div>
                <div>
                  <label className={label}>Empezar en</label>
                  <input type="number" min={0} value={cfg.start} onChange={(e) => update({ start: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${field} w-full`} />
                </div>
                <div>
                  <label className={label}>Omitir primeras hojas</label>
                  <input type="number" min={0} value={cfg.skipFirst} onChange={(e) => update({ skipFirst: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${field} w-full`} />
                </div>
                <div>
                  <label className={label}>Numerales</label>
                  <select value={cfg.numerals} onChange={(e) => update({ numerals: e.target.value as FolioConfig['numerals'] })} className={`${field} w-full`}>
                    <option value="arabic">1, 2, 3</option>
                    <option value="roman">I, II, III</option>
                    <option value="roman-lower">i, ii, iii</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Ceros a la izquierda</label>
                  <select value={cfg.pad} onChange={(e) => update({ pad: Number(e.target.value) })} className={`${field} w-full`} disabled={cfg.numerals !== 'arabic'}>
                    <option value={0}>Ninguno (1)</option>
                    <option value={2}>01</option>
                    <option value={3}>001</option>
                    <option value={4}>0001</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={h}>Posición</div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="grid grid-cols-3 gap-1 w-28 shrink-0">
                  {grid.map(({ v, hz }) => {
                    const on = cfg.vertical === v && cfg.horizontal === hz;
                    return (
                      <button key={`${v}-${hz}`} type="button" title={`${vLabel[v]} · ${hLabel[hz]}`} onClick={() => update({ vertical: v, horizontal: hz })} className={`h-8 rounded border transition ${on ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                        <span className={`block w-2 h-2 rounded-full mx-auto ${on ? 'bg-white' : 'bg-slate-500'}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1 min-w-[180px]">
                  <div>
                    <label className={label}>Distancia lateral (px)</label>
                    <input type="number" min={0} value={cfg.offsetX} onChange={(e) => update({ offsetX: Number(e.target.value) || 0 })} className={`${field} w-full`} />
                  </div>
                  <div>
                    <label className={label}>Distancia vertical (px)</label>
                    <input type="number" min={0} value={cfg.offsetY} onChange={(e) => update({ offsetY: Number(e.target.value) || 0 })} className={`${field} w-full`} />
                  </div>
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={h}>Letra</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={label}>Tipo de letra</label>
                  <select value={cfg.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })} className={`${field} w-full`}>
                    {recent.length > 0 && (
                      <optgroup label="Usadas recientemente">
                        {recent.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Todas las fuentes">
                      {rest.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className={label}>Tamaño (px)</label>
                  <input type="number" min={6} max={96} value={cfg.fontSize} onChange={(e) => update({ fontSize: Math.min(96, Math.max(6, Number(e.target.value) || 14)) })} className={`${field} w-full`} />
                </div>
                <div>
                  <label className={label}>Color del texto</label>
                  <input type="color" value={cfg.color} onChange={(e) => update({ color: e.target.value })} className="w-full h-[34px] bg-slate-800 border border-slate-700 rounded-lg p-1 cursor-pointer" />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button type="button" onClick={() => update({ bold: !cfg.bold })} className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition ${cfg.bold ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>N</button>
                  <button type="button" onClick={() => update({ italic: !cfg.italic })} className={`flex-1 py-1.5 rounded-lg text-sm italic border transition ${cfg.italic ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>K</button>
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={h}>Forma detrás del número</div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['none', 'Sin forma'],
                    ['rect', 'Rectángulo'],
                    ['rounded', 'Redondeado'],
                    ['pill', 'Cápsula'],
                    ['circle', 'Círculo'],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => update({ shape: v })} className={`px-2.5 py-1 rounded-lg text-xs border transition ${cfg.shape === v ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {cfg.shape !== 'none' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Color de la forma</label>
                    <input type="color" value={cfg.shapeColor} onChange={(e) => update({ shapeColor: e.target.value })} className="w-full h-[34px] bg-slate-800 border border-slate-700 rounded-lg p-1 cursor-pointer" />
                  </div>
                  <div>
                    <label className={label}>Transparencia de la forma: {Math.round((1 - cfg.shapeOpacity) * 100)}%</label>
                    <input type="range" min={0} max={100} value={Math.round((1 - cfg.shapeOpacity) * 100)} onChange={(e) => update({ shapeOpacity: 1 - Number(e.target.value) / 100 })} className="zoom-range !w-full" />
                    <div className="flex gap-1 mt-1">
                      {[0, 25, 50, 75].map((t) => (
                        <button key={t} type="button" onClick={() => update({ shapeOpacity: 1 - t / 100 })} className="flex-1 text-[10px] py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300">
                          {t === 0 ? 'Sólida' : `${t}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={label}>Color del borde</label>
                    <input type="color" value={cfg.borderColor} onChange={(e) => update({ borderColor: e.target.value })} className="w-full h-[34px] bg-slate-800 border border-slate-700 rounded-lg p-1 cursor-pointer" />
                  </div>
                  <div>
                    <label className={label}>Grosor del borde (px)</label>
                    <input type="number" min={0} max={12} value={cfg.borderWidth} onChange={(e) => update({ borderWidth: Math.min(12, Math.max(0, Number(e.target.value) || 0)) })} className={`${field} w-full`} />
                  </div>
                  <div>
                    <label className={label}>Relleno lateral (px)</label>
                    <input type="number" min={0} max={60} value={cfg.padX} onChange={(e) => update({ padX: Math.max(0, Number(e.target.value) || 0) })} className={`${field} w-full`} />
                  </div>
                  <div>
                    <label className={label}>Relleno vertical (px)</label>
                    <input type="number" min={0} max={40} value={cfg.padY} onChange={(e) => update({ padY: Math.max(0, Number(e.target.value) || 0) })} className={`${field} w-full`} />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">Tip: forma clara con 50 % de transparencia y texto oscuro se lee bien sobre fotos y escaneos.</p>
            </div>
          </div>

          {/* ---------- VISTA PREVIA + ACCIONES ---------- */}
          <div className="md:overflow-y-auto p-4 md:p-5 space-y-4 bg-slate-950/40">
            <Preview cfg={cfg} index={previewIndex} total={previewTotal} />

            <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
              {(
                [
                  ['doc', 'Este documento'],
                  ['batch', 'Varios archivos'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setTab(v)} className={`flex-1 text-xs py-1.5 rounded-md transition ${tab === v ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            {tab === 'doc' ? (
              <div className="space-y-3">
                <label className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-pointer">
                  <input type="checkbox" checked={cfg.enabled} onChange={(e) => {
                    const next = { ...cfg, enabled: e.target.checked };
                    setCfg(next);
                    engine?.setFolioConfig(next);
                  }} className="w-5 h-5 accent-blue-500" />
                  <span className="text-sm text-slate-100">Foliar las {pageCount} hojas del documento</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  El folio se ve sobre cada hoja, se actualiza solo al agregar, quitar o reordenar hojas, y sale al exportar el PDF.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(Array.from(e.dataTransfer.files));
                  }}
                  onClick={() => inputRef.current?.click()}
                  className="border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-4 text-center cursor-pointer bg-slate-900/60"
                >
                  <FileUp className="w-7 h-7 mx-auto text-slate-500 mb-1" />
                  <div className="text-xs text-slate-300">Toca o arrastra tus PDF o imágenes</div>
                  <div className="text-[10px] text-slate-500">1 o 100 archivos a la vez</div>
                  <input ref={inputRef} type="file" multiple accept={BATCH_ACCEPT} className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
                </div>

                {files.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-[11px] bg-slate-800 border border-slate-700 rounded-md px-2 py-1">
                        <span className="truncate flex-1 text-slate-200">{f.name}</span>
                        <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className={label}>Numeración</label>
                    <select value={numbering} onChange={(e) => setNumbering(e.target.value as 'each' | 'continuous')} className={`${field} w-full`}>
                      <option value="each">Cada archivo empieza desde su número inicial</option>
                      <option value="continuous">Continua entre archivos (1…N en todo el lote)</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Entrega</label>
                    <select value={output} onChange={(e) => setOutput(e.target.value as 'zip' | 'merged')} className={`${field} w-full`}>
                      <option value="zip">Un PDF por archivo (en un ZIP si son varios)</option>
                      <option value="merged">Un solo PDF unido</option>
                    </select>
                  </div>
                </div>

                <button type="button" disabled={!files.length || !!running} onClick={() => void runBatch()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {running ? 'Foliando…' : `Foliar y descargar (${files.length})`}
                </button>

                {running && (
                  <div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((running.done / Math.max(running.total, 1)) * 100)}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 truncate">{running.current}</div>
                  </div>
                )}
                {batchError && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">{batchError}</div>}
                {results && (
                  <div className="space-y-1">
                    {results.map((r, i) => (
                      <div key={i} className={`flex items-start gap-1.5 text-[11px] ${r.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
                        <span className="break-all">{r.name}{r.ok ? ` · ${r.pages} pág.` : ` — ${r.message}`}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-500">Los PDF conservan su calidad (el folio se añade encima, sin volver a rasterizar). Word (.docx) no se admite aquí: expórtalo antes a PDF.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
