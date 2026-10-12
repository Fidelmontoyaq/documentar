import { useRef, useState } from 'react';
import { Combine, Scissors, FilePlus2, ArrowUp, ArrowDown, Trash2, Loader2, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { TaskShell, NextSteps, fmtSize, type AfterAction } from './TaskKit';
import { countPdfPages, downloadBlob, isMergeable, mergeFiles, splitPdf, type SplitMode } from '../../engine/pdfTools';

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
  { id: 'extract', title: 'Extraer páginas (un PDF)', hint: 'Ej.: 1, 4-6 → un solo archivo' },
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
