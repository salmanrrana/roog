/**
 * Canvas painters for the piano roll. Plain functions of (ctx, size, data) so the
 * components only wire data in. Everything off screen is skipped, so the cost
 * tracks what is visible, not how many notes the pattern holds.
 */
import type { Note } from "@/core/schema";
import { BAR_TICKS, BEAT_TICKS } from "@/core/timing";
import type { CanvasSize } from "@/ui/canvas";
import { CANVAS_FONT, themeColors } from "@/ui/theme";
import { drawTimeGrid, tickToX, xToTick } from "@/ui/timeline";
import { type RollView, type Rect, TOP_PITCH, isBlackKey, pitchName, pitchToY } from "./geometry";

const SHADE = "rgba(0, 0, 0, 0.32)";

function visiblePitches(view: RollView, height: number): readonly [number, number] {
  const top = TOP_PITCH - Math.floor(view.scrollY / view.rowHeight);
  const bottom = TOP_PITCH - Math.floor((view.scrollY + height) / view.rowHeight);
  return [Math.max(0, bottom), Math.min(TOP_PITCH, top)];
}

export interface GridScene {
  readonly view: RollView;
  readonly notes: readonly Note[];
  readonly color: string;
  readonly selected: ReadonlySet<string>;
  /** Other channels' notes in the same pattern, drawn as outlines for reference. Empty when hidden. */
  readonly ghosts: ReadonlyArray<readonly Note[]>;
  /** Pattern loop length in ticks; the area past it is dimmed. */
  readonly loopEnd: number;
}

/** Rows, time grid, dashed pattern end, ghost outlines and the channel's notes (selected ones outlined in ink). */
export function drawGrid(ctx: CanvasRenderingContext2D, size: CanvasSize, scene: GridScene): void {
  const { width, height } = size;
  const { view } = scene;
  const colors = themeColors();
  ctx.fillStyle = colors.well;
  ctx.fillRect(0, 0, width, height);
  drawTimeGrid(ctx, view, size, colors);

  const [low, high] = visiblePitches(view, height);
  for (let pitch = low; pitch <= high; pitch += 1) {
    const y = pitchToY(view, pitch);
    if (isBlackKey(pitch)) {
      ctx.fillStyle = SHADE;
      ctx.fillRect(0, y, width, view.rowHeight);
    }
    ctx.fillStyle = colors.line;
    ctx.globalAlpha = pitch % 12 === 0 ? 1 : 0.3;
    ctx.fillRect(0, Math.round(y + view.rowHeight) - 1, width, 1);
    ctx.globalAlpha = 1;
  }

  const endX = tickToX(view, scene.loopEnd);
  if (endX < width) {
    ctx.fillStyle = SHADE;
    ctx.fillRect(Math.max(0, endX), 0, width, height);
    drawEndLine(ctx, endX, height, colors["ink-mute"]);
  }

  const fromTick = view.scrollTick;
  const toTick = xToTick(view, width);
  const visible = (note: Note) =>
    note.tick < toTick &&
    note.tick + note.length > fromTick &&
    note.pitch >= low &&
    note.pitch <= high;

  ctx.strokeStyle = colors["ink-mute"];
  ctx.lineWidth = 1;
  for (const ghost of scene.ghosts) {
    for (const note of ghost) {
      if (!visible(note)) continue;
      const x = Math.round(tickToX(view, note.tick));
      const w = Math.max(3, Math.round(note.length * view.pxPerTick) - 1);
      ctx.strokeRect(
        x + 0.5,
        Math.round(pitchToY(view, note.pitch)) + 1.5,
        w - 1,
        view.rowHeight - 4,
      );
    }
  }

  const labels = view.rowHeight >= 11;
  ctx.font = CANVAS_FONT.tiny;
  ctx.textBaseline = "middle";
  for (const note of scene.notes) {
    if (!visible(note)) continue;
    const x = Math.round(tickToX(view, note.tick));
    const y = Math.round(pitchToY(view, note.pitch));
    const w = Math.max(3, Math.round(note.length * view.pxPerTick) - 1);
    const h = view.rowHeight - 1;
    const selected = scene.selected.has(note.id);
    // Quiet notes fade but never vanish.
    ctx.globalAlpha = 0.45 + 0.55 * note.velocity;
    ctx.fillStyle = scene.color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = SHADE;
    ctx.fillRect(x, y + h - 2, w, 2);
    if (w > 12) ctx.fillRect(x + w - 3, y + 2, 2, h - 4);
    if (selected) {
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = colors.well;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    if (labels && w > 28) {
      ctx.fillStyle = colors.well;
      ctx.fillText(pitchName(note.pitch), x + 4, y + h / 2);
    }
  }
}

/** The 1px dashed end-of-pattern line. */
function drawEndLine(ctx: CanvasRenderingContext2D, endX: number, height: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(Math.round(endX) + 0.5, 0);
  ctx.lineTo(Math.round(endX) + 0.5, height);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Playhead line (only passed while playing) and marquee rectangle, on the transparent overlay. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  { height }: CanvasSize,
  view: RollView,
  playheadTick: number | null,
  marquee: Rect | null,
): void {
  const colors = themeColors();
  if (playheadTick !== null) {
    ctx.fillStyle = colors.hot;
    ctx.fillRect(Math.round(tickToX(view, playheadTick)) - 1, 0, 2, height);
  }
  if (marquee) {
    const x = Math.min(marquee.x0, marquee.x1);
    const y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = colors.ink;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.ink;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}

/** The keyboard column: white/black keys, C labels, and the held key lit in the channel color. */
export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  { width, height }: CanvasSize,
  view: RollView,
  held: number | null,
  color: string,
): void {
  const colors = themeColors();
  const [low, high] = visiblePitches(view, height);
  ctx.font = CANVAS_FONT.label;
  ctx.textBaseline = "middle";
  for (let pitch = low; pitch <= high; pitch += 1) {
    const y = pitchToY(view, pitch);
    const black = isBlackKey(pitch);
    ctx.fillStyle = pitch === held ? color : black ? colors.well : colors.ink;
    ctx.fillRect(0, y, black ? width * 0.62 : width, view.rowHeight);
    if (black && pitch !== held) {
      ctx.fillStyle = colors.ink;
      ctx.fillRect(width * 0.62, y, width * 0.38, view.rowHeight);
    }
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, Math.round(y + view.rowHeight) - 1, width, pitch % 12 === 0 ? 2 : 1);
    if (pitch % 12 === 0 && view.rowHeight >= 9) {
      ctx.fillStyle = colors.well;
      ctx.fillText(pitchName(pitch), width - 28, y + view.rowHeight / 2);
    }
  }
  ctx.fillStyle = colors.line;
  ctx.fillRect(width - 1, 0, 1, height);
}

