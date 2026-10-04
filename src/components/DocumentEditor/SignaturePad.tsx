import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, Trash2, Pipette, PenLine, PenTool, Feather } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}
type PenStyle = 'actual' | 'quill' | 'quill-soft';

interface Stroke {
  points: Point[];
  color: string;
  width: number;
  tolerance: number;
  style: PenStyle;
}

interface SignaturePadProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}

// Lienzo más grande y más ancho que la versión original: más espacio para firmar.
const CANVAS_W = 760;
const CANVAS_H = 320;
const NIB_ANGLE = Math.PI / 4; // 45° — ángulo fijo del "plumín"
const RECENT_COLORS_KEY = 'signature_recent_colors';
const MAX_RECENT_COLORS = 8;

const PRESET_COLORS = [
  { value: '#1D4ED8', label: 'Azul' },
  { value: '#DC2626', label: 'Rojo' },
  { value: '#000000', label: 'Negro' },
  { value: '#48D1CC', label: 'Turquesa medio' },
  { value: '#14B8A6', label: 'Esmeralda azulado' },
];

const PEN_STYLES: Array<{ value: PenStyle; label: string; icon: React.FC<{ className?: string }> }> = [
  { value: 'actual', label: 'Normal', icon: PenLine },
  { value: 'quill', label: 'Clásica', icon: PenTool },
  { value: 'quill-soft', label: 'Suave', icon: Feather },
];

// Relaja cada punto hacia el promedio de sus vecinos, proporcional a la
// tolerancia (0 = conserva el trazo tal cual, con sus picos y ángulos
// filosos; 1 = trazo muy relajado y redondeado).
const smoothPoints = (points: Point[], tolerance: number): Point[] => {
  if (tolerance <= 0 || points.length < 3) return points;
  const passes = tolerance > 0.6 ? 2 : 1;
  let result = points;
  for (let p = 0; p < passes; p++) {
    const next: Point[] = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      const avgX = (result[i - 1].x + result[i].x + result[i + 1].x) / 3;
      const avgY = (result[i - 1].y + result[i].y + result[i + 1].y) / 3;
      next.push({
        x: result[i].x + (avgX - result[i].x) * tolerance,
        y: result[i].y + (avgY - result[i].y) * tolerance,
      });
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
};

// Grosor de un segmento según el estilo de pluma. 'actual' no varía.
// 'quill' y 'quill-soft' simulan un plumín de caligrafía: el trazo se
// engrosa cuando va en la diagonal del plumín y se afina en la
// perpendicular — el efecto clásico de pluma antigua.
const widthForSegment = (p1: Point, p2: Point, baseWidth: number, style: PenStyle): number => {
  if (style === 'actual') return baseWidth;
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const factor = Math.abs(Math.cos(angle - NIB_ANGLE));
  if (style === 'quill') return baseWidth * (0.22 + 0.78 * factor);
  return baseWidth * (0.55 + 0.45 * factor); // quill-soft: menos contraste, más tolerante
};

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  const smoothed = smoothPoints(stroke.points, stroke.tolerance);
  if (smoothed.length < 2) return;

  ctx.strokeStyle = stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.style === 'actual') {
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) ctx.lineTo(smoothed[i].x, smoothed[i].y);
    ctx.stroke();
    return;
  }

  // Estilo pluma: cada segmento se dibuja con su propio grosor
  for (let i = 1; i < smoothed.length; i++) {
    ctx.lineWidth = Math.max(1, widthForSegment(smoothed[i - 1], smoothed[i], stroke.width, stroke.style));
    ctx.beginPath();
    ctx.moveTo(smoothed[i - 1].x, smoothed[i - 1].y);
    ctx.lineTo(smoothed[i].x, smoothed[i].y);
    ctx.stroke();
  }
};

const loadRecentColors = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

