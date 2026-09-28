import type { FontDefinition } from '../types/documentEditor';

// ===================== CATÁLOGO DE TIPOGRAFÍAS =====================
// Se muestran agrupadas por "Usadas recientemente" y "Todas las demás"
// (no por clásicas/modernas), y cada opción se renderiza con su propia
// tipografía para que el usuario vea de un vistazo cómo luce cada una.
export const FONT_CATALOG: FontDefinition[] = [
  { label: 'Times New Roman', value: "'Times New Roman', 'Tinos', Times, serif" },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Georgia', value: "Georgia, 'PT Serif', serif" },
  { label: 'Book Antiqua / Palatino', value: "'Book Antiqua', 'Palatino Linotype', Palatino, serif" },
  { label: 'Garamond', value: "Garamond, 'EB Garamond', serif" },
  { label: 'Constantia', value: "Constantia, 'PT Serif', serif" },
  { label: 'Century Schoolbook', value: "'Century Schoolbook', 'Tinos', serif" },
  { label: 'Bookman Old Style', value: "'Bookman Old Style', 'Libre Baskerville', serif" },
  { label: 'Calibri', value: "Calibri, 'Carlito', Candara, sans-serif" },
  { label: 'Courier New', value: "'Courier New', 'Courier Prime', Courier, monospace" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Arial', value: "Arial, 'Arimo', Helvetica, sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Lora', value: "'Lora', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'Crimson Text', value: "'Crimson Text', serif" },
  { label: 'Cinzel', value: "'Cinzel', serif" },
];

const RECENT_FONTS_KEY = 'docucraft_recent_fonts';
const MAX_RECENT_FONTS = 5;

export function loadRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FONTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberFontUsed(currentRecent: string[], value: string): string[] {
  const next = [value, ...currentRecent.filter((v) => v !== value)].slice(0, MAX_RECENT_FONTS);
  try {
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(next));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena, etc.): no es crítico.
  }
  return next;
}

export function fontLabelFor(value: string): string {
  const found = FONT_CATALOG.find((f) => f.value === value);
  if (found) return found.label;
  return value.split(',')[0].replace(/'/g, '');
}

/** Devuelve las fuentes agrupadas para un <select>: recientes primero, luego el resto. */
export function groupedFontOptions(recentFonts: string[]): {
  recent: FontDefinition[];
  rest: FontDefinition[];
} {
  const recentValues = recentFonts.filter((v) => FONT_CATALOG.some((f) => f.value === v));
  const recent = recentValues.map((v) => ({ label: fontLabelFor(v), value: v }));
  const rest = FONT_CATALOG.filter((f) => !recentValues.includes(f.value));
  return { recent, rest };
}
