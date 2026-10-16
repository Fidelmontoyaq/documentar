# Fiscalización de Actas Electorales · Módulo Jurisdiccional (offline-first)

React 18 + TypeScript + Vite + Tailwind (npm) + Zustand.
OCR con Tesseract.js (WASM local), PDF con pdfjs-dist (worker local).
Sin APIs en la nube, sin CDN, sin backend. Auditoría en IndexedDB.

## Uso local
```bash
npm install     # el postinstall copia los binarios OCR a /public automáticamente
npm run dev
npm run build   # genera /dist (sitio estático)
```

## Binarios OCR en /public
`npm install` ejecuta `scripts/vendorizar.mjs`, que deja:
```
public/pdf.worker.min.js
public/tesseract/worker.min.js
public/tesseract/core/tesseract-core*.js (variantes simd/lstm)
public/tessdata/spa.traineddata.gz
public/tessdata/eng.traineddata.gz
```
Si falló (sin red durante install, etc.), vea "PASOS PARA VENDORIZAR OCR" abajo.
Puede commitear `/public` a Git para no depender del postinstall.

## GitHub + Vercel (manual)
```bash
git init && git add . && git commit -m "acta-fiscalizador"
git remote add origin <URL-de-su-repo> && git push -u origin main
```
En Vercel: *Add New Project* → importe el repo → Framework "Vite" →
Build `npm run build`, Output `dist`. No requiere variables de entorno.

## Flujo de trabajo
1. Cargar el PDF/imagen del acta (SHA-256 local). El formulario se ubica solo y se dibujan las **zonas de trabajo**
   (votos provincial/distrital, ciudadanos que votaron, 3 miembros de mesa, observaciones).
2. Si alguna zona no coincide, pulse «✎ zona» y **dibuje el rectángulo** sobre el acta. Las líneas punteadas muestran en vivo
   las filas y los 3 casilleros de cada celda (centena · decena · unidad).
3. «Leer acta»: cada celda se clasifica como **negro** (no cuenta), **vacío** (nadie votó = 0) o **con voto**; los dígitos se leen
   casillero por casillero con un clasificador propio (local). La cabecera impresa (mesa, electores hábiles, dpto/prov/distrito) se lee con Tesseract.
4. Revisar en el semáforo, corregir y confirmar. Cada celda confirmada/corregida **enseña** al clasificador (IndexedDB local).
5. Regla de cuadre, por cada elección: votos válidos + blancos + nulos + impugnados = ciudadanos que votaron
   (y el «TOTAL DE VOTOS EMITIDOS» escrito debe coincidir con la suma).
6. Si no cuadra, **cargue la misma acta reescrita**: la anterior se guarda como versión A y el panel «Comparación de actas»
   muestra las diferencias y cuál cuadra.
7. Exportar JSON (acta, validación, versiones anteriores y log de auditoría).

## Miembros de mesa y observaciones
Solo se verifica que existan la **firma** (lo más importante), nombres/apellidos y DNI; se muestra el recorte para confirmar a ojo.
El recuadro de observaciones se muestra recortado para que lo lea el usuario.

## Limitaciones honestas
- Los números manuscritos se leen con un clasificador de dígitos pequeño: acierto medido ≈ 75-80 % por dígito en validación cruzada
  sobre un acta real. Por eso toda celda dudosa va al fiscalizador y el sistema mejora con cada corrección.
- Las zonas por defecto están medidas sobre la cédula ONPE 4b de Lima (32 organizaciones). Con otro formato, redibuje las zonas
  y ajuste «N.º de organizaciones».
- Esta herramienta apoya la revisión; no reemplaza la decisión del JEE/JNE.

## PASOS PARA VENDORIZAR OCR (manual, si el postinstall no los copió)

| Archivo | URL oficial | Destino |
|---|---|---|
| `worker.min.js` | https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js | `public/tesseract/worker.min.js` |
| Core WASM (todos los `tesseract-core*.js`) | https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/ (o `node_modules/tesseract.js-core/`) | `public/tesseract/core/` |
| `spa.traineddata.gz` | https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/spa.traineddata.gz | `public/tessdata/spa.traineddata.gz` |
| `eng.traineddata.gz` | https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/eng.traineddata.gz | `public/tessdata/eng.traineddata.gz` |
| `pdf.worker.min.js` | https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js | `public/pdf.worker.min.js` |

Los `traineddata` deben quedar **comprimidos (`.gz`)**, tal como los lee Tesseract.js por defecto.
Si usa archivos sin comprimir, ponga `gzip: false` en `createWorker` dentro de `src/hooks/useOCR.ts`.
