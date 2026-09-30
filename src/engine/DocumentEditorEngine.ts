// Motor del Editor y Ensamblador de Documentos.
//
// Todo lo que manipula el DOM directamente (contentEditable, execCommand,
// arrastre de cuadros flotantes, etc.) vive aquí como una sola clase. React
// solo dibuja el "chrome" (riel, panel, modal, barra) y llama a estos métodos.
import Sortable from 'sortablejs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type {
  ArrangeLayoutId,
  CurrentMargin,
  DocumentEditorEngineListeners,
  FloatingBoxType,
  ImagesPerPageMode,
  MarginPresetClass,
  PageOrientation,
  ToolbarState,
  ToolbarTargetKind,
} from '../types/documentEditor';
import { fileExtension, loadImageNaturalSize, readFileAsDataURL } from './fileUtils';
import { processDocxFile, processPDFFile } from './fileProcessors';
import { CAPTION_SPACE, computeLayout } from './imageLayouts';

const MARGIN_CLASSES: MarginPresetClass[] = [
  'p-[25mm_20mm]',
  'p-[12mm_10mm]',
  'p-[35mm_30mm]',
  'p-[5mm]',
];

const PAGE_BASE_CLASSES =
  'a4-page bg-white text-slate-800 shadow-2xl shadow-black/40 mx-auto relative flex flex-col box-border transition-all duration-200 print:shadow-none print:w-full print:h-full break-after-page group';

const ORIENTATION_SIZE_CLASSES: Record<PageOrientation, string> = {
  portrait: 'w-[210mm] min-h-[297mm]',
  landscape: 'w-[297mm] min-h-[210mm]',
};
// mm reales por orientación (los usa también la exportación a PDF).
const PAGE_MM: Record<PageOrientation, { w: number; h: number }> = {
  portrait: { w: 210, h: 297 },
  landscape: { w: 297, h: 210 },
};
// Relación de aspecto (ancho/alto) típica de una hoja A4 apaisada, con margen de tolerancia.
const LANDSCAPE_AR_MIN = 1.12;
const LANDSCAPE_AR_MAX = 1.9;

const CLIPBOARD_MARKER = '\u200b[DocuCraft-elemento]';
const IMAGE_SELECTOR = ':scope > .floating-box[data-type="image"]';

interface PageArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class DocumentEditorEngine {
  private pagesWrapper: HTMLElement;
  private scrollContainer: HTMLElement;
  private listeners: DocumentEditorEngineListeners;

  private pageCounter = 1;
  private floatingBoxCounter = 0;
  private activePage: HTMLElement | null = null;
  private sortableInstance: Sortable | null = null;
  private currentMargin: CurrentMargin = { type: 'custom', value: 2 };
  private currentFont = "'Inter', sans-serif";
  private savedSelectionRange: Range | null = null;

  private toolbarEl: HTMLElement | null = null;
  private etTarget: HTMLElement | null = null;
  private etTargetKind: ToolbarTargetKind = null;

  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Historial (deshacer/rehacer) por instantáneas del documento
  private history: string[] = [];
  private historyIndex = -1;
  private imgStore: string[] = [];
  private imgIds = new Map<string, number>();
  private restoring = false;
  private busy = false;
  private commitTimer = 0;

  // Portapapeles interno para imágenes / cuadros de texto
  private clipboardBox: { html: string; captionHtml: string | null; left: number; top: number } | null = null;
  private pasteStep = 0;
  private markerWritten = false;

  // Zoom
  private zoom = 1;
  private zoomShell: HTMLElement | null = null;
  private scrollRaf = 0;
  private infoRaf = 0;

  private boundFocusIn = this.handleFocusIn.bind(this);
  private boundPointerDown = this.handlePointerDown.bind(this);
  private boundKeyDown = this.handleKeyDown.bind(this);
  private boundScroll = this.handleScroll.bind(this);
  private boundResize = this.handleResize.bind(this);
  private boundPaste = this.handlePaste.bind(this);
  private boundCopyEvt = this.handleNativeCopy.bind(this);
  private boundWheel = this.handleWheel.bind(this);

  constructor(
    pagesWrapper: HTMLElement,
    scrollContainer: HTMLElement,
    listeners: DocumentEditorEngineListeners = {}
  ) {
    this.pagesWrapper = pagesWrapper;
    this.scrollContainer = scrollContainer;
    this.listeners = listeners;

    // El lienzo empieza vacío: la primera hoja la crea el motor.
    if (!this.pagesWrapper.querySelector('.a4-page')) {
      this.addNewPage();
    }
    this.initSortable();
    this.setActivePage(this.pagesWrapper.querySelector<HTMLElement>('.a4-page'));

    document.addEventListener('focusin', this.boundFocusIn);
    document.addEventListener('pointerdown', this.boundPointerDown);
    document.addEventListener('keydown', this.boundKeyDown);
    this.scrollContainer.addEventListener('scroll', this.boundScroll, { passive: true });
    window.addEventListener('resize', this.boundResize);

    // Avisa a React cuando cambian las imágenes de la hoja activa.
    document.addEventListener('paste', this.boundPaste);
    document.addEventListener('copy', this.boundCopyEvt);
    document.addEventListener('cut', this.boundCopyEvt);
    this.scrollContainer.addEventListener('wheel', this.boundWheel, { passive: false });

    this.observer = new MutationObserver(() => {
      this.scheduleImageInfo();
      this.scheduleCommit();
    });
    this.observer.observe(this.pagesWrapper, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-cap-gap', 'data-cap-dx', 'data-cap-w', 'data-ar', 'data-rotation'],
    });

    // Zoom: el contenedor directo del lienzo se ajusta al tamaño escalado.
    this.zoomShell = this.pagesWrapper.parentElement;
    this.resizeObserver = new ResizeObserver(() => this.syncZoomShell());
    this.resizeObserver.observe(this.pagesWrapper);
    this.syncZoomShell();

