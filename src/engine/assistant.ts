// Asistente local: no usa ningún modelo ni internet. Aprende de tus pasos (unos pocos KB en este navegador),
// te sugiere el siguiente paso habitual, te avisa si te sales de tu rutina, y guarda/aplica presets (macros).
import type { DocumentEditorEngine } from './DocumentEditorEngine';
import type { EngineCmd } from '../types/documentEditor';
import type { FolioConfig } from './folio';

export type ActionId =
  | 'import' | 'image' | 'text' | 'shape' | 'sign' | 'folio' | 'organize' | 'pdfedit'
  | 'size' | 'format' | 'removebg' | 'export' | 'page' | 'arrange' | 'merge';

export const ACTION_LABEL: Record<ActionId, string> = {
  import: 'Subir archivos', image: 'Agregar imagen', text: 'Agregar texto', shape: 'Formas y marcos', sign: 'Firma',
  folio: 'Foliado', organize: 'Organizar hojas', pdfedit: 'Editar PDF', size: 'Tamaño de hoja', format: 'Tipografía / márgenes',
  removebg: 'Quitar fondo', export: 'Exportar', page: 'Hoja nueva', arrange: 'Ordenar imágenes', merge: 'Unir archivos',
};

interface Mem {
  last?: { a: ActionId; t: number };
  next: Record<string, Record<string, number>>;
  exports: { folio: boolean; t: number }[];
  total: number;
}

const MEM_KEY = 'docucraft.assistant.mem';
const PRE_KEY = 'docucraft.assistant.presets';
const MAX_GAP = 15 * 60 * 1000;

export function loadMem(): Mem {
  try {
    const raw = localStorage.getItem(MEM_KEY);
    if (raw) return { next: {}, exports: [], total: 0, ...(JSON.parse(raw) as Partial<Mem>) };
  } catch { /* ignore */ }
  return { next: {}, exports: [], total: 0 };
}
const saveMem = (m: Mem) => { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch { /* ignore */ } };
export function forgetAll() { try { localStorage.removeItem(MEM_KEY); } catch { /* ignore */ } }

/** Registra un paso del usuario. */
export function track(a: ActionId, extra?: { folioOn?: boolean }): Mem {
  const m = loadMem();
  const now = Date.now();
  if (m.last && m.last.a !== a && now - m.last.t < MAX_GAP) {
    const row = (m.next[m.last.a] ??= {});
    row[a] = (row[a] ?? 0) + 1;
  }
  m.last = { a, t: now };
  m.total++;
  if (a === 'export') m.exports = [...m.exports, { folio: !!extra?.folioOn, t: now }].slice(-12);
  saveMem(m);
  return m;
}

export interface Tip {
  id: string;
  text: string;
  /** Qué hace el botón principal. */
  action?: { label: string; kind: 'open'; target: ActionId } | { label: string; kind: 'removeBlank' };
}

/** Lo que sueles hacer después del último paso (si se repite al menos 2 veces y es lo más habitual). */
export function suggestNext(m: Mem, last: ActionId): Tip | null {
  const row = m.next[last];
  if (!row) return null;
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  const [to, count] = Object.entries(row).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!to || count < 2 || count / total < 0.5) return null;
  return {
    id: `next:${last}>${to}`,
    text: `Después de «${ACTION_LABEL[last]}» sueles hacer «${ACTION_LABEL[to as ActionId]}» (${count} veces). ¿Vamos?`,
    action: { label: ACTION_LABEL[to as ActionId], kind: 'open', target: to as ActionId },
  };
}

/** Antes de exportar: corrige si te desvías de lo que normalmente haces o hay algo raro. */
export function exportAdvice(m: Mem, ctx: { folioEnabled: boolean; pageCount: number; trailingBlank: number }): Tip | null {
  if (ctx.trailingBlank > 0) {
    return {
      id: 'blank',
      text: `Al final hay ${ctx.trailingBlank} hoja${ctx.trailingBlank > 1 ? 's' : ''} en blanco. ¿La quito antes de exportar?`,
      action: { label: 'Quitar hoja en blanco', kind: 'removeBlank' },
    };
  }
  const withFolio = m.exports.filter((e) => e.folio).length;
  if (!ctx.folioEnabled && ctx.pageCount > 1 && withFolio >= 2 && withFolio / Math.max(1, m.exports.length) >= 0.5) {
    return {
      id: 'folio-habit',
      text: `Las últimas veces foliaste antes de exportar (${withFolio} de ${m.exports.length}). Este documento no tiene folio. ¿Lo agregas?`,
      action: { label: 'Foliar ahora', kind: 'open', target: 'folio' },
    };
  }
  return null;
}

