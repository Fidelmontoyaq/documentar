import type { SVGProps } from 'react';

/** Ícono de firma: un garabato de rúbrica con su línea de firma debajo. */
export function SignatureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M2.5 15.5c1.6-5.8 3.4-10.5 5-10.5 1.4 0 .6 3.6-.9 7.4-.9 2.3-1.7 3.7-.9 3.7 1.5 0 3-4.6 4.4-4.6 1 0 .2 2.6.9 2.6.9 0 1.7-2.2 2.9-2.2.9 0 .6 1.5 1.5 1.5 1 0 1.6-.9 2.6-1.3" />
      <path d="M3 20.2h18" strokeWidth={1.4} />
    </svg>
  );
}

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Quitar fondo: una figura (persona) recortada con contorno punteado sobre un fondo que se va. */
export function RemoveBgIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" strokeDasharray="2.2 2.4" opacity=".55" />
      <circle cx="12" cy="9.2" r="2.7" />
      <path d="M6.6 19c.5-3.1 2.6-4.9 5.4-4.9s4.9 1.8 5.4 4.9" />
    </svg>
  );
}

/** Sticker: pegatina con una esquina despegada y una estrella. */
export function StickerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 12.5V7a3.5 3.5 0 0 0-3.5-3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h5.5" />
      <path d="M20.5 12.5c-4.2 0-8 3.8-8 8" />
      <path d="m10 7.3.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L7 9.5l2.1-.3z" />
    </svg>
  );
}