/**
 * Modal para dibujar una firma a mano (mouse, trackpad o dedo) y agregarla
 * al documento como una imagen flotante con fondo transparente.
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({ isOpen, onClose, onConfirm }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[] | null>(null);
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(6);
  const [curveTolerance, setCurveTolerance] = useState(0.3);
  const [penStyle, setPenStyle] = useState<PenStyle>('actual');
  const [recentColors, setRecentColors] = useState<string[]>(loadRecentColors);
  const isDrawing = useRef(false);

  const redraw = useCallback(
    (liveStroke?: Stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const allStrokes = liveStroke ? [...strokes, liveStroke] : strokes;
      allStrokes.forEach((stroke) => drawStroke(ctx, stroke));
    },
    [strokes]
  );

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Se reinicia cada vez que el modal se vuelve a abrir.
  useEffect(() => {
    if (isOpen) {
      setStrokes([]);
      setCurrentPoints(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    setCurrentPoints([getPoint(e)]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !currentPoints) return;
    const newPoints = [...currentPoints, getPoint(e)];
    setCurrentPoints(newPoints);
    redraw({ points: newPoints, color: penColor, width: penWidth, tolerance: curveTolerance, style: penStyle });
  };

  const registerRecentColor = (color: string) => {
    if (PRESET_COLORS.some((p) => p.value.toLowerCase() === color.toLowerCase())) return;
    setRecentColors((prev) => {
      const withoutDup = prev.filter((c) => c.toLowerCase() !== color.toLowerCase());
      const updated = [color, ...withoutDup].slice(0, MAX_RECENT_COLORS);
      try {
        localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated));
      } catch {
        /* almacenamiento no disponible: no es crítico */
      }
      return updated;
    });
  };

  const finishStroke = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints && currentPoints.length > 1) {
      setStrokes((prev) => [
        ...prev,
        { points: currentPoints, color: penColor, width: penWidth, tolerance: curveTolerance, style: penStyle },
      ]);
      registerRecentColor(penColor);
    }
    setCurrentPoints(null);
  };

  const handleUndo = () => setStrokes((prev) => prev.slice(0, -1));
  const handleClear = () => setStrokes([]);

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    onConfirm(canvas.toDataURL('image/png'));
    setStrokes([]);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-3.5 flex items-center justify-between z-10">
          <h2 className="font-semibold text-lg">Firma</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-ink-soft hover:bg-[#f4f2ee] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Barra compacta: estilo de trazo + deshacer/borrar, todo en una sola fila */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 bg-[#f4f2ee] p-1 rounded-lg">
              {PEN_STYLES.map((s) => {
                const Icon = s.icon;
                const active = penStyle === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => setPenStyle(s.value)}
                    title={s.label}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      active ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleUndo}
                disabled={strokes.length === 0}
                title="Deshacer el último trazo"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line text-ink-soft text-xs hover:border-blue hover:text-ink transition-colors disabled:opacity-40"
              >
                <Undo2 className="w-3.5 h-3.5" /> Deshacer
              </button>
              <button
                onClick={handleClear}
                disabled={strokes.length === 0}
                title="Borrar toda la firma"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line text-ink-soft text-xs hover:border-danger hover:text-danger transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Borrar
              </button>
            </div>
          </div>

          {/* Lienzo: más grande, con una línea guía decorativa (no forma parte de la imagen exportada) */}
          <div
            className="relative border border-line rounded-lg overflow-hidden bg-white touch-none"
            style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          >
            <div className="absolute left-6 right-6 bottom-[22%] border-b border-dashed border-line pointer-events-none" />
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="relative w-full h-full cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerLeave={finishStroke}
            />
          </div>

          {/* Grosor y tolerancia, lado a lado para ahorrar espacio vertical */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink font-medium flex items-center justify-between mb-1.5">
                Grosor <span className="text-ink-soft font-normal">{penWidth}</span>
              </label>
              <input
                type="range"
                min={1}
                max={20}
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                className="w-full accent-blue"
              />
            </div>
            <div>
              <label className="text-xs text-ink font-medium flex items-center justify-between mb-1.5">
                Tolerancia a curvas <span className="text-ink-soft font-normal">{Math.round(curveTolerance * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={curveTolerance}
                onChange={(e) => setCurveTolerance(Number(e.target.value))}
                className="w-full accent-blue"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-ink font-medium block mb-2">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setPenColor(c.value)}
                  title={c.label}
                  className={`w-8 h-8 rounded-full border-2 ${
                    penColor.toLowerCase() === c.value.toLowerCase() ? 'border-blue' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <label
                className="relative w-8 h-8 rounded-full border-2 border-line cursor-pointer flex items-center justify-center text-white overflow-hidden"
                style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
                title="Elegir color personalizado"
              >
                <span className="relative z-10 drop-shadow">
                  <Pipette className="w-3.5 h-3.5" />
                </span>
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>

              {recentColors.length > 0 && (
                <>
                  <span className="w-px h-6 bg-line mx-0.5" />
                  {recentColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setPenColor(c)}
                      className={`w-7 h-7 rounded-full border-2 ${
                        penColor.toLowerCase() === c.toLowerCase() ? 'border-blue' : 'border-line'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={strokes.length === 0}
            className="w-full py-3 rounded-lg bg-blue text-white font-medium hover:bg-blue-dark transition-colors disabled:opacity-40"
          >
            Agregar firma
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
