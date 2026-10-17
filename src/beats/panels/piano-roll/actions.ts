/**
 * Keyboard/toolbar actions on the edited pattern + channel. They read the stores
 * at call time (no subscriptions) and apply the pure edits from ./commands.
 */
import { addNotes, findPattern, removeNotes, updateNotes } from "@/core/commands";
import type { Note } from "@/core/schema";
import { edit, useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { BEAT_TICKS } from "@/core/timing";
import { SNAP_TICKS } from "@/ui/timeline";
import {
  type NoteChanges,
  copyNotes,
  duplicateNotes,
  moveNotes,
  noteSpan,
  quantizeNotes,
} from "./commands";
import { NO_SELECTION, setSelection, usePianoRoll } from "./store";

/** Copied notes, and how far the next paste shifts them (grows by one span per paste). */
let clipboard: { readonly notes: readonly Note[]; offset: number } = { notes: [], offset: 0 };

function target() {
  const { patternId, channelId } = useUiStore.getState();
  if (channelId === null) return null;
  const notes = findPattern(useProjectStore.getState().project, patternId)?.notes[channelId] ?? [];
  const { selected } = usePianoRoll.getState();
  return { patternId, channelId, notes, chosen: notes.filter((note) => selected.has(note.id)) };
}

function change(build: (notes: readonly Note[]) => NoteChanges, allWhenNone = false): void {
  const t = target();
  if (!t) return;
  const notes = t.chosen.length > 0 || !allWhenNone ? t.chosen : t.notes;
  if (notes.length > 0) edit((p) => updateNotes(p, t.patternId, t.channelId, build(notes)));
}

/** Add notes, select them, and scroll right if the first one starts out of view. */
function place(notes: readonly Note[], patternId: string, channelId: string): void {
  if (notes.length === 0) return;
  edit((p) => addNotes(p, patternId, channelId, notes));
  setSelection(new Set(notes.map((note) => note.id)));
  const first = Math.min(...notes.map((note) => note.tick));
  const { scrollTick, pxPerTick, viewWidth } = usePianoRoll.getState();
  if (first < scrollTick || first > scrollTick + viewWidth / pxPerTick)
    usePianoRoll.setState({ scrollTick: Math.max(0, first - 2 * BEAT_TICKS) });
}

export function selectAll(): void {
  const t = target();
  if (t) setSelection(new Set(t.notes.map((note) => note.id)));
}

export function deleteSelection(): void {
  const t = target();
  if (!t || t.chosen.length === 0) return;
  const { selected } = usePianoRoll.getState();
  edit((p) => removeNotes(p, t.patternId, t.channelId, selected));
  setSelection(NO_SELECTION);
}

export function copySelection(): void {
  const t = target();
  if (t && t.chosen.length > 0) clipboard = { notes: t.chosen, offset: noteSpan(t.chosen) };
}

export function cutSelection(): void {
  copySelection();
  deleteSelection();
}

/**
 * Paste right after the copied block, selected, so arrows can move them right away.
 * Each further paste lands one span later, so repeated pastes stack to the right.
 */
export function paste(): void {
  const t = target();
  if (!t || clipboard.notes.length === 0) return;
  place(copyNotes(clipboard.notes, clipboard.offset), t.patternId, t.channelId);
  clipboard.offset += noteSpan(clipboard.notes);
}

export function duplicateSelection(): void {
  const t = target();
  if (t) place(duplicateNotes(t.chosen), t.patternId, t.channelId);
}

/** Quantize the selection, or every note when nothing is selected. */
export function quantize(): void {
  const grid = SNAP_TICKS[usePianoRoll.getState().snap];
  change((notes) => quantizeNotes(notes, grid), true);
}

/** Move the selection by grid steps and semitones (arrow keys). */
export function nudgeSelection(steps: number, semitones: number): void {
  const grid = SNAP_TICKS[usePianoRoll.getState().snap];
  change((notes) => moveNotes(notes, steps * grid, semitones));
}
