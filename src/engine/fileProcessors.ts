// Procesadores de archivos PDF y Word (.docx) para importarlos al lienzo.
import * as pdfjsLib from 'pdfjs-dist';
// La URL del worker se resuelve como asset propio gracias a Vite (?url).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import * as mammoth from 'mammoth';
import { newPdfId, queuePageText, registerPdfDoc } from './pdfText';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Cede el hilo al navegador para que la pantalla siga respondiendo mientras se procesan muchas hojas. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Resolución según el tamaño del archivo: pocas hojas → más nitidez; cientos de hojas → más ligero y rápido. */
export function scaleForPages(n: number): number {
  if (n <= 12) return 2;
  if (n <= 40) return 1.7;
  if (n <= 120) return 1.4;
  if (n <= 300) return 1.15;
  return 1;
}

export interface PdfImportProgress {
  (done: number, total: number): void;
}

/** Nombre del archivo adjunto con el proyecto editable que Documentar guarda dentro de sus PDF. */
export const PROJECT_ATTACHMENT = 'documentar-proyecto.json';

/** Si el PDF fue guardado por Documentar con su proyecto adjunto, lo devuelve (para seguir editando todo). */
async function readEmbeddedProject(pdf: pdfjsLib.PDFDocumentProxy): Promise<string | null> {
  try {
    const att = (await pdf.getAttachments()) as Record<string, { content: Uint8Array }> | null;
    const f = att?.[PROJECT_ATTACHMENT];
    return f ? new TextDecoder().decode(f.content) : null;
  } catch {
    return null;
  }
}

/**
 * Procesa un PDF con pdf.js: cada página se convierte en una imagen a todo
 * el ancho de la hoja (como una página escaneada), no como elemento
 * flotante, ya que representa la hoja completa.
 *
 * Pensado para archivos grandes: JPEG en lugar de PNG, resolución según el número
 * de hojas, cede el hilo entre hojas y deja la lectura del texto para después.
 * Devuelve el proyecto incrustado si el PDF ya fue guardado por Documentar.
 */
export async function processPDFFile(
  file: File,
  onPageRendered: (pageHTML: string, orientation: 'portrait' | 'landscape') => void,
  onProgress?: PdfImportProgress
): Promise<{ project: string | null }> {
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);
  const pdf = await pdfjsLib.getDocument(typedArray).promise;
  const project = await readEmbeddedProject(pdf);
  if (project) {
    void pdf.destroy();
    return { project };
  }
  const docId = newPdfId('doc');
  registerPdfDoc(docId, pdf);
  const scale = scaleForPages(pdf.numPages);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
    }
    // JPEG de alta calidad: 5–10 veces más liviano que PNG y casi idéntico a la vista.
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    canvas.width = canvas.height = 0; // libera la memoria del lienzo al instante
    // Texto de la página (para poder editarlo en el sitio): se lee después, sin frenar la carga.
    const pdfId = newPdfId('pg');
    queuePageText(pdfId, page, viewport, docId, pageNum);
    const imgHTML = `<img src="${imgData}" class="block w-full h-full" style="object-fit:contain;" draggable="false" decoding="async" data-pdf-id="${pdfId}" />`;
    const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
    onPageRendered(imgHTML, orientation);
    onProgress?.(pageNum, pdf.numPages);
    if (pageNum % 2 === 0 || pdf.numPages < 30) await tick();
  }
  return { project: null };
}

/**
 * Procesa un archivo Word (.docx) con Mammoth.js, incluidas imágenes
 * embebidas en base64, y devuelve el HTML resultante para insertarse como
 * el contenido de una hoja nueva.
 */
export async function processDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const options = {
    convertImage: mammoth.images.imgElement((image) =>
      image.read('base64').then((imageBuffer) => ({
        src: `data:${image.contentType};base64,${imageBuffer}`,
      }))
    ),
    // Mapeo de estilos ampliado para conservar la mayor fidelidad posible con
    // el documento de Word original: todos los niveles de título, subrayado
    // (Mammoth no lo trae por defecto), citas y resaltado.
    styleMap: [
      "p[style-name='Title'] => h1.doc-title:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='Quote'] => blockquote:fresh",
      "p[style-name='Intense Quote'] => blockquote.intense:fresh",
      "r[style-name='Strong'] => strong",
      "r[style-name='Emphasis'] => em",
      'u => u',
      'strike => s',
    ],
    includeDefaultStyleMap: true,
    includeEmbeddedStyleMap: true,
  };

  const result = await mammoth.convertToHtml({ arrayBuffer }, options);
  return result.value;
}
