// Tamaños de hoja/lienzo: presets de documento y de diseño (redes, logos…),
// conversión de unidades y tamaños propios guardados en el navegador.

export type SizeUnit = 'px' | 'mm' | 'cm';

export interface SizePreset {
  id: string;
  label: string;
  /** Tamaño en píxeles CSS (96 px = 1 pulgada). */
  w: number;
  h: number;
  hint?: string;
}

export interface SizeGroup {
  id: 'doc' | 'slides' | 'design';
  label: string;
  items: SizePreset[];
}

const mm = (v: number) => Math.round((v * 96) / 25.4);
const inch = (v: number) => Math.round(v * 96);

export const SIZE_GROUPS: SizeGroup[] = [
  {
    id: 'doc',
    label: 'Documento',
    items: [
      { id: 'a4', label: 'A4', w: mm(210), h: mm(297), hint: '210×297 mm' },
      { id: 'letter', label: 'Carta', w: inch(8.5), h: inch(11), hint: '8,5×11 in' },
      { id: 'legal', label: 'Oficio', w: inch(8.5), h: inch(13), hint: '8,5×13 in' },
      { id: 'a3', label: 'A3', w: mm(297), h: mm(420), hint: '297×420 mm' },
      { id: 'a5', label: 'A5', w: mm(148), h: mm(210), hint: '148×210 mm' },
    ],
  },
  {
    id: 'slides',
    label: 'Diapositivas',
    items: [
      { id: 'slide-169', label: 'Diapositiva 16:9', w: 1920, h: 1080, hint: '1920×1080 · Full HD' },
      { id: 'slide-169-hd', label: 'Diapositiva 16:9 HD', w: 1280, h: 720, hint: '1280×720' },
      { id: 'slide-43', label: 'Diapositiva 4:3', w: 1024, h: 768, hint: '1024×768' },
      { id: 'slide-43-ppt', label: 'PowerPoint 4:3', w: 960, h: 720, hint: '10×7,5 in' },
      { id: 'slide-1610', label: 'Diapositiva 16:10', w: 1280, h: 800, hint: '1280×800' },
      { id: 'slide-4k', label: 'Diapositiva 4K', w: 3840, h: 2160, hint: '3840×2160' },
    ],
  },
  {
    id: 'design',
    label: 'Redes y diseño',
    items: [
      { id: 'ig-post', label: 'Post Instagram', w: 1080, h: 1080, hint: '1080×1080' },
      { id: 'ig-portrait', label: 'Instagram vertical', w: 1080, h: 1350, hint: '1080×1350' },
      { id: 'story', label: 'Historia / Reel', w: 1080, h: 1920, hint: '1080×1920' },
      { id: 'fb-banner', label: 'Banner Facebook', w: 820, h: 312, hint: '820×312' },
      { id: 'fb-post', label: 'Post Facebook', w: 1200, h: 630, hint: '1200×630' },
      { id: 'yt-cover', label: 'Portada YouTube', w: 2560, h: 1440, hint: '2560×1440' },
      { id: 'yt-thumb', label: 'Miniatura YouTube', w: 1280, h: 720, hint: '1280×720' },
      { id: 'x-header', label: 'Cabecera X', w: 1500, h: 500, hint: '1500×500' },
      { id: 'logo', label: 'Logo cuadrado', w: 500, h: 500, hint: '500×500' },
      { id: 'sticker', label: 'Sticker', w: 512, h: 512, hint: '512×512' },
      { id: 'card', label: 'Tarjeta personal', w: 1050, h: 600, hint: '3,5×2 in a 300 ppp' },
    ],
  },
];

export function toPx(value: number, unit: SizeUnit): number {
  if (unit === 'mm') return mm(value);
  if (unit === 'cm') return mm(value * 10);
  return Math.round(value);
}

export function fromPx(px: number, unit: SizeUnit): number {
  if (unit === 'mm') return Math.round(((px * 25.4) / 96) * 10) / 10;
  if (unit === 'cm') return Math.round(((px * 2.54) / 96) * 100) / 100;
  return Math.round(px);
}

