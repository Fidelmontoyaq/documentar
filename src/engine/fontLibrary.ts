// Biblioteca de tipografías: catálogo ampliado (Google Fonts + fuentes del sistema),
// fuentes propias subidas como archivo o pegadas como enlace, y carga bajo demanda.
import type { FontDefinition } from '../types/documentEditor';

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'mono';

export interface LibFont extends FontDefinition {
  family: string;
  category: FontCategory;
  source: 'system' | 'google' | 'custom';
  /** Id en IndexedDB (solo fuentes propias). */
  customId?: string;
}

const G = (category: FontCategory, names: string): [string, FontCategory][] =>
  names.split('|').map((n) => [n.trim(), category]);

const GOOGLE: [string, FontCategory][] = [
  ...G('sans', 'Inter|Roboto|Open Sans|Montserrat|Poppins|Lato|Nunito|Nunito Sans|Raleway|Work Sans|DM Sans|Manrope|Outfit|Rubik|Karla|Mulish|Quicksand|Source Sans 3|Noto Sans|Fira Sans|Barlow|Josefin Sans|Cabin|Oswald|Archivo|Figtree|Plus Jakarta Sans|Lexend|Albert Sans|Urbanist|Sora|Jost|Heebo|Hind|Titillium Web|Ubuntu|Arimo|Public Sans|Be Vietnam Pro|Asap|Exo 2|Maven Pro|Varela Round|Questrial|Kanit|Prompt|Bebas Neue|Anton|Carlito|Libre Franklin|PT Sans|PT Sans Narrow|Roboto Condensed|Merriweather Sans|Comic Neue|Overpass|IBM Plex Sans|Noto Sans Display|Catamaran|Signika|Lexend Deca|Red Hat Display|Space Grotesk|Questrial|Didact Gothic|Gothic A1'),
  ...G('serif', 'Playfair Display|Merriweather|Lora|PT Serif|Crimson Text|EB Garamond|Libre Baskerville|Cormorant Garamond|Cormorant|Source Serif 4|Noto Serif|Bitter|Cinzel|Old Standard TT|Tinos|Vollkorn|Spectral|Libre Caslon Text|Domine|Roboto Slab|Zilla Slab|Arvo|Cardo|Gelasio|DM Serif Display|DM Serif Text|Abril Fatface|Alegreya|Frank Ruhl Libre|Bodoni Moda|Marcellus|Rozha One|Yeseva One|Playfair Display SC|Caladea|Libre Bodoni|IBM Plex Serif|Rokkitt|Crete Round|Slabo 27px|Neuton|Prata|Lusitana'),
  ...G('display', 'Lobster|Bangers|Righteous|Fredoka|Baloo 2|Chewy|Luckiest Guy|Permanent Marker|Press Start 2P|Monoton|Pacifico|Alfa Slab One|Black Ops One|Bungee|Russo One|Staatliches|Archivo Black|Passion One|Shrikhand|Fugaz One|Orbitron|Audiowide|Cinzel Decorative|Special Elite|Unbounded|Rubik Mono One|Titan One|Fascinate|Gloock'),
  ...G('script', 'Dancing Script|Great Vibes|Satisfy|Sacramento|Caveat|Kaushan Script|Allura|Parisienne|Courgette|Alex Brush|Tangerine|Yellowtail|Cookie|Marck Script|Amatic SC|Shadows Into Light|Indie Flower|Homemade Apple|Reenie Beanie|Rock Salt|Mr Dafoe|Pinyon Script|Italianno|Petit Formal Script|Playball|Merienda|Handlee|Patrick Hand|Gloria Hallelujah|La Belle Aurore|Nothing You Could Do|Zeyada|Over the Rainbow'),
  ...G('mono', 'Courier Prime|JetBrains Mono|Fira Code|Source Code Pro|IBM Plex Mono|Space Mono|Roboto Mono|Inconsolata|Ubuntu Mono|DM Mono|Cousine|Noto Sans Mono|Anonymous Pro|PT Mono'),
];

