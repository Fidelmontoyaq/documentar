interface LoadingOverlayProps {
  show: boolean;
  title: string;
  status: string;
}

export function LoadingOverlay({ show, title, status }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 print:hidden">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col items-center max-w-sm text-center shadow-2xl">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h3 className="font-bold text-white text-base mb-1">{title || 'Procesando...'}</h3>
        <p className="text-xs text-slate-400">{status}</p>
      </div>
    </div>
  );
}
