import { Template, Field, TemplateImageElement, TemplateShapeElement, TemplatePathElement } from '../../types';
import { buildSvgPathD, getPathBounds } from './pathHelpers';

// ============================================
// Impresión del diseño en hoja A4 completa.
//
// Antes se imprimía la pantalla de la app tal cual (con su barra lateral,
// bordes y zoom), por eso salía recortada, chueca y con borde. Ahora el
// diseño se dibuja en un documento APARTE (iframe oculto) con:
//   • @page A4 y margen 0  → sin bordes ni encabezados del navegador
//   • tamaño en milímetros → sale exacto, sin depender del zoom de pantalla
//   • orientación automática según la forma del diseño (vertical/horizontal)
// ============================================

export interface PrintLayer {
  type: 'field' | 'image' | 'shape' | 'path';
  id: string;
}

interface PrintOptions {
  /** Orden de capas, de atrás hacia adelante (igual que el panel de Capas). */
  layers: PrintLayer[];
  /** Ancho en pantalla (px) del diseño — sirve para escalar bordes, sombras y trazos. */
  uiWidth: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n = (v: number) => Number(v.toFixed(4));

export const printTemplate = async (tpl: Template, opts: PrintOptions): Promise<void> => {
  const natW = tpl.natW || 1;
  const natH = tpl.natH || 1;

  // ---------- Hoja A4 y cómo entra el diseño ----------
  const landscape = natW >= natH;
  const pageW = landscape ? 297 : 210; // mm
  const pageH = landscape ? 210 : 297;
  const pageRatio = pageW / pageH;
  const tplRatio = natW / natH;

  let drawW: number;
  let drawH: number;
  if (Math.abs(tplRatio - pageRatio) / pageRatio < 0.04) {
    // Ya es (casi) una hoja A4 → se usa TODA la hoja.
    drawW = pageW;
    drawH = pageH;
  } else if (tplRatio > pageRatio) {
    drawW = pageW;
    drawH = pageW / tplRatio;
  } else {
    drawH = pageH;
    drawW = pageH * tplRatio;
  }
  const offX = (pageW - drawW) / 2;
  const offY = (pageH - drawH) / 2;

  const mmPerNat = drawW / natW; // diseño (px naturales) → mm
  const uiWidth = opts.uiWidth > 0 ? opts.uiWidth : natW;
  const mmPerUi = drawW / uiWidth; // px de pantalla → mm

  // ---------- Elementos ----------
  const fields = tpl.fields || [];
  const images = tpl.images || [];
  const shapes = tpl.shapes || [];
  const paths = tpl.paths || [];

  const fieldHtml = (f: Field, z: number) => {
    const deco = [f.underline && 'underline', f.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none';
    const shadow = f.shadow
      ? `${n(f.shadow.offsetX * mmPerUi)}mm ${n(f.shadow.offsetY * mmPerUi)}mm ${n(f.shadow.blur * mmPerUi)}mm ${f.shadow.color}`
      : 'none';
    return `<div style="position:absolute;left:${n(f.x * 100)}%;top:${n(f.y * 100)}%;width:calc(${n(f.w * 100)}% - ${n(16 * mmPerUi)}mm);z-index:${z};font-family:${esc(f.fontFamily)};font-size:${n(f.fontSize * mmPerNat)}mm;font-weight:${f.bold ? 700 : 400};font-style:${f.italic ? 'italic' : 'normal'};text-decoration:${deco};color:${esc(f.color)};text-align:${f.align};line-height:${f.lineHeight ?? 1.15};white-space:normal;word-break:break-word;overflow-wrap:break-word;transform:rotate(${f.rotation || 0}deg);text-shadow:${shadow};">${esc(f.label || '')}</div>`;
  };

  const imageHtml = (i: TemplateImageElement, z: number) => {
    const clip = (i as any).clipShape as 'circle' | 'rounded-rectangle' | undefined;
    const radius =
      clip === 'circle' ? '50%'
        : clip === 'rounded-rectangle' ? `${n(Math.min(i.w * drawW, i.h * drawH) * 0.15)}mm`
        : '0';
    const opacity = (i as any).opacity ?? 1;
    return `<div style="position:absolute;left:${n(i.x * 100)}%;top:${n(i.y * 100)}%;width:${n(i.w * 100)}%;height:${n(i.h * 100)}%;z-index:${z};transform:rotate(${i.rotation || 0}deg);opacity:${opacity};border-radius:${radius};overflow:${clip ? 'hidden' : 'visible'};"><img src="${esc(i.src)}" style="width:100%;height:100%;object-fit:${clip ? 'cover' : 'contain'};transform:scaleX(${i.flipH ? -1 : 1}) scaleY(${i.flipV ? -1 : 1});display:block;" /></div>`;
  };

  const shapeHtml = (s: TemplateShapeElement, z: number) => {
    const radius =
      s.shape === 'ellipse' ? '50%'
        : s.shape === 'rounded-rectangle' ? `${n(Math.min(s.w * drawW, s.h * drawH) * (s.cornerRadius ?? 0.15))}mm`
        : '0';
    const g = (s as any).gradient as { type: 'linear' | 'radial'; angle: number; stops: { color: string; position: number }[] } | undefined;
    const stops = g?.stops.map((st) => `${st.color} ${st.position}%`).join(', ');
    const background = g
      ? g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle}deg, ${stops})`
      : s.fill;
    const sh = (s as any).shadow as { color: string; blur: number; offsetX: number; offsetY: number } | undefined;
    const boxShadow = sh ? `${n(sh.offsetX * mmPerUi)}mm ${n(sh.offsetY * mmPerUi)}mm ${n(sh.blur * mmPerUi)}mm ${sh.color}` : 'none';
    const border = s.stroke && s.strokeWidth ? `${n(s.strokeWidth * mmPerUi)}mm solid ${s.stroke}` : 'none';
    return `<div style="position:absolute;left:${n(s.x * 100)}%;top:${n(s.y * 100)}%;width:${n(s.w * 100)}%;height:${n(s.h * 100)}%;z-index:${z};transform:rotate(${s.rotation || 0}deg);background:${background};opacity:${s.fillOpacity ?? 1};border:${border};border-radius:${radius};box-shadow:${boxShadow};box-sizing:border-box;"></div>`;
  };

  const pathHtml = (p: TemplatePathElement, z: number) => {
    if (p.points.length < 2) return '';
    const d = buildSvgPathD(p.points, p.closed, natW, natH);
    const b = getPathBounds(p.points);
    const cx = ((b.minX + b.maxX) / 2) * natW;
    const cy = ((b.minY + b.maxY) / 2) * natH;
    const strokeW = p.strokeWidth * (natW / uiWidth);
    return `<svg viewBox="0 0 ${natW} ${natH}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;z-index:${z};"><path d="${d}" fill="${p.fill && p.closed ? esc(p.fill) : 'none'}" fill-opacity="${p.fillOpacity ?? 1}" stroke="${esc(p.stroke)}" stroke-width="${n(strokeW)}" transform="rotate(${p.rotation || 0} ${n(cx)} ${n(cy)})" /></svg>`;
  };

  // En el editor, todos los vectores se dibujan juntos a la altura del más
  // alto del orden de capas; se imprime igual para que salga como se ve.
  const pathLayerIdx = opts.layers
    .map((l, idx) => (l.type === 'path' ? idx : -1))
    .filter((idx) => idx >= 0);
  const pathZ = pathLayerIdx.length ? Math.max(...pathLayerIdx) + 1 : 1;

  const parts: string[] = [];
  opts.layers.forEach((layer, idx) => {
    const z = idx + 1;
    if (layer.type === 'field') {
      const f = fields.find((x) => x.id === layer.id);
      if (f) parts.push(fieldHtml(f, z));
    } else if (layer.type === 'image') {
      const i = images.find((x) => x.id === layer.id);
      if (i) parts.push(imageHtml(i, z));
    } else if (layer.type === 'shape') {
      const s = shapes.find((x) => x.id === layer.id);
      if (s) parts.push(shapeHtml(s, z));
    } else if (layer.type === 'path') {
      const p = paths.find((x) => x.id === layer.id);
      if (p) parts.push(pathHtml(p, pathZ));
    }
  });

  // ---------- Documento de impresión ----------
  // Se resta 0.4 mm a la altura para que el redondeo del navegador no
  // genere una segunda hoja en blanco.
  const safeH = pageH - 0.4;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(tpl.name || 'Certificado')}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; width: ${pageW}mm; height: ${safeH}mm; background: #fff; overflow: hidden; }
  .page { position: relative; width: ${pageW}mm; height: ${safeH}mm; overflow: hidden; }
  .design { position: absolute; left: ${n(offX)}mm; top: ${n(offY)}mm; width: ${n(drawW)}mm; height: ${n(drawH)}mm; }
  .bg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 0; display: block; }
</style>
</head>
<body>
  <div class="page">
    <div class="design">
      <img class="bg" src="${esc(tpl.image)}" />
      ${parts.join('\n      ')}
    </div>
  </div>
</body>
</html>`;

  // ---------- Iframe oculto → imprimir ----------
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageW}mm;height:${pageH}mm;border:0;`;
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    throw new Error('No se pudo crear el documento de impresión');
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Esperar a que carguen las imágenes y las fuentes antes de imprimir
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); })
    )
  );
  try { await (doc as any).fonts?.ready; } catch { /* sin soporte, se imprime igual */ }
  await new Promise((r) => setTimeout(r, 150));

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup);
  win.focus();
  win.print();
  // Respaldo por si el navegador no dispara "afterprint"
  setTimeout(() => { if (iframe.isConnected) iframe.remove(); }, 10 * 60 * 1000);
};
