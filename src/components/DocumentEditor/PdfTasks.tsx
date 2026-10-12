import { useRef, useState } from 'react';
import { FileOutput, FileMinus2, FilePlus2 as FileAdd, Combine, Scissors, FilePlus2, ArrowUp, ArrowDown, Trash2, Loader2, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { TaskShell, NextSteps, fmtSize, type AfterAction } from './TaskKit';
import { addPages, countPdfPages, cutPdf, deletePages, downloadBlob, isMergeable, mergeFiles, splitPdf, type SplitMode } from '../../engine/pdfTools';

const btnMain = 'flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 flex items-center justify-center gap-2';

function DropZone({ onFiles, accept, multiple, label }: { onFiles: (f: File[]) => void; accept: string; multiple: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onFiles(Array.from(e.dataTransfer.files)); }}
      className="rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500 transition p-6 text-center"
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
        <FilePlus2 className="w-4 h-4" /> {label}
      </button>
      <p className="text-xs text-slate-400 mt-2">o arrastra los archivos hasta aquí</p>
    </div>
  );
}

/** Unir PDF (y fotos) en un solo PDF y descargarlo. */
export function MergeTask({ onClose, onAfter }: { onClose: () => void; onAfter: (a: AfterAction, files: File[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<File | null>(null);

  const add = (list: File[]) => {
    const ok = list.filter(isMergeable);
    if (ok.length < list.length) setMsg('Solo PDF, JPG o PNG. Para Word usa «Subir» dentro del editor.');
    else setMsg('');
    setFiles((c) => [...c, ...ok]);
    setDone(null);
  };
  const move = (i: number, d: -1 | 1) => setFiles((c) => { const a = [...c]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const blob = await mergeFiles(files);
      const f = new File([blob], 'documentos-unidos.pdf', { type: 'application/pdf' });
      downloadBlob(blob, f.name);
      setDone(f);
    } catch (e) {
      console.error(e);
      setMsg('No se pudo unir: algún PDF está dañado o protegido con contraseña.');
    }
    setBusy(false);
  };

  return (
    <TaskShell
      title="Unir PDF"
      icon={<Combine className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={files.length > 0 && (
        <button type="button" disabled={busy || files.length < 2} onClick={() => void run()} className={btnMain}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Unir y descargar {files.length > 1 ? `(${files.length})` : ''}
        </button>
      )}
    >
      {files.length === 0 ? (
        <DropZone onFiles={add} accept=".pdf,.png,.jpg,.jpeg" multiple label="Elegir archivos" />
      ) : (
        <>
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2">
                <span className="w-6 h-6 rounded-md bg-slate-800 text-[11px] font-bold text-slate-300 flex items-center justify-center">{i + 1}</span>
                {/\.pdf$/i.test(f.name) ? <FileText className="w-4 h-4 text-slate-400" /> : <ImageIcon className="w-4 h-4 text-slate-400" />}
                <span className="text-sm text-slate-100 truncate mr-auto">{f.name}</span>
                <span className="text-[11px] text-slate-500">{fmtSize(f.size)}</span>
                <button type="button" title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-white disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" title="Bajar" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-white disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" title="Quitar" onClick={() => setFiles((c) => c.filter((_, k) => k !== i))} className="p-1 text-slate-500 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <DropZone onFiles={add} accept=".pdf,.png,.jpg,.jpeg" multiple label="Añadir más archivos" />
          {files.length < 2 && <p className="text-xs text-slate-400">Agrega al menos 2 archivos. El orden de la lista es el orden del PDF final.</p>}
        </>
      )}
      {msg && <p className="text-xs text-amber-500">{msg}</p>}
      {done && <NextSteps files={[done]} onAfter={onAfter} />}
    </TaskShell>
  );
}

const SPLIT_MODES: { id: SplitMode['kind']; title: string; hint: string }[] = [
  { id: 'each', title: 'Cada página en su propio PDF', hint: 'Se descarga un ZIP' },
  { id: 'every', title: 'Cada cierto número de páginas', hint: 'Por ejemplo, de 5 en 5' },
  { id: 'ranges', title: 'Por rangos (varios PDF)', hint: 'Ej.: 1-3, 4-8 → dos archivos' },
];

/** Dividir un PDF por páginas, cantidad o rangos. */
export function SplitTask({ onClose, onAfter }: { onClose: () => void; onAfter: (a: AfterAction, files: File[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [kind, setKind] = useState<SplitMode['kind']>('each');
  const [n, setN] = useState(2);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<File[] | null>(null);

  const pick = async (list: File[]) => {
    const f = list.find((x) => /\.pdf$/i.test(x.name));
    if (!f) { setMsg('Elige un archivo PDF.'); return; }
    setMsg(''); setDone(null);
    try { setPages(await countPdfPages(f)); setFile(f); } catch { setMsg('No se pudo abrir ese PDF (¿está protegido con contraseña?).'); }
  };
  const run = async () => {
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const mode: SplitMode = kind === 'each' ? { kind } : kind === 'every' ? { kind, n } : { kind, text };
      const res = await splitPdf(file, mode);
      if (res.zip) downloadBlob(res.zip, `${file.name.replace(/\.pdf$/i, '')}_dividido.zip`);
      else downloadBlob(res.parts[0].blob, res.parts[0].name);
      setDone(res.parts.map((p) => new File([p.blob], p.name, { type: 'application/pdf' })));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo dividir el PDF.');
    }
    setBusy(false);
  };
  const needsText = kind === 'ranges' || kind === 'extract';

  return (
    <TaskShell
      title="Dividir PDF"
      icon={<Scissors className="w-4.5 h-4.5" />}
      onClose={onClose}
      footer={file && (
        <button type="button" disabled={busy || (needsText && !text.trim())} onClick={() => void run()} className={btnMain}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Dividir y descargar
        </button>
      )}
    >
      {!file ? (
        <DropZone onFiles={(f) => void pick(f)} accept=".pdf" multiple={false} label="Elegir un PDF" />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-100 truncate mr-auto">{file.name}</span>
            <span className="text-[11px] text-slate-400">{pages} pág.</span>
            <button type="button" onClick={() => { setFile(null); setDone(null); }} className="text-xs text-blue-500">Cambiar</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {SPLIT_MODES.map((m) => (
              <button key={m.id} type="button" onClick={() => setKind(m.id)} className={`text-left rounded-xl border p-3 transition ${kind === m.id ? 'border-blue-600 bg-blue-600/10' : 'border-slate-700 hover:border-blue-500'}`}>
                <div className="text-sm font-semibold text-white">{m.title}</div>
                <div className="text-[11px] text-slate-400">{m.hint}</div>
              </button>
            ))}
          </div>
          {kind === 'every' && (
            <label className="flex items-center gap-2 text-sm text-slate-200">Páginas por archivo:
              <input type="number" min={1} max={pages} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          )}
          {needsText && (
            <label className="block text-sm text-slate-200">Páginas (de 1 a {pages}):
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'ranges' ? '1-3, 4-8' : '1, 4-6'} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
            </label>
          )}
        </>
      )}
      {msg && <p className="text-xs text-amber-500">{msg}</p>}
      {done && <NextSteps files={done} onAfter={onAfter} />}
    </TaskShell>
  );
}

type PagesKind = 'cut' | 'extract' | 'delete' | 'add';
const PAGES_META: Record<PagesKind, { title: string; icon: JSX.Element; action: string }> = {
  cut: { title: 'Cortar PDF', icon: <Scissors className="w-4.5 h-4.5" />, action: 'Cortar y descargar' },
  extract: { title: 'Extraer páginas', icon: <FileOutput className="w-4.5 h-4.5" />, action: 'Extraer y descargar' },
  delete: { title: 'Eliminar páginas', icon: <FileMinus2 className="w-4.5 h-4.5" />, action: 'Eliminar y descargar' },
  add: { title: 'Añadir página', icon: <FileAdd className="w-4.5 h-4.5" />, action: 'Añadir y descargar' },
};

/** Cortar en dos, extraer, eliminar o añadir páginas de un PDF. */
export function PagesTask({ kind, onClose, onAfter }: { kind: PagesKind; onClose: () => void; onAfter: (a: AfterAction, files: File[]) => void }) {
  const meta = PAGES_META[kind];
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [text, setText] = useState('');
  const [after, setAfter] = useState(1);
  const [pos, setPos] = useState<'start' | 'end' | 'after'>('end');
  const [posN, setPosN] = useState(1);
  const [src, setSrc] = useState<'blank' | 'file'>('blank');
  const [blank, setBlank] = useState(1);
  const [extra, setExtra] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<File[] | null>(null);
  const extraRef = useRef<HTMLInputElement>(null);

  const pick = async (list: File[]) => {
    const f = list.find((x) => /\.pdf$/i.test(x.name));
    if (!f) { setMsg('Elige un archivo PDF.'); return; }
    setMsg(''); setDone(null);
    try { const n = await countPdfPages(f); setPages(n); setAfter(Math.max(1, Math.ceil(n / 2))); setFile(f); }
    catch { setMsg('No se pudo abrir ese PDF (¿está protegido con contraseña?).'); }
  };

  const run = async () => {
    if (!file) return;
    setBusy(true); setMsg('');
    const base = file.name.replace(/\.pdf$/i, '');
    try {
      let outs: { name: string; blob: Blob }[] = [];
      if (kind === 'cut') outs = await cutPdf(file, after);
      else if (kind === 'extract') outs = [{ name: `${base}_extraido.pdf`, blob: (await splitPdf(file, { kind: 'extract', text })).parts[0].blob }];
      else if (kind === 'delete') outs = [{ name: `${base}_editado.pdf`, blob: await deletePages(file, text) }];
      else {
        const at = pos === 'start' ? 0 : pos === 'end' ? pages : Math.min(pages, Math.max(0, posN));
        if (src === 'file' && !extra.length) throw new Error('Elige el PDF o las imágenes que quieres añadir.');
        outs = [{ name: `${base}_con_paginas.pdf`, blob: await addPages(file, { at, blank: src === 'blank' ? blank : 0, from: src === 'file' ? extra : undefined }) }];
      }
      if (outs.length > 1) {
        const JSZip = (await import('jszip')).default;
        const z = new JSZip();
        outs.forEach((o) => z.file(o.name, o.blob));
        downloadBlob(await z.generateAsync({ type: 'blob' }), `${base}_cortado.zip`);
      } else downloadBlob(outs[0].blob, outs[0].name);
      setDone(outs.map((o) => new File([o.blob], o.name, { type: 'application/pdf' })));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo completar la tarea.');
    }
    setBusy(false);
  };

  const field = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm w-24';
  const needsText = kind === 'extract' || kind === 'delete';

  return (
    <TaskShell
      title={meta.title}
      icon={meta.icon}
      onClose={onClose}
      footer={file && (
        <button type="button" disabled={busy || (needsText && !text.trim())} onClick={() => void run()} className={btnMain}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {meta.action}
        </button>
      )}
    >
      {!file ? (
        <DropZone onFiles={(f) => void pick(f)} accept=".pdf" multiple={false} label="Elegir un PDF" />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-100 truncate mr-auto">{file.name}</span>
            <span className="text-[11px] text-slate-400">{pages} pág.</span>
            <button type="button" onClick={() => { setFile(null); setDone(null); }} className="text-xs text-blue-500">Cambiar</button>
          </div>
          {kind === 'cut' && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-200">Cortar después de la página
              <input type="number" min={1} max={Math.max(1, pages - 1)} value={after} onChange={(e) => setAfter(Number(e.target.value) || 1)} className={field} />
              <span className="text-xs text-slate-400">→ quedan 2 archivos: 1–{after} y {after + 1}–{pages}</span>
            </label>
          )}
          {needsText && (
            <label className="block text-sm text-slate-200">{kind === 'extract' ? 'Páginas a extraer' : 'Páginas a eliminar'} (de 1 a {pages}):
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="2, 5-7" className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
            </label>
          )}
          {kind === 'add' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {([['blank', 'Página en blanco'], ['file', 'De otro PDF o imagen']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setSrc(v)} className={`rounded-xl border p-3 text-sm font-semibold text-left transition ${src === v ? 'border-blue-600 bg-blue-600/10 text-blue-500' : 'border-slate-700 text-slate-200 hover:border-blue-500'}`}>{l}</button>
                ))}
              </div>
              {src === 'blank' ? (
                <label className="flex items-center gap-2 text-sm text-slate-200">Cuántas páginas en blanco:
                  <input type="number" min={1} max={50} value={blank} onChange={(e) => setBlank(Math.max(1, Number(e.target.value) || 1))} className={field} />
                </label>
              ) : (
                <div className="flex items-center gap-2">
                  <input ref={extraRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { setExtra(Array.from(e.target.files ?? []).filter(isMergeable)); e.target.value = ''; }} />
                  <button type="button" onClick={() => extraRef.current?.click()} className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-100">Elegir archivos…</button>
                  <span className="text-xs text-slate-400 truncate">{extra.length ? extra.map((f) => f.name).join(', ') : 'Ninguno elegido'}</span>
                </div>
              )}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1">Dónde ponerlas</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([['start', 'Al inicio'], ['end', 'Al final'], ['after', 'Después de la página…']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setPos(v)} className={`px-3 py-1.5 rounded-lg text-xs border ${pos === v ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 text-slate-300'}`}>{l}</button>
                  ))}
                  {pos === 'after' && <input type="number" min={1} max={pages} value={posN} onChange={(e) => setPosN(Number(e.target.value) || 1)} className={field} />}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="text-xs text-amber-500">{msg}</p>}
      {done && <NextSteps files={done} onAfter={onAfter} />}
    </TaskShell>
  );
}
