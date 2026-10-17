/**
 * Pixel math for the piano roll: where a pitch row sits, which note is under the
 * pointer, which notes a marquee touches. Pure, so it is tested without a DOM.
 */
import type { Note } from "@/core/schema";
import { type TimelineView, tickToX } from "@/ui/timeline";

export const TOP_PITCH = 127;

/** The roll's viewport: the shared horizontal timeline plus vertical pitch scroll. */
export interface RollView extends TimelineView {
  /** Pixels scrolled down from the top row (pitch 127). */
  readonly scrollY: number;
  readonly rowHeight: number;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

/** FL naming: 60 is C5. */
export function pitchName(pitch: number): string {
  return `${NAMES[pitch % 12] ?? ""}${Math.floor(pitch / 12)}`;
}

export function isBlackKey(pitch: number): boolean {
  return BLACK.has(pitch % 12);
}

/** Top edge of a pitch row in canvas pixels. */
export function pitchToY(view: RollView, pitch: number): number {
  return (TOP_PITCH - pitch) * view.rowHeight - view.scrollY;
}

/** Pitch of the row under `y`, clamped to 0..127. */
export function yToPitch(view: RollView, y: number): number {
  const pitch = TOP_PITCH - Math.floor((y + view.scrollY) / view.rowHeight);
  return Math.min(TOP_PITCH, Math.max(0, pitch));
}

export interface NoteHit {
  readonly note: Note;
  /** "end" is the resize handle on the right edge. */
  readonly zone: "body" | "end";
}

/** The topmost (last drawn) note under a point, or null. */
export function noteAt(
  notes: readonly Note[],
  view: RollView,
  x: number,
  y: number,
): NoteHit | null {
  const row = TOP_PITCH - Math.floor((y + view.scrollY) / view.rowHeight);
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    if (!note || note.pitch !== row) continue;
    const left = tickToX(view, note.tick);
    const width = note.length * view.pxPerTick;
    if (x < left || x >= left + width) continue;
    const handle = Math.min(8, width / 3);
    return { note, zone: x >= left + width - handle ? "end" : "body" };
  }
  return null;
}

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Ids of notes whose box overlaps the rectangle (corners in any order). */
export function notesInRect(notes: readonly Note[], view: RollView, rect: Rect): Set<string> {
  const left = Math.min(rect.x0, rect.x1);
  const right = Math.max(rect.x0, rect.x1);
  const top = Math.min(rect.y0, rect.y1);
  const bottom = Math.max(rect.y0, rect.y1);
  const ids = new Set<string>();
  for (const note of notes) {
    const x = tickToX(view, note.tick);
    const y = pitchToY(view, note.pitch);
    if (
      x < right &&
      x + note.length * view.pxPerTick > left &&
      y < bottom &&
      y + view.rowHeight > top
    )
      ids.add(note.id);
  }
  return ids;
}
