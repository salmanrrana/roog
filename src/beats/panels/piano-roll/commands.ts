/**
 * Piano-roll-only note edits. Each takes the notes to change and returns either
 * patches for `updateNotes` or new notes for `addNotes` (core/commands.ts), so
 * the panel decides which notes (selection or all) and wraps them in `edit()`.
 */
import type { NotePatch } from "@/core/commands";
import { createId } from "@/core/ids";
import type { Note } from "@/core/schema";
import { BEAT_TICKS, ceilTo } from "@/core/timing";

export type NoteChanges = Map<string, NotePatch>;

const MAX_PITCH = 127;

/**
 * Shift notes as a group by ticks and semitones (drag moves, nudges, transposes).
 * The deltas are clamped so no note goes before tick 0 or off the keyboard, which
 * keeps chord shapes and rhythms intact at the edges.
 */
export function moveNotes(notes: readonly Note[], dTick: number, dPitch: number): NoteChanges {
  let minTick = Infinity;
  let minPitch = Infinity;
  let maxPitch = -Infinity;
  for (const note of notes) {
    minTick = Math.min(minTick, note.tick);
    minPitch = Math.min(minPitch, note.pitch);
    maxPitch = Math.max(maxPitch, note.pitch);
  }
  const ticks = Math.max(dTick, -minTick);
  const semis = Math.min(Math.max(dPitch, -minPitch), MAX_PITCH - maxPitch);
  return new Map(
    notes.map((note) => [note.id, { tick: note.tick + ticks, pitch: note.pitch + semis }]),
  );
}

/** Grow or shrink every note by the same amount, never below `minLength`. */
export function resizeNotes(
  notes: readonly Note[],
  dLength: number,
  minLength: number,
): NoteChanges {
  return new Map(
    notes.map((note) => [note.id, { length: Math.max(minLength, note.length + dLength) }]),
  );
}

/** Snap note starts to the nearest grid line (Ctrl+Q). Lengths are kept. Only moved notes are returned. */
export function quantizeNotes(notes: readonly Note[], grid: number): NoteChanges {
  const changes: NoteChanges = new Map();
  for (const note of notes) {
    const tick = Math.round(note.tick / grid) * grid;
    if (tick !== note.tick) changes.set(note.id, { tick });
  }
  return changes;
}

/** Copies with fresh ids, shifted by `dTick` (paste, duplicate). */
export function copyNotes(notes: readonly Note[], dTick = 0): Note[] {
  return notes.map((note) => ({ ...note, id: createId(), tick: note.tick + dTick }));
}

/**
 * How far copies move to land right after `notes`: the beats they occupy, from
 * the start rounded down to the end rounded up, so a one-bar riff repeats one bar later.
 */
export function noteSpan(notes: readonly Note[]): number {
  if (notes.length === 0) return 0;
  let start = Infinity;
  let end = 0;
  for (const note of notes) {
    start = Math.min(start, note.tick);
    end = Math.max(end, note.tick + note.length);
  }
  return ceilTo(end, BEAT_TICKS) - Math.floor(start / BEAT_TICKS) * BEAT_TICKS;
}

/** Copies placed right after the originals (Ctrl+D). */
export function duplicateNotes(notes: readonly Note[]): Note[] {
  return copyNotes(notes, noteSpan(notes));
}
