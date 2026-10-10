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
