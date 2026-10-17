/**
 * Pure playlist geometry and clip edits: hit-testing, marquee, group moves,
 * resizing and duplicate/paste. Rows are playlist track indexes; ticks are song ticks.
 */
import { addClip } from "@/core/commands";
import type { Clip, Project } from "@/core/schema";
import { BAR_TICKS, ceilTo } from "@/core/timing";

/** Track id → row index, built once per render from the track list. */
export type RowOf = ReadonlyMap<string, number>;

export interface ClipHit {
  readonly clip: Clip;
  /** "end" = the right-edge resize handle. */
  readonly zone: "body" | "end";
}

/**
 * Topmost clip under a point (later clips draw on top). The resize zone is the
 * last `edgeTicks` of the clip, capped to a third of it so short clips can still be moved.
 */
export function hitClip(
  clips: readonly Clip[],
  rowOf: RowOf,
  tick: number,
  row: number,
  edgeTicks: number,
): ClipHit | null {
  for (let index = clips.length - 1; index >= 0; index -= 1) {
    const clip = clips[index];
    if (!clip || rowOf.get(clip.trackId) !== row) continue;
    const end = clip.start + clip.length;
    if (tick < clip.start || tick >= end) continue;
    return { clip, zone: tick >= end - Math.min(edgeTicks, clip.length / 3) ? "end" : "body" };
  }
  return null;
}

/** A marquee in timeline units. Corners in any order; rows may be fractional. */
export interface Box {
  readonly tick0: number;
  readonly tick1: number;
  readonly row0: number;
  readonly row1: number;
}

/** Ids of clips the marquee touches. */
export function clipsInBox(clips: readonly Clip[], rowOf: RowOf, box: Box): Set<string> {
  const lo = Math.min(box.tick0, box.tick1);
  const hi = Math.max(box.tick0, box.tick1);
  const top = Math.floor(Math.min(box.row0, box.row1));
  const bottom = Math.floor(Math.max(box.row0, box.row1));
  const ids = new Set<string>();
  for (const clip of clips) {
    const row = rowOf.get(clip.trackId);
    if (row === undefined || row < top || row > bottom) continue;
    if (clip.start < hi && clip.start + clip.length > lo) ids.add(clip.id);
  }
  return ids;
}

/** Where a clip was when a drag started. */
export interface Grab {
  readonly start: number;
  readonly row: number;
}

/**
 * Snapped offset for dragging a group of clips. The lead clip (the one grabbed)
 * lands on the grid; the group is then clamped so no clip leaves tick 0 or the track list.
 */
export function moveDelta(
  group: readonly Grab[],
  lead: Grab,
  rawTicks: number,
  rawRows: number,
  rowCount: number,
  grid: number,
): { readonly ticks: number; readonly rows: number } {
  let minStart = Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const grab of group) {
    minStart = Math.min(minStart, grab.start);
    minRow = Math.min(minRow, grab.row);
    maxRow = Math.max(maxRow, grab.row);
  }
  const ticks = Math.round((lead.start + rawTicks) / grid) * grid - lead.start;
  const rows = Math.round(rawRows);
  return {
    ticks: Math.max(ticks, -minStart),
    rows: Math.min(Math.max(rows, -minRow), rowCount - 1 - maxRow),
  };
}

/** Clip length after dragging its right edge to `tick`: the end snaps, at least one grid unit long. */
export function resizedLength(start: number, tick: number, grid: number): number {
  return Math.max(grid, Math.round(tick / grid) * grid - start);
}

/** True when no clip on `trackId` overlaps [start, start + length). */
export function isFree(
  clips: readonly Clip[],
  trackId: string,
  start: number,
  length: number,
): boolean {
  return !clips.some(
    (clip) =>
      clip.trackId === trackId && clip.start < start + length && clip.start + clip.length > start,
  );
}

/** How far duplicate/paste shifts copies: the clips' extent rounded up to whole bars. */
export function clipsSpan(clips: readonly Pick<Clip, "start" | "length">[]): number {
  if (clips.length === 0) return 0;
  let lo = Infinity;
  let hi = 0;
  for (const clip of clips) {
    lo = Math.min(lo, clip.start);
    hi = Math.max(hi, clip.start + clip.length);
  }
  return ceilTo(hi - lo, BAR_TICKS);
}

/** Add copies of `clips` shifted right by `offset` ticks. Returns the new clip ids. */
export function pasteClips(
  project: Project,
  clips: readonly Omit<Clip, "id">[],
  offset: number,
): string[] {
  return clips.map((clip) =>
    addClip(project, {
      patternId: clip.patternId,
      trackId: clip.trackId,
      start: clip.start + offset,
      length: clip.length,
    }),
  );
}
