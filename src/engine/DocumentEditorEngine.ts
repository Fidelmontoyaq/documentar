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
  ShapeKind,
  ShapeState,
  ToolbarState,
  ToolbarTargetKind,
} from '../types/documentEditor';
import { fileExtension, loadImageNaturalSize, readFileAsDataURL } from './fileUtils';
import { processDocxFile, processPDFFile } from './fileProcessors';
import { CAPTION_SPACE, computeLayout } from './imageLayouts';
import { DEFAULT_FOLIO, folioPosition, folioText, renderFolioBadge, type FolioConfig } from './folio';

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

  // Foliado (numeración de páginas) dibujado sobre cada hoja
  private folioCfg: FolioConfig = { ...DEFAULT_FOLIO };
  private folioToken = 0;
  private folioRaf = 0;
  private folioCache = new Map<string, { url: string; w: number; h: number }>();

  // Móvil: ajuste automático del zoom al ancho y pellizco con dos dedos
  private autoFit = false;
  private pinch: { d0: number; z0: number } | null = null;
  private boundTouchStart = this.handleTouchStart.bind(this);
  private boundTouchMove = this.handleTouchMove.bind(this);
  private boundTouchEnd = this.handleTouchEnd.bind(this);

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
    this.scrollContainer.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    this.scrollContainer.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    this.scrollContainer.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    this.scrollContainer.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });

    this.observer = new MutationObserver(() => {
      this.scheduleImageInfo();
      this.scheduleCommit();
    });
    this.observer.observe(this.pagesWrapper, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'style', 'class', 'data-cap-gap', 'data-cap-dx', 'data-cap-w', 'data-ar', 'data-rotation',
        'data-shape', 'data-fill-on', 'data-fill', 'data-fill-op', 'data-bc', 'data-bw', 'data-sides', 'data-rad', 'data-has-img',
      ],
    });

    // Zoom: el contenedor directo del lienzo se ajusta al tamaño escalado.
    this.zoomShell = this.pagesWrapper.parentElement;
    this.resizeObserver = new ResizeObserver(() => this.syncZoomShell());
    this.resizeObserver.observe(this.pagesWrapper);
    this.syncZoomShell();

    // En pantallas angostas (celular) la hoja se ajusta sola al ancho disponible.
    if (window.matchMedia('(max-width: 900px)').matches) {
      this.autoFit = true;
      this.fitToWidth();
    }

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
    this.scrollContainer.removeEventListener('touchstart', this.boundTouchStart);
    this.scrollContainer.removeEventListener('touchmove', this.boundTouchMove);
    this.scrollContainer.removeEventListener('touchend', this.boundTouchEnd);
    this.scrollContainer.removeEventListener('touchcancel', this.boundTouchEnd);
    cancelAnimationFrame(this.folioRaf);
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
      if (k === 'c' && this.getSelectedBox() && !this.hasTextSelection()) {
        e.preventDefault();
        this.copySelection(false);
      }
      return;
    }
    const selected = this.getSelectedBox();
    if (e.key === 'Escape' && selected && !selected.classList.contains('cropping') && !inField) {
      // Esc: suelta la selección (y sale del cuadro de texto si se estaba escribiendo).
      (document.activeElement as HTMLElement | null)?.blur?.();
      selected.classList.remove('box-selected');
      this.hideElementToolbar();
      return;
    }
    // "C" (sin Ctrl) activa/desactiva el recorte de la imagen seleccionada,
    // igual que un atajo de una sola letra en un editor de diseño.
    if (
      !t?.isContentEditable &&
      !inField &&
      e.key.toLowerCase() === 'c' &&
      selected &&
      (selected.dataset.type === 'image' || (selected.dataset.type === 'frame' && selected.dataset.hasImg))
    ) {
      e.preventDefault();
      this.toggleCropMode();
      return;
    }
    if (e.key === 'Escape' && selected?.classList.contains('cropping')) {
      e.preventDefault();
      this.exitCropMode(selected);
      return;
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (t?.isContentEditable || inField) return;
    if (selected) {
      e.preventDefault();
      this.removeFloatingBox(selected);
      this.commitNow();
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
    if (this.autoFit) this.fitToWidth();
  }

  // ===================== SORTABLE (reordenar hojas arrastrando) =====================

  private initSortable() {
    this.sortableInstance = new Sortable(this.pagesWrapper, {
      // En pantallas táctiles NO se reordena arrastrando la hoja (chocaba con el
      // desplazamiento): para eso está "Organizar" y los botones de la hoja.
      disabled: window.matchMedia('(pointer: coarse)').matches,
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
    opts: {
      after?: HTMLElement | null;
      scroll?: boolean;
      activate?: boolean;
      orientation?: PageOrientation;
      fileGroup?: { id: string; label: string };
    } = {}
  ): HTMLElement {
    this.pageCounter++;
    const pageId = `page-${Date.now()}-${this.pageCounter}`;
    const html = this.buildPageHTML(pageId, contentHTML, isPdfPage, opts.orientation ?? 'portrait');
    if (opts.after) opts.after.insertAdjacentHTML('afterend', html);
    else this.pagesWrapper.insertAdjacentHTML('beforeend', html);
    const newPageEl = document.getElementById(pageId) as HTMLElement;
    if (opts.fileGroup) {
      newPageEl.dataset.fileGroup = opts.fileGroup.id;
      newPageEl.dataset.fileLabel = opts.fileGroup.label;
    }
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
    this.scheduleFolios();
    if (this.autoFit) this.fitToWidth();
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

  /** A qué archivo importado pertenece cada hoja (si viene de uno), para colorear/agrupar en el organizador. */
  getPageGroups(): { id: string; groupId: string | null; label: string | null }[] {
    return this.getPageIds().map((id) => {
      const el = document.getElementById(id);
      return { id, groupId: el?.dataset.fileGroup ?? null, label: el?.dataset.fileLabel ?? null };
    });
  }

  /** Reordena las hojas del documento según la lista de ids. */
  reorderPages(ids: string[]) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && this.pagesWrapper.contains(el)) this.pagesWrapper.appendChild(el);
    });
    this.updatePageNumbers();
    this.commitNow();
  }

  /** Elimina varias hojas a la vez (siempre queda al menos una). Se puede deshacer con Ctrl+Z. */
  deletePages(ids: string[]) {
    const all = this.getPageIds();
    const toDelete = ids.length >= all.length ? ids.filter((id) => id !== all.find((a) => ids.includes(a))) : ids;
    toDelete.forEach((id) => document.getElementById(id)?.remove());
    this.updatePageNumbers();
    this.getActivePage();
    this.commitNow();
  }

  /** Duplica varias hojas (cada copia queda justo después de su original). */
  duplicatePages(ids: string[]) {
    ids.forEach((id) => this.duplicatePage(id));
    this.commitNow();
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

  /** Hoja sin nada escrito, sin imágenes ni elementos: la típica primera hoja intacta. */
  private isPagePristine(page: HTMLElement): boolean {
    if (page.dataset.pdfPage === 'true') return false;
    if (page.querySelector('.floating-box')) return false;
    const header = page.querySelector<HTMLElement>(':scope > .page-header')?.textContent?.trim();
    const footer = page.querySelector<HTMLElement>(':scope > .page-footer')?.textContent?.trim();
    const content = page.querySelector<HTMLElement>(':scope > .page-content');
    if (content && (content.textContent?.trim() || content.querySelector('img, table, ul, ol'))) return false;
    return !header && !footer;
  }

  async handleFileSelect(files: File[], imageMode: ImagesPerPageMode): Promise<void> {
    if (files.length === 0) return;

    // Si el documento es solo la primera hoja sin tocar, al subir archivos esa
    // hoja sobra: los archivos ocupan su lugar. (Si ya se escribió algo, se conserva.)
    const allPages = this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page');
    const pristinePage = allPages.length === 1 && this.isPagePristine(allPages[0]) ? allPages[0] : null;

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
      // Cada archivo (PDF o Word) es su propio "grupo": así el organizador
      // puede pintar de un color distinto las hojas que vinieron de cada uno.
      const fileGroup = { id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: file.name };
      try {
        if (ext === 'pdf') {
          await processPDFFile(file, (pageHTML, orientation) =>
            this.addNewPage(pageHTML, true, { orientation, fileGroup })
          );
        } else if (ext === 'docx') {
          this.addNewPage(await processDocxFile(file), false, { fileGroup });
        }
      } catch (error) {
        console.error(`Error al procesar archivo ${file.name}:`, error);
        this.listeners.onError?.(`Error al procesar el archivo: ${file.name}`);
      }
    }

    // Con la hoja intacta y archivos PDF/Word en la misma carga, las imágenes
    // también van a hojas nuevas (no a la hoja vacía que se va a quitar).
    const mode: ImagesPerPageMode = imageMode === 'current' && pristinePage && otherFiles.length > 0 ? '1' : imageMode;

    if (imageFiles.length > 0) {
      try {
        const dataUrls = await Promise.all(imageFiles.map(readFileAsDataURL));

        if (mode === 'current') {
          // En la hoja donde está el usuario, acomodadas automáticamente.
          const page = this.getActivePage();
          if (page) {
            const area = this.getPageArea(page);
            for (const src of dataUrls) {
              await this.addImageToPage(page, src, area.w * 0.5, area.h * 0.5);
            }
            this.arrangeImagesOn(page, 'flex');
          }
        } else if (mode === '1') {
          // Una hoja nueva por imagen: cada una es su propio archivo, así que
          // cada hoja recibe su propio grupo/color en el organizador. Si la
          // imagen es horizontal y se aproxima a una A4 apaisada, la hoja se
          // crea horizontal para aprovecharla a página completa.
          for (let i = 0; i < dataUrls.length; i++) {
            const src = dataUrls[i];
            const fileGroup = {
              id: `grp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
              label: imageFiles[i]?.name ?? 'Imagen',
            };
            const orientation = await this.guessImageOrientation(src);
            const page = this.addNewPage('', false, { orientation, scroll: false, fileGroup });
            const area = this.getPageArea(page);
            await this.addImageToPage(page, src, area.w, area.h);
          }
          this.pagesWrapper.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        } else {
          // Varias imágenes comparten cada hoja: forman, entre todas, un solo grupo.
          const fileGroup = { id: `grp-${Date.now()}-batch`, label: `${dataUrls.length} imágenes` };
          const perPage = 2;
          for (let i = 0; i < dataUrls.length; i += perPage) {
            const page = this.addNewPage('', false, { scroll: false, fileGroup });
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

    if (pristinePage && this.pagesWrapper.contains(pristinePage) && this.pagesWrapper.querySelectorAll('.a4-page').length > 1 && this.isPagePristine(pristinePage)) {
      pristinePage.remove();
      this.updatePageNumbers();
      this.activePage = null;
      this.setActivePage(this.pagesWrapper.querySelector<HTMLElement>('.a4-page'));
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
    if (page) this.arrangeImagesPaged(page, layout, perPage);
  }

  /** Igual que `arrangeImages`, pero sobre una hoja concreta (no necesariamente la activa). */
  private arrangeImagesPaged(page: HTMLElement, layout: ArrangeLayoutId, perPage = 0) {
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

  /**
   * Agrega varias imágenes a una hoja concreta del documento (como al soltar
   * archivos directamente sobre ella en el organizador). Si pasan de
   * `maxPerPage`, las que sobran se reparten en hojas nuevas justo después.
   */
  async addImagesToPage(pageId: string, files: File[], maxPerPage = 4): Promise<void> {
    const page = document.getElementById(pageId);
    if (!page || !files.length) return;
    this.busy = true;
    this.listeners.onLoadingChange?.({ show: true, title: 'Agregando imágenes', status: 'Colocándolas en la hoja...' });
    try {
      const dataUrls = await Promise.all(files.map(readFileAsDataURL));
      const area = this.getPageArea(page);
      for (const src of dataUrls) {
        await this.addImageToPage(page, src, area.w * 0.5, area.h * 0.5);
      }
    } catch (error) {
      console.error('Error al agregar imágenes a la hoja:', error);
      this.listeners.onError?.('Ocurrió un error al agregar una o más imágenes.');
    } finally {
      this.busy = false;
      this.listeners.onLoadingChange?.({ show: false, title: '', status: '' });
    }
    this.arrangeImagesPaged(page, 'grid', maxPerPage);
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
      const crop = this.captureCrop(b);
      b.style.left = `${Math.round(r.x)}px`;
      b.style.top = `${Math.round(r.y)}px`;
      b.style.width = `${Math.round(r.w)}px`;
      b.style.height = `${Math.round(r.h)}px`;
      b.style.transform = '';
      b.dataset.rotation = '0';
      if (crop) this.rescaleCrop(b, crop);
      this.applyBoxRadius(b);
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

  // ===================== FORMAS Y MARCOS =====================
  //
  // Una forma es un cuadro flotante más (se mueve, redimensiona y gira como una
  // imagen) cuyo cuerpo `.shape-body` se pinta con CSS: relleno + borde por
  // lado + esquinas. Un marco es una forma con un hueco para meter una imagen.

  private shapeBody(box: HTMLElement): HTMLElement | null {
    return box.querySelector<HTMLElement>('.shape-body');
  }

  private hexToRgba(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  private readShape(box: HTMLElement): ShapeState {
    const d = box.dataset;
    const sides = (d.sides ?? '1111').padEnd(4, '1').split('').map((c) => c === '1') as [boolean, boolean, boolean, boolean];
    return {
      kind: (d.shape as ShapeKind) ?? 'rect',
      fillOn: d.fillOn !== '0',
      fill: d.fill || '#60a5fa',
      fillOpacity: d.fillOp !== undefined && d.fillOp !== '' ? Number(d.fillOp) : 1,
      borderColor: d.bc || '#1e293b',
      borderWidth: d.bw !== undefined && d.bw !== '' ? Number(d.bw) : 4,
      sides,
      radiusPct: parseFloat(d.rad || '0') || 0,
      frameFilled: !!d.hasImg,
    };
  }

  /** Pinta la forma o marco según sus propiedades (data-*). */
  private applyShapeStyle(box: HTMLElement) {
    const body = this.shapeBody(box);
    if (!body) return;
    const s = this.readShape(box);
    body.style.boxSizing = 'border-box';
    body.style.background = s.fillOn ? this.hexToRgba(s.fill, s.fillOpacity) : 'transparent';
    body.style.borderStyle = 'solid';
    body.style.borderColor = s.borderColor;
    const w = s.sides.map((on) => (on ? s.borderWidth : 0));
    body.style.borderWidth = `${w[0]}px ${w[1]}px ${w[2]}px ${w[3]}px`;
    const px = Math.round((s.radiusPct / 100) * Math.min(box.clientWidth, box.clientHeight));
    const radius = s.kind === 'ellipse' ? '50%' : `${px}px`;
    body.style.borderRadius = radius;
    box.style.borderRadius = s.kind === 'ellipse' ? '50%' : `${px + 2}px`;
  }

  /** Esquinas redondeadas de las imágenes (y radio de formas/marcos) según data-rad. */
  private applyBoxRadius(box: HTMLElement) {
    const type = box.dataset.type;
    if (type === 'shape' || type === 'frame') {
      this.applyShapeStyle(box);
      return;
    }
    if (type !== 'image') return;
    const pct = parseFloat(box.dataset.rad || '0') || 0;
    const content = box.querySelector<HTMLElement>('.floating-box-content');
    if (!content) return;
    const px = pct > 0 ? Math.round((pct / 100) * Math.min(box.clientWidth, box.clientHeight)) : 0;
    content.style.borderRadius = px ? `${px}px` : '';
    box.style.borderRadius = px ? `${px + 2}px` : '';
  }

  insertShape(kind: ShapeKind, size: { w: number; h: number }, filled: boolean) {
    this.insertShapeLike('shape', kind, size, filled);
  }

  insertFrame(kind: ShapeKind, size: { w: number; h: number }) {
    this.insertShapeLike('frame', kind, size, true);
  }

  private insertShapeLike(type: 'shape' | 'frame', kind: ShapeKind, size: { w: number; h: number }, filled: boolean) {
    const page = this.getActivePage();
    if (!page) return;
    const area = this.getPageArea(page);
    const off = this.nextFloatingOffset();
    const w = Math.min(size.w, area.w);
    const h = Math.min(size.h, area.h);
    const left = Math.round(area.x + (area.w - w) / 2 + off);
    const top = Math.round(area.y + Math.min(60, (area.h - h) / 2) + off);
    const inner =
      type === 'frame'
        ? `<div class="shape-body frame-body"><div class="frame-slot"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg><span>Toca para agregar imagen</span></div></div>`
        : `<div class="shape-body"></div>`;
    const id = `fb-${++this.floatingBoxCounter}-${Date.now()}`;
    page.insertAdjacentHTML('beforeend', this.floatingBoxHTML(type, { top, left }, inner, w, h, id));
    const box = page.lastElementChild as HTMLElement;
    box.dataset.shape = kind;
    box.dataset.rad = kind === 'rounded' ? '16' : '0';
    box.dataset.sides = '1111';
    if (type === 'frame') {
      box.dataset.fillOn = '1';
      box.dataset.fill = '#e2e8f0';
      box.dataset.fillOp = '1';
      box.dataset.bc = '#334155';
      box.dataset.bw = '4';
    } else if (filled) {
      box.dataset.fillOn = '1';
      box.dataset.fill = '#60a5fa';
      box.dataset.fillOp = '1';
      box.dataset.bc = '#1d4ed8';
      box.dataset.bw = '4';
    } else {
      box.dataset.fillOn = '0';
      box.dataset.fill = '#60a5fa';
      box.dataset.fillOp = '1';
      box.dataset.bc = '#0f172a';
      box.dataset.bw = '4';
    }
    this.initFloatingBox(box);
    this.applyShapeStyle(box);
    this.selectFloatingBox(box);
    this.commitNow();
  }

  /** Caja seleccionada en la barra superior (si es un cuadro flotante). */
  private getEtBox(): HTMLElement | null {
    return this.etTargetKind === 'box' ? this.etTarget : this.getSelectedBox();
  }

  /** Cambia propiedades de la forma/marco seleccionado (relleno, borde, esquinas…). */
  setShapeProps(patch: Partial<Pick<ShapeState, 'kind' | 'fillOn' | 'fill' | 'fillOpacity' | 'borderColor' | 'borderWidth' | 'radiusPct'>>) {
    const box = this.getEtBox();
    if (!box || (box.dataset.type !== 'shape' && box.dataset.type !== 'frame')) return;
    if (patch.kind !== undefined) box.dataset.shape = patch.kind;
    if (patch.fillOn !== undefined) box.dataset.fillOn = patch.fillOn ? '1' : '0';
    if (patch.fill !== undefined) box.dataset.fill = patch.fill;
    if (patch.fillOpacity !== undefined) box.dataset.fillOp = String(patch.fillOpacity);
    if (patch.borderColor !== undefined) box.dataset.bc = patch.borderColor;
    if (patch.borderWidth !== undefined) box.dataset.bw = String(Math.max(0, Math.min(60, patch.borderWidth)));
    if (patch.radiusPct !== undefined) box.dataset.rad = String(Math.max(0, Math.min(50, patch.radiusPct)));
    this.applyShapeStyle(box);
    this.publishToolbarState();
  }

  /** Activa/desactiva el borde de un lado: 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
  toggleShapeSide(index: number) {
    const box = this.getEtBox();
    if (!box || (box.dataset.type !== 'shape' && box.dataset.type !== 'frame')) return;
    const sides = this.readShape(box).sides.map((v) => (v ? '1' : '0'));
    sides[index] = sides[index] === '1' ? '0' : '1';
    box.dataset.sides = sides.join('');
    this.applyShapeStyle(box);
    this.publishToolbarState();
  }

  /** Todos los lados a la vez, o solo los que se indiquen (p. ej. [true,false,true,false]). */
  setShapeSides(sides: boolean | [boolean, boolean, boolean, boolean]) {
    const box = this.getEtBox();
    if (!box || (box.dataset.type !== 'shape' && box.dataset.type !== 'frame')) return;
    const arr = typeof sides === 'boolean' ? [sides, sides, sides, sides] : sides;
    box.dataset.sides = arr.map((v) => (v ? '1' : '0')).join('');
    this.applyShapeStyle(box);
    this.publishToolbarState();
  }

  /** Esquinas redondeadas (% del lado menor) de la imagen, forma o marco seleccionado. */
  setRadiusPct(pct: number) {
    const box = this.getEtBox();
    if (!box) return;
    const type = box.dataset.type;
    if (type !== 'image' && type !== 'shape' && type !== 'frame') return;
    box.dataset.rad = String(Math.max(0, Math.min(50, pct)));
    this.applyBoxRadius(box);
    this.publishToolbarState();
  }

  /** Abre el selector de archivos para meter una imagen en el marco seleccionado. */
  pickFrameImage(target?: HTMLElement) {
    const box = target ?? this.getEtBox();
    if (!box || box.dataset.type !== 'frame') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await this.setFrameImage(box, await readFileAsDataURL(file));
    };
    input.click();
  }

  async setFrameImage(box: HTMLElement, src: string) {
    const body = this.shapeBody(box);
    if (!body) return;
    const nat = await loadImageNaturalSize(src);
    body.querySelector('img.frame-img')?.remove();
    const img = document.createElement('img');
    img.className = 'frame-img';
    img.src = src;
    img.draggable = false;
    img.style.pointerEvents = 'none';
    body.appendChild(img);
    box.dataset.hasImg = '1';
    box.dataset.natW = String(nat.w);
    box.dataset.natH = String(nat.h);
    this.fitFrameImage(box, 'cover');
    this.commitNow();
    this.publishToolbarState();
  }

  /** Ajusta la imagen del marco: 'cover' llena el marco (recorta lo que sobra), 'contain' la muestra entera. */
  fitFrameImage(box: HTMLElement, mode: 'cover' | 'contain') {
    const body = this.shapeBody(box);
    const natW = parseFloat(box.dataset.natW || '0');
    const natH = parseFloat(box.dataset.natH || '0');
    if (!body || !natW || !natH) return;
    const vw = body.clientWidth;
    const vh = body.clientHeight;
    const k = mode === 'cover' ? Math.max(vw / natW, vh / natH) : Math.min(vw / natW, vh / natH);
    const cw = natW * k;
    const ch = natH * k;
    box.dataset.cropW = String(cw);
    box.dataset.cropH = String(ch);
    box.dataset.cropX = String((vw - cw) / 2);
    box.dataset.cropY = String((vh - ch) / 2);
    this.applyCropStyle(box);
  }

  /** API de la barra: ajustar la imagen del marco seleccionado. */
  frameFit(mode: 'cover' | 'contain') {
    const box = this.getEtBox();
    if (!box || box.dataset.type !== 'frame' || !box.dataset.hasImg) return;
    this.fitFrameImage(box, mode);
    this.commitNow();
  }

  clearFrameImage() {
    const box = this.getEtBox();
    if (!box || box.dataset.type !== 'frame') return;
    this.shapeBody(box)?.querySelector('img.frame-img')?.remove();
    ['hasImg', 'natW', 'natH', 'cropW', 'cropH', 'cropX', 'cropY'].forEach((k) => delete box.dataset[k]);
    box.classList.remove('cropping');
    this.commitNow();
    this.publishToolbarState();
  }

  /** Al soltar una imagen sobre un marco vacío, la imagen entra en el marco. */
  private maybeAdoptIntoFrame(imageBox: HTMLElement) {
    if (imageBox.dataset.type !== 'image') return;
    const page = imageBox.parentElement;
    const img = imageBox.querySelector<HTMLImageElement>('img');
    if (!page || !img) return;
    const cx = imageBox.offsetLeft + imageBox.offsetWidth / 2;
    const cy = imageBox.offsetTop + imageBox.offsetHeight / 2;
    const frames = Array.from(page.querySelectorAll<HTMLElement>(':scope > .floating-box[data-type="frame"]'));
    const target = frames.find(
      (f) =>
        !f.dataset.hasImg &&
        cx >= f.offsetLeft &&
        cx <= f.offsetLeft + f.offsetWidth &&
        cy >= f.offsetTop &&
        cy <= f.offsetTop + f.offsetHeight
    );
    if (!target) return;
    const src = img.src;
    this.removeFloatingBox(imageBox);
    void this.setFrameImage(target, src).then(() => this.selectFloatingBox(target));
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
    const inner = `<img src="${src}" class="w-full h-full pointer-events-none" style="object-fit:fill;" draggable="false" />`;
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
    const labels: Record<FloatingBoxType, string> = {
      image: 'Imagen',
      text: 'Texto',
      caption: 'Pie de foto',
      shape: 'Forma',
      frame: 'Marco',
    };
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
        <div class="floating-box-content relative w-full h-full overflow-hidden">${innerHTML}</div>
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

  /** Escucha el gesto en curso (ratón, lápiz o dedo) hasta que termina o se cancela. */
  private track(onMove: (ev: PointerEvent) => void, onEnd: () => void) {
    const up = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      onEnd();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  private startBoxMove(box: HTMLElement, e: PointerEvent, onTap?: () => void) {
    e.preventDefault();
    e.stopPropagation();
    // Deja de escribir (si lo hacía) para que Supr borre el elemento y no una letra.
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.selectFloatingBox(box);
    const page = box.parentElement as HTMLElement;
    const guide = this.showMarginGuide(page);
    this.busy = true;
    const capExtra = this.capSpaceExtra(box);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = box.offsetLeft;
    const startTop = box.offsetTop;
    let moved = 0;

    const onMove = (ev: PointerEvent) => {
      moved = Math.max(moved, Math.hypot(ev.clientX - startX, ev.clientY - startY));
      // Libre por TODA la hoja (no solo dentro de los márgenes).
      const newLeft = Math.max(0, Math.min(startLeft + (ev.clientX - startX) / this.zoom, page.clientWidth - box.offsetWidth));
      const newTop = Math.max(0, Math.min(startTop + (ev.clientY - startY) / this.zoom, page.clientHeight - box.offsetHeight - capExtra));
      box.style.left = `${newLeft}px`;
      box.style.top = `${newTop}px`;
      this.syncLinkedCaption(box);
      this.updateMarginGuide(page, guide, box);
    };
    this.track(onMove, () => {
      this.hideMarginGuide(page);
      this.finishBoxInteraction(box);
      if (moved < 4) onTap?.();
      else this.maybeAdoptIntoFrame(box);
    });
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
    const cropping = box.classList.contains('cropping');
    // Las imágenes conservan su proporción en las esquinas (salvo al recortar);
    // el resto de elementos son libres. Mayús invierte la regla.
    const base = box.dataset.type === 'image' && !cropping;
    const proportional = isCorner && (e.shiftKey ? !base : base);
    const startCrop = this.captureCrop(box);
    const MIN = 30;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(hi, lo));

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / this.zoom;
      const dy = (ev.clientY - startY) / this.zoom;
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      if (proportional) {
        // Esquina opuesta fija; escala proporcional.
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
      } else {
        if (dir.includes('e')) newWidth = clamp(startWidth + dx, MIN, pageW - startLeft);
        if (dir.includes('w')) {
          newWidth = clamp(startWidth - dx, MIN, startLeft + startWidth);
          newLeft = startLeft + (startWidth - newWidth);
        }
        if (dir.includes('s')) newHeight = clamp(startHeight + dy, MIN, pageH - startTop);
        if (dir.includes('n')) {
          newHeight = clamp(startHeight - dy, MIN, startTop + startHeight);
          newTop = startTop + (startHeight - newHeight);
        }
      }

      box.style.width = `${newWidth}px`;
      box.style.height = `${newHeight}px`;
      box.style.left = `${newLeft}px`;
      box.style.top = `${newTop}px`;
      this.syncLinkedCaption(box);
      if (startCrop) this.adaptCrop(box, startCrop, newLeft - startLeft, newTop - startTop, cropping);
      this.applyBoxRadius(box);
      this.updateMarginGuide(page, guide, box);
    };
    this.track(onMove, () => {
      this.hideMarginGuide(page);
      this.finishBoxInteraction(box);
    });
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
    this.track(onMove, () => this.finishBoxInteraction(box));
  }

  private finishBoxInteraction(box: HTMLElement) {
    this.busy = false;
    if (box.dataset.captionFor) this.learnCaptionOffset(box);
    this.commitNow();
    this.publishToolbarState();
  }

  // ===================== RECORTE DE IMAGEN (no destructivo, como en Word) =====================
  //
  // La imagen de origen nunca se modifica: dentro del "visor" (el contenido de
  // la caja, o el cuerpo del marco) se posiciona y escala con estilos absolutos
  // (data-crop-x/y/w/h). Mientras se recorta, mover un borde cambia solo el
  // tamaño del visor y la imagen se queda quieta; fuera del recorte, cambiar el
  // tamaño de la caja escala el recorte junto con ella.

  private viewerEl(box: HTMLElement): HTMLElement | null {
    return box.dataset.type === 'frame'
      ? box.querySelector<HTMLElement>('.shape-body')
      : box.querySelector<HTMLElement>('.floating-box-content');
  }

  private cropImg(box: HTMLElement): HTMLImageElement | null {
    return this.viewerEl(box)?.querySelector<HTMLImageElement>('img') ?? null;
  }

  private canCrop(box: HTMLElement): boolean {
    return box.dataset.type === 'image' || (box.dataset.type === 'frame' && !!box.dataset.hasImg);
  }

  private applyCropStyle(box: HTMLElement) {
    const img = this.cropImg(box);
    if (!img) return;
    img.style.position = 'absolute';
    img.style.maxWidth = 'none';
    img.style.left = `${parseFloat(box.dataset.cropX || '0')}px`;
    img.style.top = `${parseFloat(box.dataset.cropY || '0')}px`;
    img.style.width = `${parseFloat(box.dataset.cropW || '0')}px`;
    img.style.height = `${parseFloat(box.dataset.cropH || '0')}px`;
    img.classList.remove('w-full', 'h-full');
  }

  private captureCrop(box: HTMLElement) {
    if (!box.dataset.cropW) return null;
    const el = this.viewerEl(box);
    if (!el) return null;
    return {
      vw: el.clientWidth,
      vh: el.clientHeight,
      cw: parseFloat(box.dataset.cropW || '0'),
      ch: parseFloat(box.dataset.cropH || '0'),
      cx: parseFloat(box.dataset.cropX || '0'),
      cy: parseFloat(box.dataset.cropY || '0'),
    };
  }

  /** Mantiene coherente el recorte cuando cambia el tamaño de la caja. */
  private adaptCrop(
    box: HTMLElement,
    st: { vw: number; vh: number; cw: number; ch: number; cx: number; cy: number },
    dLeft: number,
    dTop: number,
    cropping: boolean
  ) {
    if (cropping) {
      box.dataset.cropX = String(st.cx - dLeft);
      box.dataset.cropY = String(st.cy - dTop);
      this.applyCropStyle(box);
      return;
    }
    this.rescaleCrop(box, st);
  }

  private rescaleCrop(box: HTMLElement, st: { vw: number; vh: number; cw: number; ch: number; cx: number; cy: number }) {
    const el = this.viewerEl(box);
    if (!el || !st.vw || !st.vh) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (box.dataset.type === 'frame') {
      // La imagen del marco nunca se deforma: se reajusta conservando zoom y centro.
      const natW = parseFloat(box.dataset.natW || '0');
      const natH = parseFloat(box.dataset.natH || '0');
      if (!natW || !natH) return;
      const z = st.cw / (natW * Math.max(st.vw / natW, st.vh / natH));
      const k = Math.max(vw / natW, vh / natH) * z;
      const ncw = natW * k;
      const nch = natH * k;
      const rx = (st.cx + st.cw / 2) / st.vw;
      const ry = (st.cy + st.ch / 2) / st.vh;
      box.dataset.cropW = String(ncw);
      box.dataset.cropH = String(nch);
      box.dataset.cropX = String(rx * vw - ncw / 2);
      box.dataset.cropY = String(ry * vh - nch / 2);
    } else {
      const rx = vw / st.vw;
      const ry = vh / st.vh;
      box.dataset.cropW = String(st.cw * rx);
      box.dataset.cropH = String(st.ch * ry);
      box.dataset.cropX = String(st.cx * rx);
      box.dataset.cropY = String(st.cy * ry);
    }
    this.applyCropStyle(box);
  }

  private enterCropMode(box: HTMLElement) {
    if (!this.canCrop(box)) return;
    if (!box.dataset.cropW) {
      const el = this.viewerEl(box);
      // Arranca mostrando exactamente lo que ya se veía (sin recorte).
      box.dataset.cropW = String(el?.clientWidth ?? box.clientWidth);
      box.dataset.cropH = String(el?.clientHeight ?? box.clientHeight);
      box.dataset.cropX = '0';
      box.dataset.cropY = '0';
    }
    box.classList.add('cropping');
    this.applyCropStyle(box);
    this.publishToolbarState();
  }

  private exitCropMode(box: HTMLElement) {
    box.classList.remove('cropping');
    this.commitNow();
    this.publishToolbarState();
  }

  /** Activa o desactiva el modo de recorte de la imagen (o marco con imagen) seleccionada. */
  toggleCropMode() {
    const box = this.getEtBox();
    if (!box || !this.canCrop(box)) return;
    if (box.classList.contains('cropping')) this.exitCropMode(box);
    else this.enterCropMode(box);
  }

  /** Quita el recorte: la imagen vuelve a llenar la caja tal como estaba. */
  resetCrop() {
    const box = this.getEtBox();
    if (!box || !this.canCrop(box)) return;
    box.classList.remove('cropping');
    if (box.dataset.type === 'frame') {
      this.fitFrameImage(box, 'cover');
    } else {
      delete box.dataset.cropW;
      delete box.dataset.cropH;
      delete box.dataset.cropX;
      delete box.dataset.cropY;
      const img = this.cropImg(box);
      if (img) {
        img.style.position = '';
        img.style.left = '';
        img.style.top = '';
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '';
        img.classList.add('w-full', 'h-full');
      }
    }
    this.commitNow();
    this.publishToolbarState();
  }

  private startCropPan(box: HTMLElement, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.selectFloatingBox(box);
    this.busy = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCx = parseFloat(box.dataset.cropX || '0');
    const startCy = parseFloat(box.dataset.cropY || '0');
    const onMove = (ev: PointerEvent) => {
      box.dataset.cropX = String(startCx + (ev.clientX - startX) / this.zoom);
      box.dataset.cropY = String(startCy + (ev.clientY - startY) / this.zoom);
      this.applyCropStyle(box);
    };
    this.track(onMove, () => {
      this.busy = false;
      this.commitNow();
    });
  }

  /** Acerca/aleja el recorte manteniendo su centro fijo. */
  zoomCrop(box: HTMLElement, factor: number) {
    if (!box.dataset.cropW) return;
    const el = this.viewerEl(box);
    const w = parseFloat(box.dataset.cropW || '0');
    const h = parseFloat(box.dataset.cropH || '0');
    const x = parseFloat(box.dataset.cropX || '0');
    const y = parseFloat(box.dataset.cropY || '0');
    const isFrame = box.dataset.type === 'frame';
    // Una imagen suelta no puede quedar más chica que su visor; la de un marco sí (hasta 20 %).
    const minK = isFrame ? 0.2 : 1;
    const minW = (el?.clientWidth ?? 0) * minK;
    const minH = (el?.clientHeight ?? 0) * minK;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const k = Math.max(factor, Math.max(minW / w, minH / h));
    const newW = w * k;
    const newH = h * k;
    box.dataset.cropW = String(newW);
    box.dataset.cropH = String(newH);
    box.dataset.cropX = String(cx - newW / 2);
    box.dataset.cropY = String(cy - newH / 2);
    this.applyCropStyle(box);
  }

  /** Botones de acercar/alejar durante el recorte (útil en celular, sin rueda del mouse). */
  cropZoomStep(direction: 1 | -1) {
    const box = this.getEtBox();
    if (!box || !box.classList.contains('cropping')) return;
    this.zoomCrop(box, direction > 0 ? 1.12 : 1 / 1.12);
    this.commitNow();
  }

  private initFloatingBox(box: HTMLElement) {
    if (!box || box.dataset.initialized === 'true') return;
    box.dataset.initialized = 'true';

    box.addEventListener('pointerdown', () => this.selectFloatingBox(box));

    box.querySelector<HTMLElement>('.floating-box-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeFloatingBox(box);
      this.commitNow();
    });
    box.querySelector<HTMLElement>('.floating-box-duplicate')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.duplicateBox(box);
    });

    box.querySelector<HTMLElement>('.floating-box-handle')?.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.startBoxMove(box, e as PointerEvent);
    });

    // Imágenes, formas y marcos también se arrastran desde su propio cuerpo (si se
    // está recortando, arrastrar mueve la imagen dentro del recorte). Los textos
    // no: ahí un clic debe colocar el cursor para escribir.
    const type = box.dataset.type;
    if (type === 'image' || type === 'shape' || type === 'frame') {
      const content = box.querySelector<HTMLElement>('.floating-box-content');
      content?.addEventListener('pointerdown', (e) => {
        const pe = e as PointerEvent;
        // En pantalla táctil, el primer toque solo selecciona: así se puede seguir
        // desplazando la hoja con el dedo sin arrastrar la imagen sin querer.
        if (pe.pointerType === 'touch' && !box.classList.contains('box-selected')) return;
        if (box.classList.contains('cropping')) this.startCropPan(box, pe);
        else {
          this.startBoxMove(
            box,
            pe,
            type === 'frame' ? () => { if (!box.dataset.hasImg) this.pickFrameImage(box); } : undefined
          );
        }
      });
      content?.addEventListener(
        'wheel',
        (e) => {
          if (!box.classList.contains('cropping')) return;
          e.preventDefault();
          this.zoomCrop(box, e.deltaY < 0 ? 1.06 : 0.94);
        },
        { passive: false }
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
      fill:
        isBox && (boxType === 'text' || boxType === 'caption') ? this.toHex(this.etTarget.style.backgroundColor) : '',
      captionGap: img && img.dataset.linkedCaptionId ? this.capGapOf(img) : null,
      cropping: boxType === 'image' || boxType === 'frame' ? this.etTarget.classList.contains('cropping') : false,
      hasCrop:
        boxType === 'image' ? !!this.etTarget.dataset.cropW : boxType === 'frame' ? !!this.etTarget.dataset.hasImg : false,
      imageRadiusPct: boxType === 'image' ? parseFloat(this.etTarget.dataset.rad || '0') || 0 : null,
      shape: boxType === 'shape' || boxType === 'frame' ? this.readShape(this.etTarget) : null,
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
    if (!t || this.etTargetKind !== 'box' || !(t.dataset.type === 'text' || t.dataset.type === 'caption')) return;
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
    clone.querySelectorAll('.margin-guide, .page-folio').forEach((e) => e.remove());
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

  /** Zoom elegido por la persona (desactiva el ajuste automático al ancho). */
  setZoom(percent: number) {
    this.autoFit = false;
    this.applyZoom(percent / 100);
  }

  private applyZoom(raw: number) {
    const z = Math.min(3, Math.max(0.25, raw));
    if (Math.abs(z - this.zoom) < 0.004) return;
    this.zoom = z;
    this.pagesWrapper.style.transformOrigin = 'top left';
    this.pagesWrapper.style.transform = z === 1 ? '' : `scale(${z})`;
    this.pagesWrapper.style.setProperty('--z', String(z));
    this.syncZoomShell();
    this.listeners.onZoomChange?.(Math.round(z * 100));
  }

  /** Ajusta el zoom para que la hoja más ancha quepa en la pantalla (pensado para celulares). */
  fitToWidth() {
    this.autoFit = true;
    const cs = getComputedStyle(this.scrollContainer);
    const avail = this.scrollContainer.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    let widest = 0;
    this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page').forEach((p) => {
      widest = Math.max(widest, p.offsetWidth);
    });
    if (!widest || avail <= 0) return;
    this.applyZoom(Math.min(1, avail / widest));
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

  // Pellizco con dos dedos para acercar/alejar.
  private touchDistance(e: TouchEvent): number {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) this.pinch = { d0: this.touchDistance(e), z0: this.zoom };
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.pinch || e.touches.length !== 2) return;
    e.preventDefault();
    this.autoFit = false;
    this.applyZoom(this.pinch.z0 * (this.touchDistance(e) / Math.max(this.pinch.d0, 1)));
  }

  private handleTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) this.pinch = null;
  }

  // ===================== FOLIADO (numeración de páginas) =====================

  getFolioConfig(): FolioConfig {
    return this.folioCfg;
  }

  setFolioConfig(cfg: FolioConfig) {
    this.folioCfg = cfg;
    this.scheduleFolios();
  }

  private scheduleFolios() {
    if (this.folioRaf) return;
    this.folioRaf = requestAnimationFrame(() => {
      this.folioRaf = 0;
      void this.renderFolios();
    });
  }

  /** Dibuja (o quita) el folio de cada hoja. Es una capa visual: no entra al historial. */
  private async renderFolios() {
    const token = ++this.folioToken;
    const cfg = this.folioCfg;
    const pages = Array.from(this.pagesWrapper.querySelectorAll<HTMLElement>('.a4-page'));
    if (!cfg.enabled) {
      pages.forEach((p) => p.querySelectorAll(':scope > .page-folio').forEach((el) => el.remove()));
      return;
    }
    const styleKey = JSON.stringify({ ...cfg, enabled: false, order: 0, start: 0, skipFirst: 0, template: '' });
    if (this.folioCache.size > 300) this.folioCache.clear();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const text = folioText(i, pages.length, cfg);
      let img = page.querySelector<HTMLImageElement>(':scope > .page-folio');
      if (!text) {
        img?.remove();
        continue;
      }
      const key = `${styleKey}|${text}`;
      let badge = this.folioCache.get(key);
      if (!badge) {
        const b = await renderFolioBadge(text, cfg, 3);
        badge = { url: b.canvas.toDataURL('image/png'), w: b.w, h: b.h };
        this.folioCache.set(key, badge);
      }
      if (token !== this.folioToken) return; // llegó una configuración más nueva
      if (!img) {
        img = document.createElement('img');
        img.className = 'page-folio';
        img.draggable = false;
        img.alt = '';
        img.setAttribute('contenteditable', 'false');
        page.appendChild(img);
      }
      const pos = folioPosition(cfg, page.clientWidth, page.clientHeight, badge.w, badge.h);
      if (img.src !== badge.url) img.src = badge.url;
      img.style.cssText = `position:absolute;z-index:40;pointer-events:none;user-select:none;left:${Math.round(pos.x)}px;top:${Math.round(pos.y)}px;width:${badge.w}px;height:${badge.h}px;`;
    }
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