/** Nombre corto del tamaño actual (A4, Carta, 1080×1080…), sin importar si está girado. */
export function sizeLabel(w: number, h: number): string {
  const [a, b] = w <= h ? [w, h] : [h, w];
  for (const g of SIZE_GROUPS) {
    for (const p of g.items) {
      const [pa, pb] = p.w <= p.h ? [p.w, p.h] : [p.h, p.w];
      if (Math.abs(a - pa) <= 2 && Math.abs(b - pb) <= 2) return p.label;
    }
  }
  for (const n of SOCIAL_NETS) {
    for (const p of n.items) {
      const [pa, pb] = p.w <= p.h ? [p.w, p.h] : [p.h, p.w];
      if (Math.abs(a - pa) <= 2 && Math.abs(b - pb) <= 2) return `${n.name} · ${p.label}`;
    }
  }
  return `${Math.round(w)}×${Math.round(h)}`;
}

export interface SavedSize {
  name: string;
  w: number;
  h: number;
}

const KEY = 'docucraft.sizes.v1';

export function loadSavedSizes(): SavedSize[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedSize[]) : [];
    return Array.isArray(list) ? list.filter((s) => s && s.w > 0 && s.h > 0) : [];
  } catch {
    return [];
  }
}

export function storeSavedSizes(list: SavedSize[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* sin almacenamiento */
  }
}

export interface SocialNet {
  id: string;
  name: string;
  color: string;
  items: SizePreset[];
}

/** Redes sociales y los tamaños que pide cada una. */
export const SOCIAL_NETS: SocialNet[] = [
  { id: 'instagram', name: 'Instagram', color: '#c13584', items: [
    { id: 'ig-post', label: 'Publicación', w: 1080, h: 1080, hint: '1080×1080' },
    { id: 'ig-portrait', label: 'Vertical', w: 1080, h: 1350, hint: '1080×1350' },
    { id: 'ig-story', label: 'Historia / Reel', w: 1080, h: 1920, hint: '1080×1920' },
  ] },
  { id: 'facebook', name: 'Facebook', color: '#1877f2', items: [
    { id: 'fb-post', label: 'Publicación', w: 1200, h: 630, hint: '1200×630' },
    { id: 'fb-banner', label: 'Portada', w: 820, h: 312, hint: '820×312' },
    { id: 'fb-story', label: 'Historia', w: 1080, h: 1920, hint: '1080×1920' },
  ] },
  { id: 'whatsapp', name: 'WhatsApp', color: '#25a05a', items: [
    { id: 'wa-status', label: 'Estado', w: 1080, h: 1920, hint: '1080×1920' },
    { id: 'wa-profile', label: 'Foto de perfil', w: 500, h: 500, hint: '500×500' },
  ] },
  { id: 'tiktok', name: 'TikTok', color: '#25262b', items: [
    { id: 'tt-video', label: 'Video / portada', w: 1080, h: 1920, hint: '1080×1920' },
  ] },
  { id: 'youtube', name: 'YouTube', color: '#d93025', items: [
    { id: 'yt-thumb', label: 'Miniatura', w: 1280, h: 720, hint: '1280×720' },
    { id: 'yt-cover', label: 'Banner del canal', w: 2560, h: 1440, hint: '2560×1440' },
  ] },
  { id: 'x', name: 'X (Twitter)', color: '#14171a', items: [
    { id: 'x-post', label: 'Publicación', w: 1600, h: 900, hint: '1600×900' },
    { id: 'x-header', label: 'Cabecera', w: 1500, h: 500, hint: '1500×500' },
  ] },
  { id: 'linkedin', name: 'LinkedIn', color: '#0a66c2', items: [
    { id: 'li-post', label: 'Publicación', w: 1200, h: 627, hint: '1200×627' },
    { id: 'li-banner', label: 'Banner', w: 1584, h: 396, hint: '1584×396' },
  ] },
  { id: 'pinterest', name: 'Pinterest', color: '#c8232c', items: [
    { id: 'pin', label: 'Pin', w: 1000, h: 1500, hint: '1000×1500' },
  ] },
];

export const OTHER_SIZES: SizePreset[] = [
  { id: 'logo', label: 'Logo cuadrado', w: 500, h: 500, hint: '500×500' },
  { id: 'sticker', label: 'Sticker', w: 512, h: 512, hint: '512×512' },
  { id: 'card', label: 'Tarjeta personal', w: 1050, h: 600, hint: '3,5×2 in' },
];
