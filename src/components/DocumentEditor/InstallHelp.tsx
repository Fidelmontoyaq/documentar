import type { InstallHelpKind } from '../../hooks/useInstall';

/** Pasos para instalar a mano cuando el navegador no ofrece el aviso automático. */
export function InstallHelp({ kind, onClose }: { kind: InstallHelpKind | null; onClose: () => void }) {
  if (!kind) return null;
  const steps: Record<InstallHelpKind, { title: string; items: string[]; note?: string }> = {
    ios: {
      title: 'Instalar en iPhone / iPad',
      items: ['Abre esta página en <b>Safari</b>.', 'Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).', 'Elige <b>«Añadir a pantalla de inicio»</b> y confirma.'],
      note: 'Apple no permite un botón automático de instalación.',
    },
    android: {
      title: 'Instalar en Android',
      items: ['Abre esta página en <b>Chrome</b> (o Edge / Samsung Internet).', 'Toca el menú <b>⋮</b> (tres puntos) arriba a la derecha y <b>desactiva «Sitio para computadoras»</b> si está marcado (con eso activo, Chrome solo crea un acceso directo y no instala la app).', 'Elige <b>«Instalar app»</b> (no «Añadir a pantalla de inicio»).'],
      note: 'Si ya la instalaste antes, aparecerá «Abrir app» en el menú: ábrela desde el ícono de Documentar. Si solo ves un acceso directo, bórralo y repite estos pasos.',
    },
    inapp: {
      title: 'Ábrela en tu navegador',
      items: ['Estás dentro de otra app (WhatsApp, Facebook, Instagram…), que no permite instalar.', 'Toca el menú <b>⋮</b> o <b>Compartir</b> y elige <b>«Abrir en el navegador»</b> (Chrome o Safari).', 'Ahí vuelve a tocar «Instalar».'],
    },
    desktop: {
      title: 'Instalar en el computador',
      items: ['Usa <b>Chrome o Edge</b>.', 'En la barra de direcciones toca el icono de <b>instalar</b> (monitor con una flecha) o el menú <b>⋮ → Guardar y compartir → Instalar</b>.'],
    },
  };
  const c = steps[kind];
  return (
    <div data-keep-selection className="fixed inset-0 z-[85] bg-slate-950/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-2">{c.title}</h3>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal pl-5">
          {c.items.map((t) => <li key={t} dangerouslySetInnerHTML={{ __html: t }} />)}
        </ol>
        {c.note && <p className="text-xs text-slate-500 mt-3">{c.note}</p>}
        <button type="button" onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium">Entendido</button>
      </div>
    </div>
  );
}
