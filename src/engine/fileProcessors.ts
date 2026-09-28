// Procesadores de archivos PDF y Word (.docx) para importarlos al lienzo.
import * as pdfjsLib from 'pdfjs-dist';
// La URL del worker se resuelve como asset propio gracias a Vite (?url).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import * as mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Procesa un PDF con pdf.js: cada página se convierte en una imagen a todo
 * el ancho de la hoja (como una página escaneada), no como elemento
 * flotante, ya que representa la hoja completa.
 *
 * `onPageRendered` se invoca una vez por cada página del PDF, con el HTML
 * listo para insertarse como una hoja nueva del documento.
 */
export async function processPDFFile(
  file: File,
  onPageRendered: (pageHTML: string) => void
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);
  const pdf = await pdfjsLib.getDocument(typedArray).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
    }
    const imgData = canvas.toDataURL('image/png');
    // La hoja del PDF se muestra tal cual, sin ningún control de edición ni
    // recorte: ocupa el 100% del ancho y alto de la hoja (object-fit: contain
    // evita que se distorsione o se recorte si la proporción del PDF
    // original no fuera exactamente A4).
    const imgHTML = `<img src="${imgData}" class="block w-full h-full" style="object-fit:contain;" draggable="false" />`;
    onPageRendered(imgHTML);
  }
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