    this.updatePageNumbers();
    this.history = [this.serializeState()];
    this.historyIndex = 0;
    this.emitHistory();
  }

  destroy() {
    document.removeEventListener('focusin', this.boundFocusIn);
    document.removeEventListener('pointerdown', this.boundPointerDown);
    document.removeEventListener('keydown', this.boundKeyDown);
    this.scrollContainer.removeEventListener('scroll', this.boundScroll);
    window.removeEventListener('resize', this.boundResize);
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    document.removeEventListener('paste', this.boundPaste);
    document.removeEventListener('copy', this.boundCopyEvt);
    document.removeEventListener('cut', this.boundCopyEvt);
    this.scrollContainer.removeEventListener('wheel', this.boundWheel);
    clearTimeout(this.commitTimer);
    this.sortableInstance?.destroy();
    cancelAnimationFrame(this.scrollRaf);
    cancelAnimationFrame(this.infoRaf);
  }

  setToolbarElement(el: HTMLElement | null) {
    this.toolbarEl = el;
  }

  // ===================== HOJA ACTIVA =====================

  private setActivePage(page: HTMLElement | null) {
    if (!page) return;
    if (this.activePage !== page) {
      this.pagesWrapper.querySelectorAll('.a4-page.page-active').forEach((p) => p.classList.remove('page-active'));
      page.classList.add('page-active');
      this.activePage = page;
    }
    this.scheduleImageInfo();
  }

  private getActivePage(): HTMLElement | null {
    if (this.activePage && this.pagesWrapper.contains(this.activePage)) return this.activePage;
    const first = this.pagesWrapper.querySelector<HTMLElement>('.a4-page');
    this.setActivePage(first);
    return first;
  }

  private scheduleImageInfo() {
    if (this.infoRaf) return;
    this.infoRaf = requestAnimationFrame(() => {
      this.infoRaf = 0;
      const page = this.getActivePage();
      const count = page ? page.querySelectorAll(IMAGE_SELECTOR).length : 0;
      this.listeners.onActiveImagesChange?.(count);
    });
  }

  /** Al hacer scroll, la hoja activa pasa a ser la que más se ve (si la actual casi no se ve). */
  private pickVisiblePage() {
    const c = this.scrollContainer.getBoundingClientRect();
    const visible = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
    };
    const current = this.getActivePage();
    if (current && visible(current) >= c.height * 0.3) return;
    let best: HTMLElement | null = null;
    let bestVis = 0;
    this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page').forEach((p) => {
      const v = visible(p);
      if (v > bestVis) {
        bestVis = v;
        best = p;
      }
    });
    if (best) this.setActivePage(best);
  }

  // ===================== LISTENERS GLOBALES =====================

  private handleFocusIn(e: FocusEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest) return;
    const page = target.closest<HTMLElement>('.a4-page');
    if (page) this.setActivePage(page);
    const box = target.closest<HTMLElement>('.floating-box');
    if (box) {
      if (box.dataset.type !== 'image') this.selectFloatingBox(box);
      return;
    }
    const textTarget = target.closest<HTMLElement>('.page-header, .page-content, .page-footer');
    if (textTarget && textTarget.getAttribute('contenteditable') === 'true') {
      this.showElementToolbarFor(textTarget, 'text');
    }
  }

  private handlePointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest) return;
    const page = target.closest<HTMLElement>('.a4-page');
    if (page) this.setActivePage(page);

    // Clics en la barra superior / zoom no deben quitar la selección.
    if (target.closest('[data-element-toolbar], [data-keep-selection]')) return;
    const insideBox = target.closest('.floating-box');
    if (!insideBox) {
      this.pagesWrapper.querySelectorAll('.floating-box.box-selected').forEach((b) => b.classList.remove('box-selected'));
    }
    if (insideBox) return;

    const textZone = target.closest<HTMLElement>('.page-header, .page-content, .page-footer');
    if (textZone && textZone.getAttribute('contenteditable') === 'true') {
      this.showElementToolbarFor(textZone, 'text');
    } else {
      this.hideElementToolbar();
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const inField = !!t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !inField) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if ((k === 'c' || k === 'x') && this.getSelectedBox() && !this.hasTextSelection()) {
        e.preventDefault();
        this.copySelection(k === 'x');
      }
      return;
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (t?.isContentEditable || inField) return;
    const selected = this.getSelectedBox();
    if (selected) {
      e.preventDefault();
      this.removeFloatingBox(selected);
    }
  }

  private handleScroll() {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      this.pickVisiblePage();
    });
  }

  private handleResize() {
    this.syncZoomShell();
  }

  // ===================== SORTABLE (reordenar hojas arrastrando) =====================

  private initSortable() {
    this.sortableInstance = new Sortable(this.pagesWrapper, {
      animation: 250,
      handle: '.a4-page',
      filter: '[contenteditable="true"], button, input, .img-tools, .floating-box, .margin-guide',
      preventOnFilter: false,
      ghostClass: 'sortable-ghost',
      onEnd: () => this.updatePageNumbers(),
    });
  }

  // ===================== FORMATO DE TEXTO =====================

  formatText(command: string, value: string | null = null) {
    if (command === 'foreColor') this.restoreSavedSelection();
    document.execCommand(command, false, value ?? undefined);
  }

  saveCurrentSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) this.savedSelectionRange = sel.getRangeAt(0).cloneRange();
  }

  private restoreSavedSelection() {
    if (!this.savedSelectionRange) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(this.savedSelectionRange);
  }

  insertPageNumberField() {
    document.execCommand(
      'insertHTML',
      false,
      '<span class="page-number-display text-xs text-slate-400">Página 1</span>'
    );
    this.updatePageNumbers();
  }

  // ===================== TIPOGRAFÍA Y MÁRGENES GLOBALES =====================

  changeGlobalFont(fontFamily: string) {
    this.currentFont = fontFamily;
    this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page').forEach((page) => {
      page.style.fontFamily = fontFamily;
    });
    this.listeners.onFontUsed?.(fontFamily);
  }

  /** Hojas donde se puede tocar el margen: nunca las páginas provenientes de un PDF importado. */
  private editableMarginPages(): HTMLElement[] {
    return Array.from(this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page:not([data-pdf-page="true"])'));
  }

  changeGlobalMargin(marginClass: MarginPresetClass) {
    this.currentMargin = { type: 'class', value: marginClass };
    this.editableMarginPages().forEach((page) => {
      page.classList.remove(...MARGIN_CLASSES);
      page.style.padding = '';
      page.classList.add(marginClass);
    });
  }

  applyCustomMargin(cm: number) {
    const safeCm = Number.isNaN(cm) || cm < 0 ? 0 : cm;
    this.currentMargin = { type: 'custom', value: safeCm };
    this.editableMarginPages().forEach((page) => {
      page.classList.remove(...MARGIN_CLASSES);
      page.style.padding = `${safeCm}cm`;
    });
  }

  // ===================== GESTIÓN DE PÁGINAS =====================

  private buildPageHTML(pageId: string, contentHTML: string, isPdfPage: boolean, orientation: PageOrientation = 'portrait'): string {
    const marginClass = isPdfPage ? 'p-0' : this.currentMargin.type === 'class' ? this.currentMargin.value : '';
    const sizeClass = ORIENTATION_SIZE_CLASSES[orientation];
    const marginInlineStyle =
      !isPdfPage && this.currentMargin.type === 'custom' ? `padding:${this.currentMargin.value}cm;` : '';

    const headerHTML = isPdfPage
      ? ''
      : `<div class="page-header has-placeholder min-h-[2.2rem] mb-4 outline-none focus:bg-slate-100/60 text-2xl font-bold text-slate-800 text-center empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:font-normal" data-placeholder="Título sugerido" contenteditable="true" spellcheck="false"></div>`;
    const footerHTML = isPdfPage
      ? ''
      : `<div class="page-footer has-placeholder min-h-[1.4rem] mt-4 outline-none focus:bg-slate-100/60 text-slate-800 text-xs text-center empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400" data-placeholder="Pie de página (opcional)" contenteditable="true" spellcheck="false"></div>`;

    return `
      <div class="${PAGE_BASE_CLASSES} ${sizeClass} ${marginClass}" id="${pageId}" data-page-id="${pageId}" data-orientation="${orientation}" ${isPdfPage ? 'data-pdf-page="true"' : ''} style="font-family: ${this.currentFont}; ${marginInlineStyle}">
        <div class="page-toolbar-right absolute -right-12 top-0 flex flex-col gap-2 print:hidden bg-slate-800 p-1.5 rounded-lg border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30" data-page-toolbar>
          <button type="button" data-action="move-up" title="Mover Arriba" class="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-blue-400 transition">&#8593;</button>
          <button type="button" data-action="move-down" title="Mover Abajo" class="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-blue-400 transition">&#8595;</button>
          <button type="button" data-action="orientation" title="Girar hoja (vertical / horizontal)" class="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-amber-400 transition">&#8635;</button>
          <button type="button" data-action="duplicate" title="Duplicar Página" class="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-emerald-400 transition">&#10697;</button>
          <button type="button" data-action="delete" title="Eliminar Página" class="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-rose-400 transition">&#10005;</button>
        </div>
        ${headerHTML}
        <div class="page-content ${contentHTML ? '' : 'has-placeholder'} relative flex-1 outline-none break-words focus:bg-slate-100/40 ${isPdfPage ? 'p-0 m-0' : 'text-slate-600 leading-relaxed'}" data-placeholder="Escribe tu contenido aquí..." contenteditable="${isPdfPage ? 'false' : 'true'}" spellcheck="false">${contentHTML}</div>
        ${footerHTML}
      </div>
    `;
  }

  private wirePageToolbar(pageEl: HTMLElement) {
    pageEl.querySelectorAll<HTMLButtonElement>('[data-page-toolbar] button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = pageEl.id;
        switch (btn.dataset.action) {
          case 'move-up': this.movePageUp(id); break;
          case 'move-down': this.movePageDown(id); break;
          case 'orientation': this.togglePageOrientation(id); break;
          case 'duplicate': this.duplicatePage(id); break;
          case 'delete': this.deletePage(id); break;
        }
      });
    });
  }

  addNewPage(
    contentHTML = '',
    isPdfPage = false,
    opts: { after?: HTMLElement | null; scroll?: boolean; activate?: boolean; orientation?: PageOrientation } = {}
  ): HTMLElement {
    this.pageCounter++;
    const pageId = `page-${Date.now()}-${this.pageCounter}`;
    const html = this.buildPageHTML(pageId, contentHTML, isPdfPage, opts.orientation ?? 'portrait');
    if (opts.after) opts.after.insertAdjacentHTML('afterend', html);
    else this.pagesWrapper.insertAdjacentHTML('beforeend', html);
    const newPageEl = document.getElementById(pageId) as HTMLElement;
    this.wirePageToolbar(newPageEl);
    this.updatePageNumbers();
    if (opts.activate !== false) this.setActivePage(newPageEl);
    if (opts.scroll !== false) newPageEl.scrollIntoView({ behavior: 'smooth' });
    return newPageEl;
  }

  deletePage(pageId: string) {
    if (this.pagesWrapper.querySelectorAll('.a4-page').length <= 1) {
      this.listeners.onError?.('El documento debe contener al menos una página.');
      return;
    }
    document.getElementById(pageId)?.remove();
    this.updatePageNumbers();
    this.getActivePage();
  }

  movePageUp(pageId: string) {
    const page = document.getElementById(pageId);
    const previous = page?.previousElementSibling;
    if (page && previous && previous.classList.contains('a4-page')) {
      page.parentNode?.insertBefore(page, previous);
      this.updatePageNumbers();
      page.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  movePageDown(pageId: string) {
    const page = document.getElementById(pageId);
    const next = page?.nextElementSibling;
    if (page && next && next.classList.contains('a4-page')) {
      page.parentNode?.insertBefore(next, page);
      this.updatePageNumbers();
      page.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  duplicatePage(pageId: string): string | null {
    const original = document.getElementById(pageId);
    if (!original) return null;
    const clone = original.cloneNode(true) as HTMLElement;
    const newId = `page-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    clone.id = newId;
    clone.setAttribute('data-page-id', newId);
    clone.classList.remove('page-active');
    clone.querySelectorAll('.margin-guide').forEach((g) => g.remove());
    original.parentNode?.insertBefore(clone, original.nextSibling);
    this.wirePageToolbar(clone);

    // Los elementos flotantes pierden sus controladores al clonarse.
    clone.querySelectorAll<HTMLElement>('.floating-box').forEach((fb) => {
      fb.classList.remove('box-selected');
      fb.removeAttribute('data-initialized');
      this.initFloatingBox(fb);
    });
    this.updatePageNumbers();
    return newId;
  }

  private updatePageNumbers() {
    const pages = this.pagesWrapper.querySelectorAll('.a4-page');
    pages.forEach((page, index) => {
      page.querySelectorAll('.page-number-display').forEach((span) => {
        span.textContent = `Página ${index + 1} de ${pages.length}`;
      });
    });
    this.listeners.onPageCountChange?.(pages.length);
  }

  getPageCount(): number {
    return this.pagesWrapper.querySelectorAll('.a4-page').length;
  }

  getPageOrientation(pageId: string): PageOrientation {
    const el = document.getElementById(pageId);
    return el?.dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
  }

  setPageOrientation(pageId: string, orientation: PageOrientation) {
    const page = document.getElementById(pageId);
    if (!page) return;
    page.classList.remove(...Object.values(ORIENTATION_SIZE_CLASSES).flatMap((c) => c.split(' ')));
    page.classList.add(...ORIENTATION_SIZE_CLASSES[orientation].split(' '));
    page.dataset.orientation = orientation;
    // Reacomodamos las imágenes existentes al nuevo tamaño de hoja.
    requestAnimationFrame(() => this.arrangeImagesOn(page, 'grid'));
    this.commitNow();
  }

  togglePageOrientation(pageId: string) {
    const current = this.getPageOrientation(pageId);
    this.setPageOrientation(pageId, current === 'portrait' ? 'landscape' : 'portrait');
  }


  // ===================== API PARA EL ORGANIZADOR DE PÁGINAS =====================

  getPageIds(): string[] {
    return Array.from(this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page')).map((p) => p.id);
  }

  /** Reordena las hojas del documento según la lista de ids. */
  reorderPages(ids: string[]) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && this.pagesWrapper.contains(el)) this.pagesWrapper.appendChild(el);
    });
    this.updatePageNumbers();
  }

  /** Elimina varias hojas a la vez (siempre queda al menos una). */
  deletePages(ids: string[]) {
    const all = this.getPageIds();
    const toDelete = ids.length >= all.length ? ids.filter((id) => id !== all.find((a) => ids.includes(a))) : ids;
    toDelete.forEach((id) => document.getElementById(id)?.remove());
    this.updatePageNumbers();
    this.getActivePage();
  }

  /** Duplica varias hojas (cada copia queda justo después de su original). */
  duplicatePages(ids: string[]) {
    ids.forEach((id) => this.duplicatePage(id));
  }

  scrollToPage(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    this.setActivePage(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Miniatura escalada (solo lectura) de una hoja, para el organizador. */
  buildPageThumbnail(id: string, width = 170): HTMLElement | null {
    const page = document.getElementById(id);
    if (!page) return null;
    const clone = page.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    clone.querySelectorAll('[data-page-toolbar], .margin-guide').forEach((e) => e.remove());
    clone.querySelectorAll('[contenteditable]').forEach((e) => e.setAttribute('contenteditable', 'false'));
    clone.querySelectorAll('.box-selected').forEach((e) => e.classList.remove('box-selected'));
    clone.classList.remove('page-active');
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';

    const pw = page.offsetWidth;
    const ph = page.offsetHeight;
    const scale = width / pw;
    clone.style.width = `${pw}px`;
    clone.style.height = `${ph}px`;

    const frame = document.createElement('div');
    frame.style.cssText = `width:${width}px;height:${Math.round(ph * scale)}px;position:relative;overflow:hidden;background:#fff;`;
    const inner = document.createElement('div');
    inner.style.cssText = `width:${pw}px;height:${ph}px;transform:scale(${scale});transform-origin:top left;pointer-events:none;`;
    inner.appendChild(clone);
    frame.appendChild(inner);
    return frame;
  }

  // ===================== IMPORTACIÓN MULTI-FORMATO =====================

  async handleFileSelect(files: File[], imageMode: ImagesPerPageMode): Promise<void> {
    if (files.length === 0) return;

    this.busy = true;
    this.listeners.onLoadingChange?.({
      show: true,
      title: 'Procesando Archivos',
      status: 'Extrayendo e integrando archivos al lienzo...',
    });

    const imageFiles: File[] = [];
    const otherFiles: File[] = [];
    files.forEach((file) => {
      const ext = fileExtension(file.name);
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) imageFiles.push(file);
      else otherFiles.push(file);
    });

    for (const file of otherFiles) {
      const ext = fileExtension(file.name);
      try {
        if (ext === 'pdf') {
          await processPDFFile(file, (pageHTML, orientation) => this.addNewPage(pageHTML, true, { orientation }));
        } else if (ext === 'docx') {
          this.addNewPage(await processDocxFile(file));
        }
      } catch (error) {
        console.error(`Error al procesar archivo ${file.name}:`, error);
        this.listeners.onError?.(`Error al procesar el archivo: ${file.name}`);
      }
    }

    if (imageFiles.length > 0) {
      try {
        const dataUrls = await Promise.all(imageFiles.map(readFileAsDataURL));

        if (imageMode === 'current') {
          // En la hoja donde está el usuario, acomodadas automáticamente.
          const page = this.getActivePage();
          if (page) {
            const area = this.getPageArea(page);
            for (const src of dataUrls) {
              await this.addImageToPage(page, src, area.w * 0.5, area.h * 0.5);
            }
            this.arrangeImagesOn(page, 'flex');
          }
        } else if (imageMode === '1') {
          // Una hoja nueva por imagen: si la imagen es horizontal y se
          // aproxima a la proporción de una A4 apaisada, la hoja se crea
          // horizontal para aprovecharla a página completa.
          for (const src of dataUrls) {
            const orientation = await this.guessImageOrientation(src);
            const page = this.addNewPage('', false, { orientation, scroll: false });
            const area = this.getPageArea(page);
            await this.addImageToPage(page, src, area.w, area.h);
          }
          this.pagesWrapper.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        } else {
          const perPage = 2;
          for (let i = 0; i < dataUrls.length; i += perPage) {
            const page = this.addNewPage('', false, { scroll: false });
            const area = this.getPageArea(page);
            const group = dataUrls.slice(i, i + perPage);
            for (const src of group) await this.addImageToPage(page, src, area.w * 0.5, area.h * 0.5);
            this.arrangeImagesOn(page, 'flex');
          }
          this.pagesWrapper.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        }
        this.pagesWrapper.querySelectorAll('.floating-box.box-selected').forEach((b) => b.classList.remove('box-selected'));
      } catch (error) {
        console.error('Error al procesar imágenes:', error);
        this.listeners.onError?.('Ocurrió un error al procesar una o más imágenes.');
      }
    }

    this.busy = false;
    this.commitNow();
    this.listeners.onLoadingChange?.({ show: false, title: '', status: '' });
  }

  // ===================== ÁREA DE LA HOJA Y ACOMODO DE IMÁGENES =====================

  /** Área útil de la hoja (dentro de márgenes; evita título/pie si tienen texto). */
  private getPageArea(page: HTMLElement): PageArea {
    const cs = getComputedStyle(page);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const W = page.clientWidth;
    const H = page.clientHeight;
    const header = page.querySelector<HTMLElement>(':scope > .page-header');
    const footer = page.querySelector<HTMLElement>(':scope > .page-footer');
    // El título y el pie de página SIEMPRE reservan su espacio (tengan texto
    // o no), para que ninguna imagen quede detrás ni al soltarla ni al
    // escribir el título después.
    const headerCs = header ? getComputedStyle(header) : null;
    const footerCs = footer ? getComputedStyle(footer) : null;
    const y = header ? header.offsetTop + header.offsetHeight + (parseFloat(headerCs!.marginBottom) || 0) : pt;
    const bottom = footer ? footer.offsetTop - (parseFloat(footerCs!.marginTop) || 0) : H - pb;
    return { x: pl, y, w: Math.max(W - pl - pr, 80), h: Math.max(bottom - y, 80) };
  }

  /**
   * Acomoda las imágenes de la hoja activa. Si `perPage` > 0 y hay más
   * imágenes que ese número, las sobrantes pasan a hojas nuevas (creadas
   * justo después) con el mismo orden.
   */
  arrangeImages(layout: ArrangeLayoutId, perPage = 0) {
    const page = this.getActivePage();
    if (!page) return;
    this.busy = true;
    const boxes = Array.from(page.querySelectorAll<HTMLElement>(IMAGE_SELECTOR));
    const n = perPage > 0 ? Math.floor(perPage) : boxes.length;
    if (n > 0 && n < boxes.length) {
      let ref = page;
      for (let start = n; start < boxes.length; start += n) {
        const np = this.addNewPage('', false, { after: ref, scroll: false, activate: false });
        boxes.slice(start, start + n).forEach((b) => {
          const cap = this.getLinkedCaption(b);
          np.appendChild(b);
          if (cap) np.appendChild(cap);
        });
        this.arrangeImagesOn(np, layout);
        ref = np;
      }
    }
    this.arrangeImagesOn(page, layout);
    this.busy = false;
    this.commitNow();
  }

  private arrangeImagesOn(page: HTMLElement, layout: ArrangeLayoutId) {
    const boxes = Array.from(page.querySelectorAll<HTMLElement>(IMAGE_SELECTOR));
    if (boxes.length === 0) return;
    const area = this.getPageArea(page);
    const items = boxes.map((b) => ({
      ar: parseFloat(b.dataset.ar || '') || b.offsetWidth / Math.max(b.offsetHeight, 1) || 1,
      capH: b.dataset.linkedCaptionId ? this.capSpaceOf(b) : 0,
    }));
    const rects = computeLayout(layout, items, area);
    boxes.forEach((b, i) => {
      const r = rects[i];
      b.style.left = `${Math.round(r.x)}px`;
      b.style.top = `${Math.round(r.y)}px`;
      b.style.width = `${Math.round(r.w)}px`;
      b.style.height = `${Math.round(r.h)}px`;
      b.style.transform = '';
      b.dataset.rotation = '0';
      this.syncLinkedCaption(b);
    });
  }

  // ===================== ELEMENTOS FLOTANTES (viven sobre TODA la hoja) =====================

  private nextFloatingOffset(): number {
    this.floatingBoxCounter++;
    return (this.floatingBoxCounter % 6) * 22;
  }

  /** Horizontal si su proporción ancho/alto se aproxima a una A4 apaisada. */
  private async guessImageOrientation(src: string): Promise<PageOrientation> {
    const { w, h } = await loadImageNaturalSize(src);
    const ar = w / Math.max(h, 1);
    return ar >= LANDSCAPE_AR_MIN && ar <= LANDSCAPE_AR_MAX ? 'landscape' : 'portrait';
  }

  /** Agrega una imagen (y su pie de foto) a una hoja, ajustada sin deformar. */
  private async addImageToPage(
    page: HTMLElement,
    src: string,
    maxW: number,
    maxH: number,
    offset = 0
  ): Promise<HTMLElement> {
    const nat = await loadImageNaturalSize(src);
    const area = this.getPageArea(page);
    const availH = Math.max(maxH - CAPTION_SPACE, 60);
    const scale = Math.min(maxW / nat.w, availH / nat.h, 1);
    const width = Math.max(30, Math.round(nat.w * scale));
    const height = Math.max(30, Math.round(nat.h * scale));
    const left = Math.round(area.x + (area.w - width) / 2 + offset);
    const top = Math.round(area.y + (area.h - height - CAPTION_SPACE) / 2 + offset);

    const box = this.insertFloatingImageAt(page, src, left, top, width, height, nat.w / nat.h);
    this.insertFloatingCaptionAt(page, left, top + height + 8, width, box.dataset.fbId ?? null);
    return box;
  }

  /** Inserta una imagen suelta en la hoja donde está el usuario. */
  async insertFloatingImage(src: string): Promise<void> {
    const page = this.getActivePage();
    if (!page) return;
    const area = this.getPageArea(page);
    const box = await this.addImageToPage(page, src, Math.min(area.w * 0.6, 480), Math.min(area.h * 0.5, 480), this.nextFloatingOffset());
    this.selectFloatingBox(box);
  }

  insertFloatingTextBox(text?: string): void {
    const page = this.getActivePage();
    if (!page) return;
    const area = this.getPageArea(page);
    const off = this.nextFloatingOffset();
    const safe = (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const inner = `<div class="w-full h-full p-2 outline-none text-sm has-placeholder empty:before:content-['Escribe_aquí...'] empty:before:text-slate-400" style="color:#000;font-style:normal;" contenteditable="true">${safe}</div>`;
    page.insertAdjacentHTML(
      'beforeend',
      this.floatingBoxHTML('text', { top: area.y + 40 + off, left: area.x + 30 + off }, inner, 240, 110)
    );
    const box = page.lastElementChild as HTMLElement;
    this.initFloatingBox(box);
    this.selectFloatingBox(box);
    box.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }

  private insertFloatingImageAt(
    page: HTMLElement,
    src: string,
    left: number,
    top: number,
    width: number,
    height: number,
    ar: number
  ): HTMLElement {
    const id = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
    const inner = `<img src="${src}" class="w-full h-full pointer-events-none rounded" style="object-fit:fill;" draggable="false" />`;
    page.insertAdjacentHTML('beforeend', this.floatingBoxHTML('image', { top, left }, inner, width, height, id));
    const box = page.lastElementChild as HTMLElement;
    box.dataset.ar = String(ar);
    this.initFloatingBox(box);
    this.selectFloatingBox(box);
    return box;
  }

  private insertFloatingCaptionAt(
    page: HTMLElement,
    left: number,
    top: number,
    width: number,
    linkedImageId: string | null = null
  ): HTMLElement {
    const id = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
    const inner = `<div class="w-full h-full px-2 py-1 outline-none text-sm text-center has-placeholder empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400" style="color:#000;font-style:normal;" contenteditable="true" data-placeholder="Pie de foto (opcional)"></div>`;
    page.insertAdjacentHTML('beforeend', this.floatingBoxHTML('caption', { top, left }, inner, width, 36, id));
    const box = page.lastElementChild as HTMLElement;
    if (linkedImageId) {
      box.dataset.captionFor = linkedImageId;
      const imgBox = page.querySelector<HTMLElement>(`:scope > .floating-box[data-fb-id="${linkedImageId}"]`);
      if (imgBox) imgBox.dataset.linkedCaptionId = id;
    }
    this.initFloatingBox(box);
    return box;
  }

  /** Pie de foto vinculado a una imagen (si existe). */
  private getLinkedCaption(imageBox: HTMLElement): HTMLElement | null {
    const capId = imageBox.dataset.linkedCaptionId;
    if (!capId) return null;
    return imageBox.parentElement?.querySelector<HTMLElement>(`:scope > .floating-box[data-fb-id="${capId}"]`) ?? null;
  }

  private capGapOf(img: HTMLElement): number {
    const g = parseFloat(img.dataset.capGap ?? '');
    return Number.isFinite(g) ? g : 8;
  }

  /** Espacio que ocupa el pie (alto + separación) debajo de la imagen. */
  private capSpaceOf(img: HTMLElement): number {
    const cap = this.getLinkedCaption(img);
    return (cap?.offsetHeight ?? 36) + Math.max(this.capGapOf(img), 0);
  }

  private capSpaceExtra(box: HTMLElement): number {
    return box.dataset.type === 'image' && box.dataset.linkedCaptionId ? this.capSpaceOf(box) : 0;
  }

  /** El pie sigue a su imagen manteniendo la separación/desplazamiento elegidos. */
  private syncLinkedCaption(imageBox: HTMLElement) {
    const caption = this.getLinkedCaption(imageBox);
    if (!caption) return;
    const dx = parseFloat(imageBox.dataset.capDx || '0') || 0;
    const cw = parseFloat(imageBox.dataset.capW || '0') || 0;
    caption.style.left = `${imageBox.offsetLeft + dx}px`;
    caption.style.top = `${imageBox.offsetTop + imageBox.offsetHeight + this.capGapOf(imageBox)}px`;
    caption.style.width = `${cw > 0 ? cw : imageBox.offsetWidth}px`;
  }

  /** Si el usuario movió/redimensionó el pie a mano, recordamos su posición relativa a la imagen. */
  private learnCaptionOffset(caption: HTMLElement) {
    const forId = caption.dataset.captionFor;
    if (!forId) return;
    const img = caption.parentElement?.querySelector<HTMLElement>(`:scope > .floating-box[data-fb-id="${forId}"]`);
    if (!img) return;
    img.dataset.capDx = String(Math.round(caption.offsetLeft - img.offsetLeft));
    img.dataset.capGap = String(Math.round(caption.offsetTop - (img.offsetTop + img.offsetHeight)));
    img.dataset.capW = Math.abs(caption.offsetWidth - img.offsetWidth) < 2 ? '0' : String(caption.offsetWidth);
  }

  private floatingBoxHTML(
    type: FloatingBoxType,
    pos: { top: number; left: number },
    innerHTML: string,
    width: number,
    height: number,
    fbId = ''
  ): string {
    const labels: Record<FloatingBoxType, string> = { image: 'Imagen', text: 'Texto', caption: 'Pie de foto' };
    const corners = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    const handlesHTML = corners
      .map((c) => `<div class="floating-box-ctrl ctrl-${c} print:hidden" data-dir="${c}"></div>`)
      .join('');
    return `
      <div class="floating-box absolute rounded-md z-10" data-type="${type}" data-fb-id="${fbId}" data-rotation="0" contenteditable="false" style="top:${pos.top}px; left:${pos.left}px; width:${width}px; height:${height}px;">
        <div class="floating-box-handle absolute -top-7 left-0 flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-md px-1.5 py-0.5 cursor-move z-20 print:hidden">
          <span class="text-[10px] text-slate-300">${labels[type]}</span>
          <button type="button" class="floating-box-duplicate text-[10px] text-white bg-slate-600 hover:bg-slate-500 px-1 rounded ml-1" title="Duplicar">&#10697;</button>
          <button type="button" class="floating-box-remove text-[10px] text-white bg-rose-600 hover:bg-rose-500 px-1 rounded" title="Eliminar">&#10005;</button>
        </div>
        <div class="floating-box-content w-full h-full overflow-hidden">${innerHTML}</div>
        ${handlesHTML}
        <div class="floating-box-rotate print:hidden" title="Girar">&#10227;</div>
      </div>
    `;
  }

  private selectFloatingBox(box: HTMLElement) {
    this.setActivePage(box.closest<HTMLElement>('.a4-page'));
    this.pagesWrapper.querySelectorAll('.floating-box.box-selected').forEach((b) => {
      if (b !== box) b.classList.remove('box-selected');
    });
    box.classList.add('box-selected');
    this.showElementToolbarFor(box, 'box');
  }

  private getSelectedBox(): HTMLElement | null {
    return this.pagesWrapper.querySelector<HTMLElement>('.floating-box.box-selected');
  }

  private removeFloatingBox(box: HTMLElement) {
    const page = box.parentElement;
    const capId = box.dataset.linkedCaptionId;
    const forId = box.dataset.captionFor;
    if (capId) page?.querySelector(`:scope > .floating-box[data-fb-id="${capId}"]`)?.remove();
    if (forId) {
      const img = page?.querySelector<HTMLElement>(`:scope > .floating-box[data-fb-id="${forId}"]`);
      if (img) delete img.dataset.linkedCaptionId;
    }
    box.remove();
    if (this.etTarget && !document.body.contains(this.etTarget)) this.hideElementToolbar();
  }

  private duplicateBox(original: HTMLElement) {
    const page = original.parentElement;
    if (!page) return;
    const clone = original.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-initialized');
    clone.removeAttribute('data-linked-caption-id');
    clone.removeAttribute('data-caption-for');
    clone.classList.remove('box-selected');
    clone.style.left = `${Math.min(original.offsetLeft + 20, Math.max(0, page.clientWidth - original.offsetWidth))}px`;
    clone.style.top = `${Math.min(original.offsetTop + 20, Math.max(0, page.clientHeight - original.offsetHeight))}px`;
    clone.dataset.fbId = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
    page.appendChild(clone);
    this.initFloatingBox(clone);
    this.selectFloatingBox(clone);
  }

  // ---------- Guía de márgenes (solo visible mientras se arrastra/redimensiona) ----------

  private showMarginGuide(page: HTMLElement): HTMLElement {
    let g = page.querySelector<HTMLElement>(':scope > .margin-guide');
    if (!g) {
      g = document.createElement('div');
      g.className = 'margin-guide';
      page.appendChild(g);
    }
    const cs = getComputedStyle(page);
    g.style.top = cs.paddingTop;
    g.style.left = cs.paddingLeft;
    g.style.right = cs.paddingRight;
    g.style.bottom = cs.paddingBottom;
    return g;
  }

  private updateMarginGuide(page: HTMLElement, guide: HTMLElement, box: HTMLElement) {
    const cs = getComputedStyle(page);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const extra = this.capSpaceExtra(box);
    const out =
      box.offsetLeft < pl - 1 ||
      box.offsetTop < pt - 1 ||
      box.offsetLeft + box.offsetWidth > page.clientWidth - pr + 1 ||
      box.offsetTop + box.offsetHeight + extra > page.clientHeight - pb + 1;
    guide.classList.toggle('guide-out', out);
  }

  private hideMarginGuide(page: HTMLElement) {
    page.querySelectorAll(':scope > .margin-guide').forEach((g) => g.remove());
  }

  // ---------- Mover / redimensionar / girar ----------

  private startBoxMove(box: HTMLElement, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.selectFloatingBox(box);
    const page = box.parentElement as HTMLElement;
    const guide = this.showMarginGuide(page);
    this.busy = true;
    const capExtra = this.capSpaceExtra(box);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = box.offsetLeft;
    const startTop = box.offsetTop;

    const onMove = (ev: PointerEvent) => {
      // Libre por TODA la hoja (no solo dentro de los márgenes).
      const newLeft = Math.max(0, Math.min(startLeft + (ev.clientX - startX) / this.zoom, page.clientWidth - box.offsetWidth));
      const newTop = Math.max(0, Math.min(startTop + (ev.clientY - startY) / this.zoom, page.clientHeight - box.offsetHeight - capExtra));
      box.style.left = `${newLeft}px`;
      box.style.top = `${newTop}px`;
      this.syncLinkedCaption(box);
      this.updateMarginGuide(page, guide, box);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.hideMarginGuide(page);
      this.finishBoxInteraction(box);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private startBoxResize(box: HTMLElement, dir: string, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.selectFloatingBox(box);
    const page = box.parentElement as HTMLElement;
    const guide = this.showMarginGuide(page);
    this.busy = true;
    const capExtra = this.capSpaceExtra(box);
    const pageW = page.clientWidth;
    const pageH = page.clientHeight - capExtra;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = box.offsetWidth;
    const startHeight = box.offsetHeight;
    const startLeft = box.offsetLeft;
    const startTop = box.offsetTop;
    const isCorner = dir.length === 2;
    const MIN = 30;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / this.zoom;
      const dy = (ev.clientY - startY) / this.zoom;
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      if (isCorner) {
        // Esquinas: escala proporcional; la esquina opuesta queda fija.
        const growRight = dir.includes('e');
        const growBottom = dir.includes('s');
        let scale = (growRight ? startWidth + dx : startWidth - dx) / startWidth;
        const maxW = growRight ? pageW - startLeft : startLeft + startWidth;
        const maxH = growBottom ? pageH - startTop : startTop + startHeight;
        scale = Math.min(scale, maxW / startWidth, maxH / startHeight);
        scale = Math.max(scale, MIN / startWidth, MIN / startHeight);
        newWidth = startWidth * scale;
        newHeight = startHeight * scale;
        newLeft = growRight ? startLeft : startLeft + (startWidth - newWidth);
        newTop = growBottom ? startTop : startTop + (startHeight - newHeight);
      } else if (dir === 'e') {
        newWidth = Math.min(Math.max(MIN, startWidth + dx), pageW - startLeft);
      } else if (dir === 'w') {
        newWidth = Math.min(Math.max(MIN, startWidth - dx), startLeft + startWidth);
        newLeft = startLeft + (startWidth - newWidth);
      } else if (dir === 's') {
        newHeight = Math.min(Math.max(MIN, startHeight + dy), pageH - startTop);
      } else if (dir === 'n') {
        newHeight = Math.min(Math.max(MIN, startHeight - dy), startTop + startHeight);
        newTop = startTop + (startHeight - newHeight);
      }

      box.style.width = `${newWidth}px`;
      box.style.height = `${newHeight}px`;
      box.style.left = `${newLeft}px`;
      box.style.top = `${newTop}px`;
      this.syncLinkedCaption(box);
      this.updateMarginGuide(page, guide, box);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.hideMarginGuide(page);
      this.finishBoxInteraction(box);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private startBoxRotate(box: HTMLElement, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.selectFloatingBox(box);
    this.busy = true;
    const rect = box.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const onMove = (ev: PointerEvent) => {
      const angle = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      box.style.transform = `rotate(${angle}deg)`;
      box.dataset.rotation = String(angle);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.finishBoxInteraction(box);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private finishBoxInteraction(box: HTMLElement) {
    this.busy = false;
    if (box.dataset.captionFor) this.learnCaptionOffset(box);
    this.commitNow();
  }

  private initFloatingBox(box: HTMLElement) {
    if (!box || box.dataset.initialized === 'true') return;
    box.dataset.initialized = 'true';

    box.addEventListener('pointerdown', () => this.selectFloatingBox(box));

    box.querySelector<HTMLElement>('.floating-box-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeFloatingBox(box);
    });
    box.querySelector<HTMLElement>('.floating-box-duplicate')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.duplicateBox(box);
    });

    box.querySelector<HTMLElement>('.floating-box-handle')?.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.startBoxMove(box, e as PointerEvent);
    });

    // Las imágenes también se arrastran desde la propia imagen. Los textos no:
    // ahí un clic debe colocar el cursor para escribir.
    if (box.dataset.type === 'image') {
      box.querySelector<HTMLElement>('.floating-box-content')?.addEventListener('pointerdown', (e) =>
        this.startBoxMove(box, e as PointerEvent)
      );
    }

    box.querySelectorAll<HTMLElement>('.floating-box-ctrl').forEach((ctrl) => {
      ctrl.addEventListener('pointerdown', (e) => this.startBoxResize(box, ctrl.dataset.dir as string, e as PointerEvent));
    });
    box.querySelector<HTMLElement>('.floating-box-rotate')?.addEventListener('pointerdown', (e) =>
      this.startBoxRotate(box, e as PointerEvent)
    );
  }

  // ===================== BARRA SUPERIOR (contexto de la selección) =====================

  private showElementToolbarFor(el: HTMLElement, kind: ToolbarTargetKind) {
    this.etTarget = el;
    this.etTargetKind = kind;
    this.publishToolbarState();
  }

  private hideElementToolbar() {
    if (!this.etTarget && !this.etTargetKind) return;
    this.etTarget = null;
    this.etTargetKind = null;
    this.listeners.onToolbarStateChange?.(null);
  }

  private toHex(color: string): string {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return color.startsWith('#') ? color : '';
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return '';
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  }

  /** Imagen a la que pertenece la selección (la propia imagen o el pie de una imagen). */
  private getEtImage(): HTMLElement | null {
    const t = this.etTarget;
    if (!t || this.etTargetKind !== 'box') return null;
    if (t.dataset.type === 'image') return t;
    const forId = t.dataset.captionFor;
    if (!forId) return null;
    return t.parentElement?.querySelector<HTMLElement>(`:scope > .floating-box[data-fb-id="${forId}"]`) ?? null;
  }

  private publishToolbarState() {
    if (!this.etTarget) {
      this.listeners.onToolbarStateChange?.(null);
      return;
    }
    const isBox = this.etTargetKind === 'box';
    const boxType = isBox ? ((this.etTarget.dataset.type as FloatingBoxType) ?? null) : null;
    const editable = this.getEtEditable();
    const img = this.getEtImage();
    const state: ToolbarState = {
      kind: this.etTargetKind,
      isBox,
      boxType,
      fontFamily: editable?.style.fontFamily || this.currentFont,
      fontSize: editable?.style.fontSize?.replace('px', '') || '16',
      fill: isBox && boxType !== 'image' ? this.toHex(this.etTarget.style.backgroundColor) : '',
      captionGap: img && img.dataset.linkedCaptionId ? this.capGapOf(img) : null,
    };
    this.listeners.onToolbarStateChange?.(state);
  }

  private getEtEditable(): HTMLElement | null {
    if (!this.etTarget) return null;
    if (this.etTargetKind === 'box') {
      return this.etTarget.querySelector<HTMLElement>('[contenteditable="true"]') ?? this.etTarget;
    }
    return this.etTarget;
  }

  etFormat(cmd: string, val: string | null = null) {
    const editable = this.getEtEditable();
    if (!editable) return;
    editable.focus();
    if (cmd === 'foreColor') this.restoreSavedSelection();
    document.execCommand(cmd, false, val ?? undefined);
  }

  etApplyFont(value: string) {
    const editable = this.getEtEditable();
    if (!editable) return;
    editable.style.fontFamily = value;
    this.listeners.onFontUsed?.(value);
  }

  etApplyFontSize(value: string) {
    const editable = this.getEtEditable();
    if (editable) editable.style.fontSize = `${value}px`;
  }

  etDuplicate() {
    if (this.etTargetKind === 'box' && this.etTarget) this.duplicateBox(this.etTarget);
  }

  etLayer(direction: 'front' | 'back') {
    if (this.etTargetKind !== 'box' || !this.etTarget) return;
    const parent = this.etTarget.parentElement;
    if (!parent) return;
    if (direction === 'front') parent.appendChild(this.etTarget);
    else parent.insertBefore(this.etTarget, parent.firstChild);
  }

  etDelete() {
    if (this.etTargetKind !== 'box' || !this.etTarget) return;
    this.removeFloatingBox(this.etTarget);
    this.hideElementToolbar();
  }

  /** Pinta la casilla de un cuadro de texto / pie de foto (null = sin relleno). */
  etSetFill(color: string | null) {
    const t = this.etTarget;
    if (!t || this.etTargetKind !== 'box' || t.dataset.type === 'image') return;
    t.style.backgroundColor = color ?? '';
    this.publishToolbarState();
  }

  /** Separación (px) entre la imagen y su pie de foto. */
  setCaptionGap(px: number) {
    const img = this.getEtImage();
    if (!img || !img.dataset.linkedCaptionId) return;
    img.dataset.capGap = String(Math.round(px));
    this.syncLinkedCaption(img);
    this.publishToolbarState();
  }

  /** Cuántas imágenes con pie de foto hay en la hoja activa o en todo el documento. */
  countLinkedCaptions(scope: 'page' | 'document'): number {
    return this.getCaptionedImages(scope).length;
  }

  private getCaptionedImages(scope: 'page' | 'document'): HTMLElement[] {
    const root = scope === 'page' ? this.getActivePage() : this.pagesWrapper;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>('.floating-box[data-type="image"][data-linked-caption-id]')
    );
  }

  /** Aplica la misma separación de pie de foto a todas las imágenes del alcance elegido. */
  applyCaptionGapToAll(px: number, scope: 'page' | 'document'): number {
    const imgs = this.getCaptionedImages(scope);
    this.busy = true;
    imgs.forEach((img) => {
      img.dataset.capGap = String(Math.round(px));
      this.syncLinkedCaption(img);
      // Si el pie se sale por abajo de la hoja, subimos la imagen lo necesario.
      const cap = this.getLinkedCaption(img);
      const page = img.parentElement;
      if (cap && page) {
        const overflow = cap.offsetTop + cap.offsetHeight - page.clientHeight;
        if (overflow > 0) {
          img.style.top = `${Math.max(0, img.offsetTop - overflow)}px`;
          this.syncLinkedCaption(img);
        }
      }
    });
    this.busy = false;
    this.commitNow(); // un solo paso en el historial: se deshace de una vez
    this.publishToolbarState();
    return imgs.length;
  }

  /** Devuelve el pie a su posición automática (centrado bajo la imagen). */
  resetCaptionPlacement() {
    const img = this.getEtImage();
    if (!img) return;
    img.dataset.capGap = '8';
    img.dataset.capDx = '0';
    img.dataset.capW = '0';
    this.syncLinkedCaption(img);
    this.publishToolbarState();
  }

  // ===================== HISTORIAL (deshacer / rehacer) =====================

  private serializeState(): string {
    const clone = this.pagesWrapper.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.margin-guide').forEach((e) => e.remove());
    clone.querySelectorAll('.box-selected').forEach((e) => e.classList.remove('box-selected'));
    clone.querySelectorAll('.page-active').forEach((e) => e.classList.remove('page-active'));
    clone.querySelectorAll('[data-initialized]').forEach((e) => e.removeAttribute('data-initialized'));
    // Las imágenes (base64) se guardan una sola vez y se referencian, para no duplicar memoria.
    return clone.innerHTML.replace(/src="(data:[^"]+)"/g, (_m, d: string) => {
      let id = this.imgIds.get(d);
      if (id === undefined) {
        id = this.imgStore.length;
        this.imgStore.push(d);
        this.imgIds.set(d, id);
      }
      return `src="@@img${id}@@"`;
    });
  }

  private emitHistory() {
    this.listeners.onHistoryChange?.({
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    });
  }

  private scheduleCommit() {
    if (this.restoring || this.busy) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commitNow(), 400);
  }

  private commitNow() {
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    if (this.restoring) return;
    const snap = this.serializeState();
    if (snap === this.history[this.historyIndex]) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > 60) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.emitHistory();
  }

  private restoreState(snap: string) {
    this.restoring = true;
    this.pagesWrapper.innerHTML = snap.replace(/src="@@img(\d+)@@"/g, (_m, i: string) => `src="${this.imgStore[Number(i)]}"`);
    this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page').forEach((p) => {
      this.wirePageToolbar(p);
      p.querySelectorAll<HTMLElement>('.floating-box').forEach((fb) => this.initFloatingBox(fb));
    });
    this.activePage = null;
    this.etTarget = null;
    this.etTargetKind = null;
    this.listeners.onToolbarStateChange?.(null);
    this.getActivePage();
    this.updatePageNumbers();
    this.scheduleImageInfo();
    window.setTimeout(() => {
      this.restoring = false;
    }, 50);
  }

  undo() {
    if (this.commitTimer) this.commitNow();
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.restoreState(this.history[this.historyIndex]);
    this.emitHistory();
  }

  redo() {
    if (this.commitTimer) this.commitNow();
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.restoreState(this.history[this.historyIndex]);
    this.emitHistory();
  }

  // ===================== COPIAR / CORTAR / PEGAR =====================

  private hasTextSelection(): boolean {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.toString().length > 0;
  }

  private cleanBoxHTML(box: HTMLElement): string {
    const c = box.cloneNode(true) as HTMLElement;
    c.classList.remove('box-selected');
    c.removeAttribute('data-initialized');
    c.removeAttribute('data-linked-caption-id');
    c.removeAttribute('data-caption-for');
    return c.outerHTML;
  }

  /** Copia (o corta) la imagen / cuadro seleccionado; si no hay, copia el texto marcado. */
  copySelection(cut = false) {
    const box = this.getSelectedBox() ?? (this.etTargetKind === 'box' ? this.etTarget : null);
    if (!box) {
      document.execCommand(cut ? 'cut' : 'copy');
      return;
    }
    const cap = box.dataset.type === 'image' ? this.getLinkedCaption(box) : null;
    this.clipboardBox = {
      html: this.cleanBoxHTML(box),
      captionHtml: cap ? this.cleanBoxHTML(cap) : null,
      left: box.offsetLeft,
      top: box.offsetTop,
    };
    this.pasteStep = 0;
    // Marca en el portapapeles del sistema, para saber si después se copió algo externo.
    this.markerWritten = false;
    navigator.clipboard
      ?.writeText(CLIPBOARD_MARKER)
      .then(() => {
        this.markerWritten = true;
      })
      .catch(() => {});
    if (cut) this.removeFloatingBox(box);
  }

  private pasteBox(): boolean {
    const clip = this.clipboardBox;
    const page = this.getActivePage();
    if (!clip || !page) return false;
    this.pasteStep++;
    const off = 24 * this.pasteStep;
    const place = (html: string) => {
      page.insertAdjacentHTML('beforeend', html);
      return page.lastElementChild as HTMLElement;
    };
    const box = place(clip.html);
    const newId = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
    box.dataset.fbId = newId;
    const extra = clip.captionHtml ? this.capSpaceOf(box) : 0;
    box.style.left = `${Math.max(0, Math.min(clip.left + off, page.clientWidth - box.offsetWidth))}px`;
    box.style.top = `${Math.max(0, Math.min(clip.top + off, page.clientHeight - box.offsetHeight - extra))}px`;
    this.initFloatingBox(box);
    if (clip.captionHtml) {
      const cap = place(clip.captionHtml);
      const capId = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
      cap.dataset.fbId = capId;
      cap.dataset.captionFor = newId;
      box.dataset.linkedCaptionId = capId;
      this.initFloatingBox(cap);
      this.syncLinkedCaption(box);
    }
    this.selectFloatingBox(box);
    this.commitNow();
    return true;
  }

  /** Pegar desde un botón (usa el portapapeles del navegador cuando lo permite). */
  async pasteClipboard() {
    if (this.pasteBox()) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          const file = new File([blob], `pegado.${type.split('/')[1]}`, { type });
          await this.insertFloatingImage(await readFileAsDataURL(file));
          return;
        }
      }
    } catch {
      /* sin permiso o sin imagen: probamos con texto */
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable) document.execCommand('insertText', false, text);
      else this.insertFloatingTextBox(text);
    } catch {
      this.listeners.onError?.('El navegador bloqueó el portapapeles. Usa Ctrl+V para pegar.');
    }
  }

  private handleNativeCopy() {
    // Se copió/cortó texto de forma nativa: el portapapeles interno queda obsoleto.
    this.clipboardBox = null;
  }

  private handlePaste(e: ClipboardEvent) {
    const t = e.target as HTMLElement;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (this.clipboardBox && (text === CLIPBOARD_MARKER || !this.markerWritten)) {
      e.preventDefault();
      this.pasteBox();
      return;
    }
    this.clipboardBox = null;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 1) {
      e.preventDefault();
      readFileAsDataURL(files[0]).then((src) => this.insertFloatingImage(src));
    } else if (files.length > 1) {
      e.preventDefault();
      void this.handleFileSelect(files, 'current');
    } else if (!t?.isContentEditable && text.trim() && text !== CLIPBOARD_MARKER) {
      e.preventDefault();
      this.insertFloatingTextBox(text);
    }
  }

  // ===================== ZOOM =====================

  setZoom(percent: number) {
    const z = Math.min(3, Math.max(0.25, percent / 100));
    this.zoom = z;
    this.pagesWrapper.style.transformOrigin = 'top left';
    this.pagesWrapper.style.transform = z === 1 ? '' : `scale(${z})`;
    this.syncZoomShell();
    this.listeners.onZoomChange?.(Math.round(z * 100));
  }

  private syncZoomShell() {
    if (!this.zoomShell) return;
    this.zoomShell.style.width = `${this.pagesWrapper.offsetWidth * this.zoom}px`;
    this.zoomShell.style.height = `${this.pagesWrapper.offsetHeight * this.zoom}px`;
  }

  private handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    this.setZoom(this.zoom * 100 + (e.deltaY < 0 ? 5 : -5));
  }

  // ===================== EXPORTACIÓN A PDF =====================

  async exportToPDF(): Promise<void> {
    this.listeners.onLoadingChange?.({
      show: true,
      title: 'Exportando PDF de Alta Resolución',
      status: 'Renderizando páginas e imágenes...',
    });

    this.pagesWrapper.querySelectorAll('.floating-box.box-selected').forEach((b) => b.classList.remove('box-selected'));
    const activePage = this.activePage;
    activePage?.classList.remove('page-active');
    const chromeEls = this.pagesWrapper.querySelectorAll<HTMLElement>(
      '[data-page-toolbar], .floating-box-handle, .floating-box-ctrl, .floating-box-rotate, .margin-guide'
    );
    const prevVisibility: string[] = [];
    chromeEls.forEach((el, i) => {
      prevVisibility[i] = el.style.visibility;
      el.style.visibility = 'hidden';
    });
    document.body.classList.add('exporting');
    const prevTransform = this.pagesWrapper.style.transform;
    this.pagesWrapper.style.transform = '';
    this.busy = true;

    try {
      const pages = this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page');
      const orientationOf = (page: HTMLElement): PageOrientation =>
        page.dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
      const firstOrientation = pages[0] ? orientationOf(pages[0]) : 'portrait';
      const pdf = new jsPDF(firstOrientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const orientation = orientationOf(page);
        const { w, h } = PAGE_MM[orientation];
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: page.scrollWidth,
        });
        if (i > 0) pdf.addPage('a4', orientation === 'landscape' ? 'l' : 'p');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h);
      }
      pdf.save(`Documento_Ensamblado_${Date.now()}.pdf`);
    } catch (error) {
      console.error('Error al exportar a PDF:', error);
      this.listeners.onError?.('Ocurrió un error al generar el archivo PDF.');
    } finally {
      chromeEls.forEach((el, i) => {
        el.style.visibility = prevVisibility[i] || '';
      });
      activePage?.classList.add('page-active');
      document.body.classList.remove('exporting');
      this.pagesWrapper.style.transform = prevTransform;
      this.busy = false;
      this.listeners.onLoadingChange?.({ show: false, title: '', status: '' });
    }
  }
}