const SYSTEM: [string, string, FontCategory][] = [
  ['Times New Roman', "'Times New Roman', 'Tinos', Times, serif", 'serif'],
  ['Cambria', "Cambria, 'Caladea', Georgia, serif", 'serif'],
  ['Georgia', "Georgia, 'PT Serif', serif", 'serif'],
  ['Book Antiqua / Palatino', "'Book Antiqua', 'Palatino Linotype', Palatino, serif", 'serif'],
  ['Garamond', "Garamond, 'EB Garamond', serif", 'serif'],
  ['Constantia', "Constantia, 'PT Serif', serif", 'serif'],
  ['Century Schoolbook', "'Century Schoolbook', 'Tinos', serif", 'serif'],
  ['Bookman Old Style', "'Bookman Old Style', 'Libre Baskerville', serif", 'serif'],
  ['Calibri', "Calibri, 'Carlito', Candara, sans-serif", 'sans'],
  ['Arial', "Arial, 'Arimo', Helvetica, sans-serif", 'sans'],
  ['Courier New', "'Courier New', 'Cousine', Courier, monospace", 'mono'],
  ['Helvetica', "Helvetica, 'Arimo', Arial, sans-serif", 'sans'],
  ['Verdana', "Verdana, 'Open Sans', Geneva, sans-serif", 'sans'],
  ['Tahoma', "Tahoma, 'Noto Sans', Geneva, sans-serif", 'sans'],
  ['Trebuchet MS', "'Trebuchet MS', 'Fira Sans', sans-serif", 'sans'],
  ['Segoe UI', "'Segoe UI', 'Open Sans', sans-serif", 'sans'],
  ['Century Gothic', "'Century Gothic', 'Questrial', sans-serif", 'sans'],
  ['Franklin Gothic', "'Franklin Gothic Medium', 'Libre Franklin', sans-serif", 'sans'],
  ['Gill Sans', "'Gill Sans', 'Lato', sans-serif", 'sans'],
  ['Futura', "Futura, 'Jost', sans-serif", 'sans'],
  ['Candara / Corbel', "Candara, Corbel, 'Nunito Sans', sans-serif", 'sans'],
  ['Aptos', "Aptos, 'Inter', sans-serif", 'sans'],
  ['Palatino', "'Palatino Linotype', Palatino, 'EB Garamond', serif", 'serif'],
  ['Rockwell', "Rockwell, 'Zilla Slab', serif", 'serif'],
  ['Consolas', "Consolas, 'Inconsolata', monospace", 'mono'],
  ['Lucida Console', "'Lucida Console', 'Cousine', monospace", 'mono'],
  ['Comic Sans MS', "'Comic Sans MS', 'Comic Neue', cursive", 'display'],
  ['Impact', "Impact, 'Anton', sans-serif", 'display'],
];

const fallbackFor = (c: FontCategory) =>
  c === 'serif' ? 'serif' : c === 'mono' ? 'monospace' : c === 'script' ? 'cursive' : c === 'display' ? 'fantasy, sans-serif' : 'sans-serif';

const systemFonts: LibFont[] = SYSTEM.map(([label, value, category]) => ({
  label, value, family: label, category, source: 'system',
}));
const SYSTEM_VALUES = new Set(systemFonts.map((f) => f.value));
const googleFonts: LibFont[] = GOOGLE.filter(([n]) => !systemFonts.some((s) => s.family === n)).map(([n, category]) => ({
  label: n,
  value: `'${n}', ${fallbackFor(category)}`,
  family: n,
  category,
  source: 'google',
}));

/** Fuentes del sistema + Google, sin las propias. */
export const BUILTIN_FONTS: LibFont[] = [...systemFonts, ...googleFonts].sort((a, b) => a.label.localeCompare(b.label));
const GOOGLE_NAMES = new Set(googleFonts.map((f) => f.family));

// Palabras que la gente escribe en el buscador (español) → categoría.
export const CATEGORY_KEYWORDS: Record<FontCategory, string> = {
  sans: 'sans palo seco moderna limpia simple',
  serif: 'serif romana clasica elegante libro',
  display: 'display titulo decorativa llamativa negrita grande logo',
  script: 'script caligrafia cursiva manuscrita firma elegante letra',
  mono: 'mono monoespaciada codigo maquina',
};
export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans', serif: 'Serif', display: 'Títulos', script: 'Caligrafía', mono: 'Mono',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesQuery(f: LibFont, q: string): boolean {
  const t = norm(q.trim());
  if (!t) return true;
  return norm(f.label).includes(t) || CATEGORY_KEYWORDS[f.category].split(' ').some((k) => k.startsWith(t));
}