/** Bar numbers and beat ticks above the grid, with a dashed line and "END" where the pattern loops. */
export function drawRuler(
  ctx: CanvasRenderingContext2D,
  { width, height }: CanvasSize,
  view: RollView,
  loopEnd: number,
): void {
  const colors = themeColors();
  ctx.fillStyle = colors.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.font = CANVAS_FONT.bold;
  ctx.textBaseline = "middle";
  const first = Math.floor(view.scrollTick / BEAT_TICKS) * BEAT_TICKS;
  const last = xToTick(view, width);
  const showBeats = BEAT_TICKS * view.pxPerTick >= 8;
  for (let tick = first; tick < last; tick += BEAT_TICKS) {
    const x = Math.round(tickToX(view, tick));
    const bar = tick % BAR_TICKS === 0;
    if (!bar && !showBeats) continue;
    ctx.fillStyle = bar ? colors.ink : colors.line;
    ctx.fillRect(x, bar ? 0 : height / 2, 1, height);
    if (bar && BAR_TICKS * view.pxPerTick >= 22)
      ctx.fillText(String(tick / BAR_TICKS + 1), x + 4, height / 2);
  }
  const endX = tickToX(view, loopEnd);
  if (endX < width) {
    ctx.fillStyle = colors.panel;
    ctx.fillRect(Math.round(endX), 0, 36, height - 1);
    drawEndLine(ctx, endX, height, colors["ink-mute"]);
    ctx.font = CANVAS_FONT.label;
    ctx.fillStyle = colors["ink-dim"];
    ctx.fillText("END", endX + 4, height / 2);
  }
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, height - 1, width, 1);
}

/** Velocity stems for the channel's notes (selected ones in ink), plus a "Velocity N%" readout while dragging. */
export function drawVelocity(
  ctx: CanvasRenderingContext2D,
  { width, height }: CanvasSize,
  view: RollView,
  notes: readonly Note[],
  color: string,
  selected: ReadonlySet<string>,
  readout: { readonly x: number; readonly y: number; readonly velocity: number } | null,
): void {
  const colors = themeColors();
  ctx.fillStyle = colors.well;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.line;
  for (const level of [0.25, 0.5, 0.75]) {
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, Math.round(height * (1 - level)), width, 1);
  }
  ctx.globalAlpha = 1;
  const usable = height - 4;
  for (const note of notes) {
    const x = Math.round(tickToX(view, note.tick));
    if (x < -4 || x > width + 4) continue;
    const top = height - usable * note.velocity;
    ctx.fillStyle = selected.has(note.id) ? colors.ink : color;
    ctx.fillRect(x, top, 3, height - top);
    ctx.fillRect(x - 3, top - 1, 9, 3);
  }
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, 0, width, 1);
  if (readout) {
    const text = `Velocity ${Math.round(readout.velocity * 100)}%`;
    ctx.font = CANVAS_FONT.bold;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 8;
    const x = Math.min(readout.x + 10, width - w);
    const y = Math.max(9, Math.min(height - 9, readout.y));
    ctx.fillStyle = colors.panel;
    ctx.fillRect(x, y - 8, w, 16);
    ctx.fillStyle = colors.ink;
    ctx.fillText(text, x + 4, y);
  }
}
