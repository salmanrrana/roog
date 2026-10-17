/**
 * Piano roll view state that survives tab switches: tool, snap, zoom, scroll,
 * selection, ghost-note visibility and the "last used" note settings new notes
 * copy. Not saved, not undone.
 */
import { create } from "zustand";
import { findPattern } from "@/core/commands";
import { DEFAULT_VELOCITY } from "@/core/defaults";
import { STEP_TICKS } from "@/core/timing";
import { useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import type { Snap } from "@/ui/timeline";
import { TOP_PITCH } from "./geometry";

export type Tool = "draw" | "paint" | "delete" | "select";

export interface PianoRollState {
  readonly tool: Tool;
  readonly snap: Snap;
  readonly pxPerTick: number;
  readonly scrollTick: number;
  readonly scrollY: number;
  readonly rowHeight: number;
  readonly selected: ReadonlySet<string>;
  /** Note grid size in CSS px, measured by NoteGrid on resize. */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** Draw other channels' notes as outlines. */
  readonly showGhosts: boolean;
  /** New notes take the length and velocity of the last note placed, clicked or resized (FL). */
  readonly lastLength: number;
  readonly lastVelocity: number;
}

const ROW_HEIGHT = 14;
export const NO_SELECTION: ReadonlySet<string> = new Set();
export const ZOOM_LIMITS = { min: 0.1, max: 8 };

export const usePianoRoll = create<PianoRollState>()(() => ({
  tool: "draw",
  snap: "step",
  pxPerTick: 0.9,
  scrollTick: 0,
  // Start with C7 at the top, so C4..C6 is in view (NoteGrid recenters on mount).
  scrollY: (TOP_PITCH - 84) * ROW_HEIGHT,
  rowHeight: ROW_HEIGHT,
  selected: NO_SELECTION,
  viewWidth: 800,
  viewHeight: 400,
  showGhosts: true,
  lastLength: STEP_TICKS,
  lastVelocity: DEFAULT_VELOCITY,
}));

export function setSelection(selected: ReadonlySet<string>): void {
  usePianoRoll.setState({ selected });
}

function clampScrollY(scrollY: number, rowHeight: number, height: number): number {
  return Math.max(0, Math.min((TOP_PITCH + 1) * rowHeight - height, scrollY));
}

/** Scroll vertically by pixels, kept inside the 128 rows for a viewport `height` px tall. */
export function scrollRows(delta: number, height: number): void {
  usePianoRoll.setState(({ scrollY, rowHeight }) => ({
    scrollY: clampScrollY(scrollY + delta, rowHeight, height),
  }));
}

/** Scroll so `pitch` sits in the vertical middle of a viewport `height` px tall. */
export function centerOnPitch(pitch: number, height: number): void {
  usePianoRoll.setState(({ rowHeight }) => ({
    scrollY: clampScrollY((TOP_PITCH - pitch + 0.5) * rowHeight - height / 2, rowHeight, height),
  }));
}

// Selection belongs to one pattern + channel: clear it when either changes.
useUiStore.subscribe((state, previous) => {
  if (state.patternId !== previous.patternId || state.channelId !== previous.channelId)
    setSelection(NO_SELECTION);
});

// Undo, redo and other panels can remove notes: drop selected ids that are gone.
useProjectStore.subscribe(({ project }) => {
  const { selected } = usePianoRoll.getState();
  if (selected.size === 0) return;
  const { patternId, channelId } = useUiStore.getState();
  const notes = channelId === null ? [] : (findPattern(project, patternId)?.notes[channelId] ?? []);
  const live = new Set(notes.map((note) => note.id));
  const kept = new Set([...selected].filter((id) => live.has(id)));
  if (kept.size !== selected.size) setSelection(kept);
});
