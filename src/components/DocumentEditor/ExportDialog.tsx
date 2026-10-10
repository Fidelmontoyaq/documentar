import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileDown, Image as ImageIcon, FileType } from 'lucide-react';
import type { ExportOptions, PageInfo } from '../../types/documentEditor';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (opts: ExportOptions) => void;
  pageCount: number;
  info: PageInfo | null;
}

const chip = (on: boolean) =>
  `flex-1 px-2 py-2 rounded-lg text-xs border transition text-center ${on ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`;

/** Exportar: PDF, PNG (con transparencia) o JPG; hoja actual o todas; calidad. */
export function ExportDialog({ open, onClose, onExport, pageCount, info }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportOptions['format']>('pdf');
  const [scope, setScope] = useState<ExportOptions['scope']>('all');
  const [scale, setScale] = useState(1);
  if (!open) return null;

  const isImage = format !== 'pdf';
  const eff = format === 'pdf' ? 2 : scale;
  const outW = info ? Math.round(info.w * eff) : 0;
  const outH = info ? Math.round(info.h * eff) : 0;
  const transparentWarn = info?.bg === 'transparent' && format !== 'png';

  return createPortal(
    <div data-keep-selection className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-4 print:hidden">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 shadow-2xl w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-base">Exportar</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Formato</div>
          <div className="flex gap-1.5">
            <button type="button" className={chip(format === 'pdf')} onClick={() => setFormat('pdf')}><FileType className="w-4 h-4 mx-auto mb-0.5" />PDF</button>
            <button type="button" className={chip(format === 'png')} onClick={() => setFormat('png')}><ImageIcon className="w-4 h-4 mx-auto mb-0.5" />PNG<span className="block text-[9px] opacity-70">con transparencia</span></button>
            <button type="button" className={chip(format === 'jpg')} onClick={() => setFormat('jpg')}><ImageIcon className="w-4 h-4 mx-auto mb-0.5" />JPG<span className="block text-[9px] opacity-70">más liviano</span></button>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Qué exportar</div>
          <div className="flex gap-1.5">
            <button type="button" className={chip(scope === 'page')} onClick={() => setScope('page')}>Solo esta hoja</button>
            <button type="button" className={chip(scope === 'all')} onClick={() => setScope('all')}>
              Todas ({pageCount}){isImage && pageCount > 1 ? ' · ZIP' : ''}
            </button>
          </div>
        </div>

        {isImage && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Calidad</div>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <button key={s} type="button" className={chip(scale === s)} onClick={() => setScale(s)}>
                  {s}×{s === 1 ? <span className="block text-[9px] opacity-70">tamaño exacto</span> : <span className="block text-[9px] opacity-70">{s === 2 ? 'nítida' : 'muy grande'}</span>}
                </button>
              ))}
            </div>
            {info && <p className="text-[11px] text-slate-400 mt-1.5">Cada imagen sale de {outW}×{outH} px{scope === 'all' && pageCount > 1 ? ' (según el tamaño de cada hoja)' : ''}.</p>}
          </div>
        )}

        {transparentWarn && (
          <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            Esta hoja tiene fondo transparente: en {format.toUpperCase()} saldrá con fondo blanco. Elige PNG para conservar la transparencia.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            onExport({ format, scope, scale: format === 'pdf' ? 2 : scale });
            onClose();
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
        >
          <FileDown className="w-4 h-4" /> Exportar {format.toUpperCase()}
        </button>
      </div>
    </div>,
    document.body
  );
}