// ---------------------------------------------------------------- carga de CSS
const loadedLinks = new Map<string, HTMLLinkElement>();

function addLink(href: string): HTMLLinkElement {
  const prev = loadedLinks.get(href);
  if (prev) return prev;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  loadedLinks.set(href, link);
  return link;
}

const gname = (n: string) => encodeURIComponent(n).replace(/%20/g, '+');

/** Asegura que una fuente de Google esté cargada (regular y negrita). */
export function ensureFontLoaded(family: string) {
  if (!GOOGLE_NAMES.has(family) || typeof document === 'undefined') return;
  addLink(`https://fonts.googleapis.com/css2?family=${gname(family)}&display=swap`);
  addLink(`https://fonts.googleapis.com/css2?family=${gname(family)}:wght@700&display=swap`);
}

/** Saca la primera familia de un valor CSS `'Nombre', serif`. */
export function familyOf(value: string): string {
  return value.split(',')[0].replace(/['"]/g, '').trim();
}

export function ensureValueLoaded(value: string) {
  // También carga las sustitutas de Google de las fuentes de sistema (Arial→Arimo, Calibri→Carlito…).
  value.split(',').map((x) => x.replace(/['"]/g, '').trim()).forEach(ensureFontLoaded);
}

let previewDone = false;
/** Carga una sola vez todos los "AaBb" de las vistas previas del selector (hoja de estilos mínima). */
export function ensurePreviewCss() {
  if (previewDone || typeof document === 'undefined') return;
  previewDone = true;
  const chars = Array.from(new Set(googleFonts.map((f) => f.label).join('') + 'AaBbCc 0123456789'))
    .filter((c) => c.trim() || c === ' ')
    .join('');
  const text = encodeURIComponent(chars);
  const chunk = 45;
  for (let i = 0; i < googleFonts.length; i += chunk) {
    const fams = googleFonts.slice(i, i + chunk).map((f) => `family=${gname(f.family)}`).join('&');
    addLink(`https://fonts.googleapis.com/css2?${fams}&display=swap&text=${text}`);
  }
}

// ---------------------------------------------------------------- fuentes propias
interface StoredFont {
  id: string;
  family: string;
  kind: 'file' | 'link';
  category: FontCategory;
  data?: ArrayBuffer;
  mime?: string;
  url?: string;
  /** Enlace a una hoja de estilos (Google Fonts, Bunny, Adobe…). */
  css?: boolean;
}

const DB = 'docucraft-fonts';
const STORE = 'fonts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbAll(): Promise<StoredFont[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result as StoredFont[]);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return [];
  }
}
async function dbPut(f: StoredFont) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(f);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* sin almacenamiento: la fuente funciona durante la sesión */
  }
}
async function dbDelete(id: string) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignorar */
  }
}

let custom: StoredFont[] = [];
const registered = new Map<string, FontFace>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function subscribeFonts(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

let customSnapshot: LibFont[] = [];
function rebuild() {
  customSnapshot = custom.map((c) => ({
    label: c.family,
    value: `'${c.family}', ${fallbackFor(c.category)}`,
    family: c.family,
    category: c.category,
    source: 'custom' as const,
    customId: c.id,
  }));
}
export function getCustomFonts(): LibFont[] {
  return customSnapshot;
}

async function activate(f: StoredFont) {
  if (f.kind === 'file' && f.data) {
    if (registered.has(f.id)) return;
    const face = new FontFace(f.family, f.data);
    await face.load();
    document.fonts.add(face);
    registered.set(f.id, face);
  } else if (f.kind === 'link' && f.url) {
    if (f.css) addLink(f.url);
    else if (!registered.has(f.id)) {
      const face = new FontFace(f.family, `url(${f.url})`);
      await face.load();
      document.fonts.add(face);
      registered.set(f.id, face);
    }
  }
}

let initPromise: Promise<void> | null = null;
/** Carga las fuentes guardadas de visitas anteriores (una sola vez). */
export function initCustomFonts(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      custom = await dbAll();
      rebuild();
      emit();
      for (const f of custom) {
        try {
          await activate(f);
        } catch {
          /* enlace caído: se ignora */
        }
      }
      emit();
    })();
  }
  return initPromise;
}