export function topRoutines(m: Mem, n = 4): { from: ActionId; to: ActionId; count: number }[] {
  const out: { from: ActionId; to: ActionId; count: number }[] = [];
  for (const [from, row] of Object.entries(m.next)) for (const [to, count] of Object.entries(row)) out.push({ from: from as ActionId, to: to as ActionId, count });
  return out.sort((a, b) => b.count - a.count).slice(0, n);
}

// ===================== presets (macros) =====================

export interface Preset {
  id: string;
  name: string;
  desc: string;
  cmds: EngineCmd[];
  builtin?: boolean;
}

const A4 = { w: 794, h: 1123 };
const folioBase = { enabled: true, template: '{n}', order: 'asc', start: 1, vertical: 'bottom', horizontal: 'center', bold: false, color: '#000000' };

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'univ', builtin: true, name: 'Trabajo universitario',
    desc: 'A4, Times New Roman, márgenes normales y folio abajo al centro (la portada sin número).',
    cmds: [
      { t: 'size', ...A4, kind: 'doc', scope: 'all' },
      { t: 'font', value: "'Times New Roman', serif" },
      { t: 'margin', value: 'p-[25mm_20mm]' },
      { t: 'folio', cfg: { ...folioBase, fontFamily: "'Times New Roman', serif", fontSize: 12, skipFirst: 1 } },
    ],
  },
  {
    id: 'oficina', builtin: true, name: 'Oficio de oficina (Carta)',
    desc: 'Carta, márgenes normales y folio «Pág. 1 de 10» abajo a la derecha.',
    cmds: [
      { t: 'size', w: 816, h: 1056, kind: 'doc', scope: 'all' },
      { t: 'margin', value: 'p-[25mm_20mm]' },
      { t: 'folio', cfg: { ...folioBase, template: 'Pág. {n} de {total}', horizontal: 'right', fontSize: 11, fontFamily: "'Inter', sans-serif" } },
    ],
  },
  { id: 'folio', builtin: true, name: 'Solo foliar', desc: 'Número de página abajo al centro en todas las hojas.', cmds: [{ t: 'folio', cfg: { ...folioBase, fontSize: 12 } }] },
  { id: 'slide', builtin: true, name: 'Diapositiva 16:9', desc: 'Lienzo de 1920×1080 para presentaciones.', cmds: [{ t: 'size', w: 1920, h: 1080, kind: 'design', scope: 'all' }] },
  { id: 'social', builtin: true, name: 'Cuadrado para redes', desc: 'Lienzo de 1080×1080 (publicación).', cmds: [{ t: 'size', w: 1080, h: 1080, kind: 'design', scope: 'all' }] },
];

export function loadUserPresets(): Preset[] {
  try { return JSON.parse(localStorage.getItem(PRE_KEY) || '[]') as Preset[]; } catch { return []; }
}
export function saveUserPresets(p: Preset[]) { try { localStorage.setItem(PRE_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export interface PresetRun { name: string; mark: number; prevFolio: FolioConfig }

/** Aplica un preset paso a paso y devuelve lo necesario para deshacerlo por completo. */
export function runPreset(engine: DocumentEditorEngine, preset: Preset): PresetRun {
  const run: PresetRun = { name: preset.name, mark: engine.getHistoryMark(), prevFolio: { ...engine.getFolioConfig() } };
  for (const c of preset.cmds) engine.applyCommand(c);
  return run;
}

export function undoPreset(engine: DocumentEditorEngine, run: PresetRun) {
  engine.undoToMark(run.mark);
  engine.applyCommand({ t: 'folio', cfg: { ...run.prevFolio } });
}

export function describeCmd(c: EngineCmd): string {
  switch (c.t) {
    case 'size': return `Tamaño ${c.w}×${c.h} px`;
    case 'margin': return 'Márgenes';
    case 'marginCm': return `Márgenes ${c.cm} cm`;
    case 'font': return `Tipografía ${c.value.split(',')[0].replace(/'/g, '')}`;
    case 'folio': return (c.cfg as { enabled?: boolean }).enabled === false ? 'Quitar folio' : 'Foliado';
  }
}

// ===================== grabadora =====================

type Sub = () => void;
class Recorder {
  recording = false;
  cmds: EngineCmd[] = [];
  private subs = new Set<Sub>();
  subscribe(f: Sub) { this.subs.add(f); return () => { this.subs.delete(f); }; }
  private emit() { this.subs.forEach((f) => f()); }
  start() { this.recording = true; this.cmds = []; this.emit(); }
  push(c: EngineCmd) {
    if (!this.recording) return;
    // Si repites el mismo tipo de cambio, queda solo el último valor.
    this.cmds = [...this.cmds.filter((x) => x.t !== c.t), c];
    this.emit();
  }
  stop(): EngineCmd[] { const c = this.cmds; this.recording = false; this.cmds = []; this.emit(); return c; }
  cancel() { this.recording = false; this.cmds = []; this.emit(); }
}
export const recorder = new Recorder();
