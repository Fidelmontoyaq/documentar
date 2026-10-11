import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { X, ImagePlus, Loader2, Download, Brush, Trash2, UserRound, Sparkles, PaintBucket } from 'lucide-react';
import { removeBgFromFile, type BatchBgMode } from '../../engine/bgRemove';
import { downloadBlob } from '../../engine/folioBatch';
import { RemoveBgDialog } from './RemoveBgDialog';
import { RemoveBgIcon } from './icons';

interface Item {
  id: string;
  file: File;
  srcUrl: string;
  outBlob?: Blob;
  outUrl?: string;
  status: 'wait' | 'run' | 'ok' | 'err';
  err?: string;
}

const MODES: { id: BatchBgMode; label: string; hint: string; icon: JSX.Element }[] = [
  { id: 'ai-general', label: 'Objeto o cosa', hint: 'IA: productos, mascotas, logos…', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'ai-portrait', label: 'Persona', hint: 'IA para siluetas y cabello', icon: <UserRound className="w-4 h-4" /> },
  { id: 'auto', label: 'Fondo liso', hint: 'Sin IA, rápido: fondo de un solo color', icon: <PaintBucket className="w-4 h-4" /> },
];

/** Quitar el fondo de varias imágenes a la vez y descargarlas, sin abrir el lienzo. */
export function BatchBgModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<BatchBgMode>('ai-general');
  const [crop, setCrop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [retouch, setRetouch] = useState<Item | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((i) => { URL.revokeObjectURL(i.srcUrl); if (i.outUrl) URL.revokeObjectURL(i.outUrl); }), []);
  if (!open) return null;

  const add = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    setItems((cur) => [...cur, ...imgs.map((f, k) => ({ id: `${Date.now()}-${k}-${Math.random().toString(36).slice(2, 6)}`, file: f, srcUrl: URL.createObjectURL(f), status: 'wait' as const }))]);
  };
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => setItems((cur) => { const it = cur.find((i) => i.id === id); if (it) { URL.revokeObjectURL(it.srcUrl); if (it.outUrl) URL.revokeObjectURL(it.outUrl); } return cur.filter((i) => i.id !== id); });

  const run = async () => {
    setBusy(true);
    const todo = itemsRef.current.filter((i) => i.status !== 'ok');
    let n = 0;
    for (const it of todo) {
      n++;
      patch(it.id, { status: 'run', err: undefined });
      try {
        const blob = await removeBgFromFile(it.file, mode, { cropToContent: crop }, (t, pct) => setProgress(`${n}/${todo.length} · ${t}${typeof pct === 'number' ? ` ${Math.round(pct)}%` : ''}`));
        if (it.outUrl) URL.revokeObjectURL(it.outUrl);
        patch(it.id, { status: 'ok', outBlob: blob, outUrl: URL.createObjectURL(blob) });
      } catch (e) {
        console.error(e);
        patch(it.id, { status: 'err', err: mode === 'auto' ? 'No se pudo procesar.' : 'No se pudo usar la IA (¿sin conexión?). Prueba «Fondo liso».' });
      }
    }
    setProgress('');
    setBusy(false);
  };

  const baseName = (n: string) => n.replace(/\.[^.]+$/, '');
  const done = items.filter((i) => i.status === 'ok' && i.outBlob);
  const downloadAll = async () => {
    if (done.length === 1) return downloadBlob(done[0].outBlob!, `${baseName(done[0].file.name)}-sin-fondo.png`);
    const zip = new JSZip();
    const used = new Set<string>();
    done.forEach((i) => {
      let nm = `${baseName(i.file.name)}-sin-fondo.png`;
      for (let k = 2; used.has(nm); k++) nm = `${baseName(i.file.name)}-sin-fondo-${k}.png`;
      used.add(nm);
      zip.file(nm, i.outBlob!);
    });
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'imagenes-sin-fondo.zip');
  };

  const dataUrlToBlob = async (d: string) => (await fetch(d)).blob();

  return (
    <div data-keep-selection className="fixed inset-0 z-[86] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 print:hidden">
      <div className="w-full sm:max-w-3xl max-h-[94dvh] flex flex-col bg-slate-900 sm:rounded-2xl rounded-t-2xl border border-slate-700 shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <RemoveBgIcon className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-white mr-auto">Quitar fondo a mis imágenes</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-1.5">1 · Elige el tipo de fondo</div>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`rounded-xl border p-2.5 text-left transition ${mode === m.id ? 'border-blue-600 bg-blue-600/10 text-blue-600' : 'border-slate-700 text-slate-200 hover:border-blue-500'}`}>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">{m.icon}{m.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{m.hint}</div>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 mt-2 cursor-pointer"><input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} /> Recortar los márgenes transparentes sobrantes</label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-semibold text-slate-400">2 · Sube tus imágenes ({items.length})</div>
              <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-blue-600 text-blue-600"><ImagePlus className="w-3.5 h-3.5" /> Añadir imágenes</button>
              <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2 min-h-[110px] rounded-xl border-2 border-dashed border-slate-700 p-2"
            >
              {items.length === 0 && <div className="col-span-full flex items-center justify-center text-xs text-slate-500 text-center py-6">Arrastra aquí tus imágenes o usa «Añadir imágenes»</div>}
              {items.map((i) => (
                <div key={i.id} className="relative rounded-lg overflow-hidden border border-slate-700" style={{ background: 'repeating-conic-gradient(#d9dee7 0% 25%, #fff 0% 50%) 50% / 14px 14px' }}>
                  <img src={i.outUrl ?? i.srcUrl} alt="" className="w-full aspect-square object-contain" />
                  <div className="absolute top-1 right-1 flex gap-1">
                    {i.status === 'ok' && <button type="button" title="Retocar con pincel" onClick={() => setRetouch(i)} className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><Brush className="w-3 h-3" /></button>}
                    <button type="button" title="Quitar de la lista" onClick={() => remove(i.id)} className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {i.status === 'run' && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                  {i.status === 'ok' && <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[10px] text-center py-0.5">Listo</div>}
                  {i.status === 'err' && <div className="absolute bottom-0 inset-x-0 bg-rose-600 text-white text-[10px] text-center py-0.5 px-1 leading-tight">{i.err}</div>}
                </div>
              ))}
            </div>
          </div>

          {progress && <div className="text-xs text-slate-300">{progress}</div>}
          {mode !== 'auto' && <p className="text-[10px] text-slate-500">La IA descarga su modelo la primera vez (unas decenas de MB) y después queda guardado. Las imágenes se procesan en tu equipo: no se suben a ningún servidor.</p>}
        </div>

        <div className="p-3 border-t border-slate-800 flex gap-2">
          <button type="button" disabled={!items.length || busy || items.every((i) => i.status === 'ok')} onClick={() => void run()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RemoveBgIcon className="w-4 h-4" />} Quitar fondos
          </button>
          <button type="button" disabled={!done.length} onClick={() => void downloadAll()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Descargar {done.length > 1 ? `(${done.length}, ZIP)` : done.length === 1 ? 'PNG' : ''}
          </button>
        </div>
      </div>

      <RemoveBgDialog
        open={!!retouch}
        src={retouch?.srcUrl ?? null}
        onClose={() => setRetouch(null)}
        onApply={async (dataUrl) => {
          if (retouch) {
            const blob = await dataUrlToBlob(dataUrl);
            if (retouch.outUrl) URL.revokeObjectURL(retouch.outUrl);
            patch(retouch.id, { status: 'ok', outBlob: blob, outUrl: URL.createObjectURL(blob) });
          }
          setRetouch(null);
        }}
      />
    </div>
  );
}
