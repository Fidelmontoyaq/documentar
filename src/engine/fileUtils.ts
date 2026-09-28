// Utilidades pequeñas para leer archivos e imágenes, compartidas por el
// motor del editor y los procesadores de PDF/Word.

/** Lee un archivo como Data URL (Promise). */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Tamaño natural (intrínseco) de una imagen a partir de su Data URL. */
export function loadImageNaturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 });
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = src;
  });
}

/** Calcula el tamaño ajustado (sin recortar ni distorsionar) dentro de un máximo. */
export async function computeFittedSize(
  src: string,
  maxWidth: number,
  maxHeight: number
): Promise<{ width: number; height: number }> {
  const safeMaxW = Math.max(maxWidth, 80);
  const safeMaxH = Math.max(maxHeight, 80);
  const { w, h } = await loadImageNaturalSize(src);
  const ratio = Math.min(safeMaxW / w, safeMaxH / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

/** Extensión en minúsculas de un nombre de archivo (sin el punto). */
export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}
