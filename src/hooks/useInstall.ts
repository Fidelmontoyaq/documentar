import { useCallback, useEffect, useState } from 'react';

export interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __bip?: BIPEvent | null;
  }
}

/** Se llama desde main.tsx, ANTES de pintar React: el navegador lanza el aviso de instalación una sola vez y muy pronto. */
export function captureInstallEvent() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__bip = e as BIPEvent;
    window.dispatchEvent(new Event('bip-ready'));
  });
  window.addEventListener('appinstalled', () => {
    window.__bip = null;
    window.dispatchEvent(new Event('bip-installed'));
  });
}

const isStandalone = () =>
  (typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Navegadores dentro de otras apps (WhatsApp, Facebook, Instagram…): no permiten instalar. */
export const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|Messenger|TikTok|; wv\)/i.test(navigator.userAgent);

export type InstallHelpKind = 'ios' | 'android' | 'inapp' | 'desktop';
const helpKind = (): InstallHelpKind => (isInAppBrowser() ? 'inapp' : isIOS() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop');

/**
 * Instalación como app (PWA). Si el navegador ya ofreció el aviso nativo, se usa directamente;
 * si no (iPhone, aviso rechazado antes, navegador dentro de otra app…), se muestran los pasos manuales.
 */
export function useInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(() => window.__bip ?? null);
  const [installed, setInstalled] = useState(isStandalone());
  const [help, setHelp] = useState<InstallHelpKind | null>(null);

  useEffect(() => {
    const ready = () => setEvt(window.__bip ?? null);
    const done = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('bip-ready', ready);
    window.addEventListener('bip-installed', done);
    ready();
    return () => {
      window.removeEventListener('bip-ready', ready);
      window.removeEventListener('bip-installed', done);
    };
  }, []);

  const install = useCallback(async () => {
    if (evt) {
      try {
        await evt.prompt();
        await evt.userChoice.catch(() => undefined);
      } catch { /* ya usado */ }
      window.__bip = null;
      setEvt(null);
    } else {
      setHelp(helpKind());
    }
  }, [evt]);

  return { canInstall: !installed, nativeReady: !!evt, install, installed, help, closeHelp: () => setHelp(null) };
}
