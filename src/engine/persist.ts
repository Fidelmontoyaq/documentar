// Autoguardado del documento en IndexedDB: si se recarga la página o se cierra el navegador, el trabajo sigue ahí.
const DB = 'documentar';
const STORE = 'kv';
const KEY = 'doc-actual';

export interface SavedDoc {
  html: string;
  font: string;
  folio: Record<string, unknown> | null;
  savedAt: number;
  pages: number;
  pdfPages?: Record<string, unknown>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sin IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDoc(doc: SavedDoc): Promise<void> {
  try { await tx('readwrite', (s) => s.put(doc, KEY)); } catch (e) { console.warn('No se pudo autoguardar', e); }
}

export async function loadDoc(): Promise<SavedDoc | null> {
  try { return ((await tx('readonly', (s) => s.get(KEY))) as SavedDoc | undefined) ?? null; } catch { return null; }
}

export async function clearDoc(): Promise<void> {
  try { await tx('readwrite', (s) => s.delete(KEY)); } catch { /* nada */ }
}

/** Pide al navegador que no borre estos datos al liberar espacio. */
export function requestPersistence() {
  try { void navigator.storage?.persist?.(); } catch { /* nada */ }
}
