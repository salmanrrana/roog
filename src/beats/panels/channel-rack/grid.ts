/**
 * Pure geometry and note helpers for the step grid. The rack's DOM rows and its
 * one step canvas share ROW_H, so a y position maps to the same channel in both.
 */
import { ROOT_PITCH } from "@/core/defaults";
import type { Note } from "@/core/schema";
import { STEP_TICKS } from "@/core/timing";

/** Height of one channel row (DOM controls and canvas lane). */
export const ROW_H = 26;
/** Height of the rack's sticky title header. */
export const HEADER_H = 36;
/** Height of the sticky beat ruler above the step rows (and the column captions beside it). */
export const RULER_H = 18;
/** Step cells scale with the panel width between these. */
export const MIN_CELL_W = 18;
export const MAX_CELL_W = 56;
/** Step counts offered in the rack header. */
export const STEP_OPTIONS = [16, 32, 64] as const;

export interface Cell {
  readonly row: number;
  readonly step: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Cell width that fills `available` px with `steps` cells, clamped to MIN/MAX_CELL_W. */
export function fitCellWidth(available: number, steps: number): number {
  return clamp(Math.floor(available / Math.max(1, steps)), MIN_CELL_W, MAX_CELL_W);
}

/** Row under a y offset (px from the top of the rows), or -1 outside the rows. */
export function rowAt(y: number, rows: number): number {
  const row = Math.floor(y / ROW_H);
  return row >= 0 && row < rows ? row : -1;
}

/**
 * Cell under a point on the rows canvas (row 0 starts at y = 0). Returns
 * null outside the grid, unless `clampToGrid` is set (drags that leave the canvas
 * keep painting the nearest cell).
 */
export function cellAt(
  x: number,
  y: number,
  grid: { readonly rows: number; readonly steps: number; readonly cellWidth: number },
  clampToGrid = false,
): Cell | null {
  if (grid.rows <= 0 || grid.steps <= 0) return null;
  const row = Math.floor(y / ROW_H);
  const step = Math.floor(x / grid.cellWidth);
  if (clampToGrid)
    return { row: clamp(row, 0, grid.rows - 1), step: clamp(step, 0, grid.steps - 1) };
  return row >= 0 && row < grid.rows && step >= 0 && step < grid.steps ? { row, step } : null;
}

/**
 * Steps a drag crossed going from `from` to `to`, excluding `from` (already
 * painted) and including `to`, in drag order. Fills gaps left by fast pointer moves.
 */
export function stepsBetween(from: number, to: number): number[] {
  const direction = Math.sign(to - from);
  const steps: number[] = [];
  for (let step = from + direction; direction !== 0 && step !== to + direction; step += direction)
    steps.push(step);
  return steps;
}

/**
 * True when every note is a plain rack step (on the grid, one step long, root
 * pitch), so the row can show step buttons. Otherwise the row shows a mini
 * piano-roll preview instead, like FL. Velocity doesn't count: steps show it.
 */
export function isStepsOnly(notes: readonly Note[]): boolean {
  return notes.every(
    (note) =>
      note.tick % STEP_TICKS === 0 && note.length === STEP_TICKS && note.pitch === ROOT_PITCH,
  );
}

/** Velocity of the note starting on each step (0 = unlit), for drawing a row. */
export function litSteps(notes: readonly Note[], steps: number): number[] {
  const lit = Array.from({ length: steps }, () => 0);
  for (const note of notes) {
    const step = note.tick / STEP_TICKS;
    if (Number.isInteger(step) && step < steps) lit[step] = Math.max(lit[step] ?? 0, note.velocity);
  }
  return lit;
}
