// Declaraciones mínimas locales para paquetes sin tipos resolubles por TS
// en esta configuración. Solo cubren lo que el motor del editor usa.

declare module 'mammoth' {
  export interface MammothImage {
    contentType: string;
    read(encoding: 'base64'): Promise<string>;
  }

  export interface MammothConvertResult {
    value: string;
    messages: unknown[];
  }

  export interface MammothOptions {
    convertImage?: unknown;
    styleMap?: string[];
    includeDefaultStyleMap?: boolean;
    includeEmbeddedStyleMap?: boolean;
  }

  export const images: {
    imgElement: (
      handler: (image: MammothImage) => Promise<{ src: string }>
    ) => unknown;
  };

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: MammothOptions
  ): Promise<MammothConvertResult>;
}

declare module 'html2canvas' {
  export interface Html2CanvasOptions {
    scale?: number;
    useCORS?: boolean;
    logging?: boolean;
    windowWidth?: number;
    [key: string]: unknown;
  }

  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;
}