// Lee el nombre real de la familia desde las tablas TTF/OTF/WOFF.
async function inflate(buf: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([buf as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export async function readFontFamilyName(buf: ArrayBuffer): Promise<string | null> {
  try {
    const dv = new DataView(buf);
    const tag = dv.getUint32(0);
    let nameTable: Uint8Array | null = null;
    const bytes = new Uint8Array(buf);
    if (tag === 0x774f4646) {
      // WOFF
      const n = dv.getUint16(12);
      for (let i = 0; i < n; i++) {
        const o = 44 + i * 20;
        const t = String.fromCharCode(...bytes.slice(o, o + 4));
        if (t !== 'name') continue;
        const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12);
        const raw = bytes.slice(off, off + comp);
        nameTable = comp < orig ? await inflate(raw) : raw;
      }
    } else if (tag === 0x00010000 || tag === 0x4f54544f || tag === 0x74727565) {
      const n = dv.getUint16(4);
      for (let i = 0; i < n; i++) {
        const o = 12 + i * 16;
        const t = String.fromCharCode(...bytes.slice(o, o + 4));
        if (t !== 'name') continue;
        const off = dv.getUint32(o + 8), len = dv.getUint32(o + 12);
        nameTable = bytes.slice(off, off + len);
      }
    }
    if (!nameTable) return null;
    const nd = new DataView(nameTable.buffer, nameTable.byteOffset, nameTable.byteLength);
    const count = nd.getUint16(2), strOff = nd.getUint16(4);
    let best: { id: number; s: string } | null = null;
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12;
      const platform = nd.getUint16(r), id = nd.getUint16(r + 6), len = nd.getUint16(r + 8), off = nd.getUint16(r + 10);
      if (id !== 1 && id !== 16) continue;
      const raw = nameTable.slice(strOff + off, strOff + off + len);
      let s = '';
      if (platform === 3 || platform === 0) for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode((raw[k] << 8) | raw[k + 1]);
      else s = String.fromCharCode(...raw);
      if (!s.trim()) continue;
      // Preferimos el nombre tipográfico (16) sobre el de familia (1).
      if (!best || (id === 16 && best.id !== 16)) best = { id, s: s.trim() };
    }
    return best?.s ?? null;
  } catch {
    return null;
  }
}

function familyFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_ ]?(regular|bold|italic|light|medium|semibold|black|thin|extrabold|variablefont.*)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || 'Fuente propia';
}

const guessCategory = (n: string): FontCategory =>
  /script|hand|brush|callig|cursive/i.test(n) ? 'script' : /mono|code|courier/i.test(n) ? 'mono' : /serif(?!.*sans)|roman|times|garamond/i.test(n) ? 'serif' : 'sans';

export const FONT_FILE_RE = /\.(ttf|otf|woff2?|ttc)$/i;

export interface AddFontResult {
  added: LibFont[];
  errors: string[];
}

