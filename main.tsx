import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import './engine/theme';
import { captureInstallEvent } from './hooks/useInstall';

captureInstallEvent();

// Tipografías de catálogo: se piden cuando el navegador está libre, para que la pantalla de inicio aparezca al instante.
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&family=Montserrat:wght@400;500;700&family=Open+Sans:wght@400;600&family=Roboto:wght@400;500;700&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Tinos:ital,wght@0,400;0,700;1,400&family=Arimo:ital,wght@0,400;0,700;1,400&family=Bitter:ital,wght@0,400;0,700;1,400&display=swap';
const loadFonts = () => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = FONTS_CSS;
  document.head.appendChild(l);
};
const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
window.addEventListener('load', () => (idle ? idle(loadFonts, { timeout: 2500 }) : setTimeout(loadFonts, 1200)));

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
