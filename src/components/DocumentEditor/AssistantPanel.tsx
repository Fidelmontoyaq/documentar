import { useEffect, useState, useSyncExternalStore } from 'react';
import { X, Sparkles, Play, Circle, Square, Trash2, RotateCcw, Brain, Lightbulb } from 'lucide-react';
import type { DocumentEditorEngine } from '../../engine/DocumentEditorEngine';
import {
  ACTION_LABEL, BUILTIN_PRESETS, describeCmd, forgetAll, loadMem, loadUserPresets, recorder, runPreset, saveUserPresets,
  topRoutines, type ActionId, type Preset, type PresetRun, type Tip,
} from '../../engine/assistant';

interface Props {
  open: boolean;
  onClose: () => void;
  engine: DocumentEditorEngine | null;
  tip: Tip | null;
  onTipAction: (t: Tip) => void;
  lastRun: PresetRun | null;
  onRan: (r: PresetRun) => void;
  onUndoRun: () => void;
}

export const useRecorder = () =>
  useSyncExternalStore(
    (f) => recorder.subscribe(f),
    () => `${recorder.recording}:${recorder.cmds.length}`
  );

/** Asistente local: recuerda lo que haces, te sugiere el siguiente paso y aplica presets (macros) que se pueden deshacer. */
export function AssistantPanel({ open, onClose, engine, tip, onTipAction, lastRun, onRan, onUndoRun }: Props) {
  const [mem, setMem] = useState(loadMem());
  const [user, setUser] = useState<Preset[]>(loadUserPresets());
  const [naming, setNaming] = useState<null | { cmds: Preset['cmds'] }>(null);
  const [name, setName] = useState('');
  useRecorder();
  useEffect(() => { if (open) { setMem(loadMem()); setUser(loadUserPresets()); } }, [open]);
  if (!open) return null;

  const routines = topRoutines(mem);
  const run = (p: Preset) => { if (engine) onRan(runPreset(engine, p)); };
  const saveNew = () => {
    if (!naming || !name.trim()) return;
    const p: Preset = { id: `u-${Date.now()}`, name: name.trim(), desc: naming.cmds.map(describeCmd).join(' · '), cmds: naming.cmds };
    const next = [...user, p];
    setUser(next);
    saveUserPresets(next);
    setNaming(null);
    setName('');
  };
  const del = (id: string) => { const n = user.filter((u) => u.id !== id); setUser(n); saveUserPresets(n); };

  const row = (p: Preset) => (
    <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-700 p-2.5">
      <div className="min-w-0 mr-auto">
        <div className="text-sm font-semibold text-white truncate">{p.name}</div>
        <div className="text-[11px] text-slate-400 leading-snug">{p.desc}</div>
      </div>
      <button type="button" disabled={!engine} onClick={() => run(p)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium"><Play className="w-3 h-3" /> Aplicar</button>
      {!p.builtin && <button type="button" title="Borrar preset" onClick={() => del(p.id)} className="shrink-0 text-slate-500 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );

  return (
    <div data-keep-selection className="fixed inset-0 z-[83] bg-slate-950/60 backdrop-blur-[2px] flex items-end sm:items-stretch sm:justify-end print:hidden" onClick={onClose}>
      <div className="w-full sm:w-[400px] max-h-[92dvh] sm:max-h-none flex flex-col bg-slate-900 sm:border-l border-slate-700 rounded-t-2xl sm:rounded-none shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <div className="mr-auto">
            <h2 className="text-base font-bold text-white leading-tight">Asistente</h2>
            <p className="text-[11px] text-slate-400">Local y ligero: sin internet y casi sin memoria.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {lastRun && (
            <div className="rounded-xl bg-emerald-600/10 border border-emerald-600/40 p-3 flex items-center gap-2">
              <div className="text-xs text-slate-200 mr-auto">Se aplicó <b>«{lastRun.name}»</b>. ¿No te gustó?</div>
              <button type="button" onClick={onUndoRun} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-emerald-600 text-emerald-600 font-medium"><RotateCcw className="w-3 h-3" /> Deshacer todo</button>
            </div>
          )}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Ahora te sugiero</h3>
            {tip ? (
              <div className="rounded-xl border border-blue-600/40 bg-blue-600/5 p-3">
                <p className="text-sm text-slate-200">{tip.text}</p>
                {tip.action && <button type="button" onClick={() => { onTipAction(tip); onClose(); }} className="mt-2 text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium">{tip.action.label}</button>}
              </div>
            ) : (
              <p className="text-xs text-slate-400 rounded-xl border border-slate-800 p-3">Sin sugerencias por ahora. A medida que uses la app, aprendo tus rutinas y te aviso si te sales de ellas.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Presets listos (se aplican solos)</h3>
            {BUILTIN_PRESETS.map(row)}
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Mis presets</h3>
            {user.map(row)}
            {recorder.recording ? (
              <div className="rounded-xl border border-rose-500/50 bg-rose-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-rose-500 font-semibold"><Circle className="w-3 h-3 fill-current animate-pulse" /> Grabando… cambia el tamaño, márgenes, tipografía o foliado</div>
                <ul className="text-xs text-slate-300 list-disc pl-5">{recorder.cmds.length ? recorder.cmds.map((c, i) => <li key={i}>{describeCmd(c)}</li>) : <li className="list-none -ml-5 text-slate-500">Aún no hay pasos.</li>}</ul>
                <div className="flex gap-2">
                  <button type="button" disabled={!recorder.cmds.length} onClick={() => setNaming({ cmds: recorder.stop() })} className="flex-1 flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-rose-600 text-white font-medium disabled:opacity-40"><Square className="w-3 h-3 fill-current" /> Detener y guardar</button>
                  <button type="button" onClick={() => recorder.cancel()} className="px-3 text-xs py-2 rounded-lg border border-slate-700 text-slate-300">Cancelar</button>
                </div>
              </div>
            ) : naming ? (
              <div className="rounded-xl border border-slate-700 p-3 space-y-2">
                <div className="text-xs text-slate-300">Se guardaron {naming.cmds.length} paso(s): {naming.cmds.map(describeCmd).join(' · ')}</div>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNew()} placeholder="Nombre del preset (ej. Informe del curso)" className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 px-3 py-2 outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <button type="button" disabled={!name.trim()} onClick={saveNew} className="flex-1 text-xs py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40">Guardar preset</button>
                  <button type="button" onClick={() => setNaming(null)} className="px-3 text-xs py-2 rounded-lg border border-slate-700 text-slate-300">Descartar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => recorder.start()} className="w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded-xl border border-dashed border-slate-600 text-slate-200 hover:border-blue-500"><Circle className="w-3.5 h-3.5 text-rose-500 fill-current" /> Grabar mis pasos como preset</button>
            )}
            {!user.length && !recorder.recording && !naming && <p className="text-[11px] text-slate-500">Pulsa grabar, haz tus cambios de hoja (tamaño, márgenes, tipografía, foliado) y guárdalos: la próxima vez los aplicas con un clic, y puedes deshacerlos.</p>}
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Brain className="w-3 h-3" /> Lo que he aprendido de ti</h3>
            {routines.length ? (
              <ul className="text-xs text-slate-300 space-y-1">
                {routines.map((r) => <li key={`${r.from}${r.to}`}>«{ACTION_LABEL[r.from as ActionId]}» → «{ACTION_LABEL[r.to as ActionId]}» <span className="text-slate-500">· {r.count} {r.count === 1 ? 'vez' : 'veces'}</span></li>)}
              </ul>
            ) : <p className="text-xs text-slate-400">Todavía nada. Lo guardo solo en este navegador.</p>}
            {routines.length > 0 && <button type="button" onClick={() => { forgetAll(); setMem(loadMem()); }} className="mt-2 text-[11px] text-rose-500 underline">Olvidar todo lo aprendido</button>}
          </section>
        </div>
      </div>
    </div>
  );
}
