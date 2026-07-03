"use client";

import { useEffect, useReducer, useRef, useState } from "react";

/** A point in normalized [0,1] canvas space, so drawings track any resize. */
type Point = { x: number; y: number };

export type TelestrationTool = "pen" | "arrow" | "line" | "circle" | "rect";

/** One committed mark. `points` is a path for pen, or [start, end] otherwise. */
type Shape = {
  id: string;
  tool: TelestrationTool;
  color: string;
  size: number;
  points: Point[];
};

const TOOLS: { key: TelestrationTool; label: string; icon: string }[] = [
  { key: "pen", label: "Pen", icon: "✏️" },
  { key: "arrow", label: "Arrow", icon: "↗" },
  { key: "line", label: "Line", icon: "／" },
  { key: "circle", label: "Circle", icon: "◯" },
  { key: "rect", label: "Rectangle", icon: "▭" },
];

const COLORS: { key: string; value: string }[] = [
  { key: "Red", value: "#ef4444" },
  { key: "Blue", value: "#3b82f6" },
  { key: "Green", value: "#22c55e" },
  { key: "Yellow", value: "#eab308" },
  { key: "White", value: "#ffffff" },
];

const SIZES: { key: string; value: number }[] = [
  { key: "S", value: 2 },
  { key: "M", value: 4 },
  { key: "L", value: 7 },
];

/** Min drag distance (normalized) before a straight-shape mark is kept. */
const MIN_DRAG = 0.005;

let idCounter = 0;
const nextId = () => `t${Date.now()}-${idCounter++}`;