export async function addFontFiles(files: File[]): Promise<AddFontResult> {
  await initCustomFonts();
  const added: LibFont[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!FONT_FILE_RE.test(file.name)) {
      errors.push(`${file.name}: no es un archivo de fuente (usa TTF, OTF o WOFF).`);
      continue;
    }
    try {
      const data = await file.arrayBuffer();
      const family = (await readFontFamilyName(data)) ?? familyFromFilename(file.name);
      const existing = custom.find((c) => c.family.toLowerCase() === family.toLowerCase());
      const rec: StoredFont = { id: existing?.id ?? `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, family, kind: 'file', category: guessCategory(family), data, mime: file.type };
      if (existing) {
        registered.delete(existing.id);
        custom = custom.filter((c) => c.id !== existing.id);
      }
      await activate(rec); // falla aquí si el archivo está dañado
      custom.push(rec);
      await dbPut(rec);
      rebuild();
      emit();
      added.push(customSnapshot.find((c) => c.customId === rec.id)!);
    } catch {
      errors.push(`${file.name}: no se pudo leer la fuente.`);
    }
  }
  return added.length || errors.length ? { added, errors } : { added, errors };
}

function parseFamilies(url: URL): string[] {
  const out: string[] = [];
  const params = url.searchParams.getAll('family');
  for (const p of params) {
    for (const part of p.split('|')) {
      const name = part.split(':')[0].replace(/\+/g, ' ').trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/**
 * Añade una fuente desde un enlace: página de Google Fonts, hoja de estilos
 * (Google/Bunny/…) o archivo directo de fuente. `nameHint` se usa cuando el
 * nombre no se puede deducir del enlace.
 */
export async function addFontFromLink(raw: string, nameHint?: string): Promise<AddFontResult & { needsName?: boolean }> {
  await initCustomFonts();
  const errors: string[] = [];
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { added: [], errors: ['El enlace no es válido.'] };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { added: [], errors: ['Solo se admiten enlaces http(s).'] };

  const push = async (rec: StoredFont) => {
    const existing = custom.find((c) => c.family.toLowerCase() === rec.family.toLowerCase());
    if (existing) {
      custom = custom.filter((c) => c.id !== existing.id);
      await dbDelete(existing.id);
    }
    await activate(rec);
    custom.push(rec);
    await dbPut(rec);
  };
  const mk = (family: string, extra: Partial<StoredFont>): StoredFont => ({
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    family, kind: 'link', category: guessCategory(family), ...extra,
  });

  try {
    const added: string[] = [];
    if (/(^|\.)fonts\.google\.com$/.test(url.hostname)) {
      // https://fonts.google.com/specimen/Open+Sans
      const m = url.pathname.match(/\/specimen\/([^/]+)/);
      const name = m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : '';
      if (!name) return { added: [], errors: ['No encontré el nombre de la fuente en ese enlace.'] };
      const css = `https://fonts.googleapis.com/css2?family=${gname(name)}&display=swap`;
      await push(mk(name, { url: css, css: true }));
      added.push(name);
    } else if (FONT_FILE_RE.test(url.pathname)) {
      const name = nameHint?.trim() || familyFromFilename(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      await push(mk(name, { url: url.href }));
      added.push(name);
    } else {
      const fams = parseFamilies(url);
      const names = fams.length ? fams : nameHint?.trim() ? [nameHint.trim()] : [];
      if (!names.length) return { added: [], errors: [], needsName: true };
      // Una sola hoja de estilos puede traer varias familias; se registra cada una.
      for (const name of names) await push(mk(name, { url: url.href, css: true }));
      added.push(...names);
    }
    rebuild();
    emit();
    return { added: customSnapshot.filter((c) => added.some((n) => n.toLowerCase() === c.family.toLowerCase())), errors };
  } catch {
    return { added: [], errors: ['No se pudo cargar la fuente desde ese enlace (¿está caído o bloquea su uso?).'] };
  }
}

export async function removeCustomFont(id: string) {
  const f = custom.find((c) => c.id === id);
  if (!f) return;
  const face = registered.get(id);
  if (face) {
    document.fonts.delete(face);
    registered.delete(id);
  }
  custom = custom.filter((c) => c.id !== id);
  await dbDelete(id);
  rebuild();
  emit();
}

// ---------------------------------------------------------------- recientes

const RECENT_KEY = 'docucraft_recent_fonts';
const MAX_RECENT = 6;

export function loadRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberFontUsed(current: string[], value: string): string[] {
  const next = [value, ...current.filter((v) => v !== value)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* no crítico */
  }
  return next;
}

export function allFonts(): LibFont[] {
  return [...customSnapshot, ...BUILTIN_FONTS];
}

export function findFontByValue(value: string): LibFont | undefined {
  const fam = familyOf(value).toLowerCase();
  return allFonts().find((f) => f.value === value) ?? allFonts().find((f) => f.family.toLowerCase() === fam);
}

export function fontLabelFor(value: string): string {
  const fam = familyOf(value);
  if (/^g_d\d+_f\d+$/.test(fam)) return 'Original del PDF';
  return findFontByValue(value)?.label ?? fam;
}

export function isSystemValue(v: string) {
  return SYSTEM_VALUES.has(v);
}
