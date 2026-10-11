// Tema de la interfaz: claro (por defecto, el de las oficinas), oscuro (el azul marino de antes) y automático.
import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';
const KEY = 'docucraft.theme';

export function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* sin almacenamiento */ }
  return 'light';
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
export const resolveTheme = (m: ThemeMode): 'light' | 'dark' => (m === 'auto' ? (prefersDark() ? 'dark' : 'light') : m);

export function applyTheme(m: ThemeMode) {
  const r = resolveTheme(m);
  document.body.classList.toggle('de-light', r === 'light');
  document.body.classList.toggle('de-dark', r === 'dark');
  document.documentElement.style.colorScheme = r;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', r === 'light' ? '#ffffff' : '#0f172a');
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => loadTheme());
  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'auto') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const h = () => applyTheme('auto');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [mode]);
  const setMode = useCallback((m: ThemeMode) => {
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    setModeState(m);
  }, []);
  return { mode, setMode, resolved: resolveTheme(mode) };
}

// Evita el parpadeo: se aplica antes de pintar React.
if (typeof document !== 'undefined' && document.body) applyTheme(loadTheme());