// --- Undo/redo as snapshots of the whole shape list (covers pen, shapes, clear) ---
type HistoryState = { shapes: Shape[]; undo: Shape[][]; redo: Shape[][] };
type HistoryAction =
  | { type: "commit"; shape: Shape }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "commit":
      return { shapes: [...state.shapes, action.shape], undo: [...state.undo, state.shapes], redo: [] };
    case "clear":
      return state.shapes.length
        ? { shapes: [], undo: [...state.undo, state.shapes], redo: [] }
        : state;
    case "undo": {
      if (!state.undo.length) return state;
      const prev = state.undo[state.undo.length - 1];
      return { shapes: prev, undo: state.undo.slice(0, -1), redo: [...state.redo, state.shapes] };
    }
    case "redo": {
      if (!state.redo.length) return state;
      const next = state.redo[state.redo.length - 1];
      return { shapes: next, undo: [...state.undo, state.shapes], redo: state.redo.slice(0, -1) };
    }
    default:
      return state;
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, width: number, height: number) {
  const pts = shape.points.map((p) => ({ x: p.x * width, y: p.y * height }));
  if (!pts.length) return;

  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (shape.tool === "pen") {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    return;
  }

  const [a, b] = [pts[0], pts[pts.length - 1]];

  if (shape.tool === "rect") {
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    return;
  }

  if (shape.tool === "circle") {
    ctx.beginPath();
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    return;
  }

  // line / arrow share the segment
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  if (shape.tool === "arrow") {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(10, shape.size * 3);
    if (Number.isFinite(angle)) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Coach telestration layer: a drawing canvas that overlays the video plus a
 * floating toolbar (pen/arrow/line/circle/rect, five colours, three brush
 * sizes, undo/redo, clear). Marks are stored in normalized coordinates so they
 * stay put while the clip plays, pauses, scrubs, or steps, and stay aligned on
 * resize. When draw mode is off the canvas is click-through, so the joint
 * inspector and native video controls keep working; the marks remain visible.
 * The canvas lives in the overlay DOM stack, so any visual export that captures
 * the player includes the telestration automatically.
 */
export default function TelestrationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const draftRef = useRef<Shape | null>(null);

  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<TelestrationTool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [history, dispatch] = useReducer(historyReducer, { shapes: [], undo: [], redo: [] });

  // Keep the backing store matched to the displayed size so marks stay crisp
  // and aligned as the video resizes (responsive / fullscreen).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => setCanvasSize({ w: canvas.clientWidth, h: canvas.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever the marks, the in-progress draft, or the size change. This
  // is independent of the video clock, so playback never disturbs the drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = canvasSize;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const shape of history.shapes) drawShape(ctx, shape, w, h);
    if (draft) drawShape(ctx, draft, w, h);
  }, [history.shapes, draft, canvasSize]);

  const toNorm = (event: React.PointerEvent): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / (rect.width || 1),
      y: (event.clientY - rect.top) / (rect.height || 1),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!active) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const p = toNorm(event);
    const shape: Shape = { id: nextId(), tool, color, size, points: tool === "pen" ? [p] : [p, p] };
    draftRef.current = shape;
    setDraft(shape);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!active || !drawingRef.current || !draftRef.current) return;
    const p = toNorm(event);
    const current = draftRef.current;
    const next: Shape = {
      ...current,
      points: current.tool === "pen" ? [...current.points, p] : [current.points[0], p],
    };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = () => {
    if (!active || !drawingRef.current) return;
    drawingRef.current = false;
    const shape = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (shape && isKeepable(shape)) dispatch({ type: "commit", shape });
  };

  const toolbarButton = (selected: boolean) =>
    `flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm transition-colors ${
      selected ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
    }`;

  return (
    <div className="pointer-events-none absolute inset-0">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Block the surface's joint hover/select while drawing without touching it.
        onMouseMove={(e) => active && e.stopPropagation()}
        onMouseDown={(e) => active && e.stopPropagation()}
        onClick={(e) => active && e.stopPropagation()}
        className="absolute inset-0 h-full w-full"
        style={{
          pointerEvents: active ? "auto" : "none",
          touchAction: active ? "none" : undefined,
          cursor: active ? "crosshair" : "default",
        }}
      />

      <div className="pointer-events-auto absolute left-2 top-2 flex flex-col gap-2 rounded-lg bg-black/70 p-2 text-white backdrop-blur">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActive((prev) => !prev)}
            aria-pressed={active}
            className={toolbarButton(active)}
          >
            ✏️ Draw
          </button>
          {active && (
            <>
              <button
                type="button"
                onClick={() => dispatch({ type: "undo" })}
                disabled={!history.undo.length}
                aria-label="Undo"
                title="Undo"
                className={`${toolbarButton(false)} disabled:opacity-30`}
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "redo" })}
                disabled={!history.redo.length}
                aria-label="Redo"
                title="Redo"
                className={`${toolbarButton(false)} disabled:opacity-30`}
              >
                ↷
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "clear" })}
                disabled={!history.shapes.length}
                aria-label="Clear all"
                className={`${toolbarButton(false)} disabled:opacity-30`}
              >
                Clear
              </button>
            </>
          )}
        </div>

        {active && (
          <>
            <div className="flex gap-1">
              {TOOLS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTool(key)}
                  aria-pressed={tool === key}
                  aria-label={label}
                  title={label}
                  className={toolbarButton(tool === key)}
                >
                  {icon}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              {COLORS.map(({ key, value }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={key}
                  title={key}
                  className={`h-7 w-7 rounded border-2 ${
                    color === value ? "border-white" : "border-white/20"
                  }`}
                  style={{ backgroundColor: value }}
                />
              ))}
            </div>

            <div className="flex gap-1">
              {SIZES.map(({ key, value }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSize(value)}
                  aria-pressed={size === value}
                  aria-label={`${key} brush`}
                  className={toolbarButton(size === value)}
                >
                  {key}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Discard accidental taps: pen needs a path, shapes need a real drag. */
function isKeepable(shape: Shape): boolean {
  if (shape.tool === "pen") return shape.points.length > 1;
  const [a, b] = [shape.points[0], shape.points[shape.points.length - 1]];
  return Math.hypot(b.x - a.x, b.y - a.y) >= MIN_DRAG;
}
