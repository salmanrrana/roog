/**
 * Shared math and grid drawing for horizontal timelines: the piano roll, the
 * playlist and the channel-rack step grid all map ticks to pixels the same way,
 * so snapping, zoom and the playhead line up everywhere.
 */
import { BAR_TICKS, BEAT_TICKS, STEP_TICKS } from "@/core/timing";
import type { CanvasSize } from "./canvas";
import type { ThemeColor } from "./theme";

export interface TimelineView {
  /** Tick at the left edge of the canvas. */
  readonly scrollTick: number;
  readonly pxPerTick: number;
}

export function tickToX(view: TimelineView, tick: number): number {
  return (tick - view.scrollTick) * view.pxPerTick;
}

export function xToTick(view: TimelineView, x: number): number {
  return view.scrollTick + x / view.pxPerTick;
}

/** Zoom by `factor`, keeping the tick under `anchorX` where it is (Ctrl+wheel). */
export function zoomAt(
  view: TimelineView,
  factor: number,
  anchorX: number,
  limits = { min: 0.02, max: 8 },
): TimelineView {
  const pxPerTick = Math.min(limits.max, Math.max(limits.min, view.pxPerTick * factor));
  const anchorTick = xToTick(view, anchorX);
  return { pxPerTick, scrollTick: Math.max(0, anchorTick - anchorX / pxPerTick) };
}

export const SNAP_TICKS = {
  none: 1,
  half: STEP_TICKS / 2,
  step: STEP_TICKS,
  beat: BEAT_TICKS,
  bar: BAR_TICKS,
} as const satisfies Record<string, number>;

export type Snap = keyof typeof SNAP_TICKS;

/**
 * Snap a tick to the grid. "floor" for placing under the cursor, "round" for
 * moving things by a delta. Hold Alt to bypass snapping (pass "none").
 */
export function snapTick(tick: number, snap: Snap, mode: "floor" | "round" = "floor"): number {
  const grid = SNAP_TICKS[snap];
  return (mode === "floor" ? Math.floor(tick / grid) : Math.round(tick / grid)) * grid;
}

/**
 * Bar shading plus step/beat/bar lines across the whole canvas. Finer lines are
 * skipped when they would be closer than 6px, so any zoom level stays readable.
 */
export function drawTimeGrid(
  ctx: CanvasRenderingContext2D,
  view: TimelineView,
  { width, height }: CanvasSize,
  colors: Readonly<Record<ThemeColor, string>>,
): void {
  const first = Math.floor(view.scrollTick / BAR_TICKS) * BAR_TICKS;
  const last = xToTick(view, width);

  ctx.fillStyle = colors.panel;
  for (let bar = first; bar < last; bar += BAR_TICKS) {
    if ((bar / BAR_TICKS) % 2 === 1) {
      ctx.fillRect(tickToX(view, bar), 0, BAR_TICKS * view.pxPerTick, height);
    }
  }

  const lines: Array<[number, string, number]> = [
    [STEP_TICKS, colors.line, 0.35],
    [BEAT_TICKS, colors.line, 0.8],
    [BAR_TICKS, colors["ink-dim"], 0.6],
  ];
  for (const [grid, color, alpha] of lines) {
    if (grid * view.pxPerTick < 6) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let tick = first; tick < last; tick += grid) {
      ctx.fillRect(Math.round(tickToX(view, tick)), 0, 1, height);
    }
  }
  ctx.globalAlpha = 1;
}
