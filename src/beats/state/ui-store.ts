/**
 * App-wide UI state that is not part of the saved project and not undoable:
 * which view is open, what is selected, and transport mode. Panel-local view state
 * (zoom, scroll, tool, selection) belongs in a small store inside that panel.
 * Never put per-frame values (playhead, meters) here.
 */
import { create } from "zustand";
import { findChannel, findPattern } from "@/core/commands";
import type { PlaybackScope } from "@/core/schedule";
import { useProjectStore } from "./project-store";

export type WorkspaceView = "playlist" | "pianoRoll" | "mixer";
export type PlayMode = "pattern" | "song";

export interface UiState {
  readonly view: WorkspaceView;
  readonly rackOpen: boolean;
  readonly playMode: PlayMode;
  /** Mirrors the engine. Only the engine writes it. */
  readonly playing: boolean;
  /** Selected pattern: what pattern mode plays and what the rack and piano roll edit. Always valid. */
  readonly patternId: string;
  /** Selected channel: the piano roll's target. Null only when the project has no channels. */
  readonly channelId: string | null;
}

const initialProject = useProjectStore.getState().project;

export const useUiStore = create<UiState>()(() => ({
  view: "playlist",
  rackOpen: true,
  playMode: "pattern",
  playing: false,
  patternId: initialProject.patterns[0]?.id ?? "",
  channelId: initialProject.channels[0]?.id ?? null,
}));

// Keep selections valid when patterns or channels disappear (delete, undo, load).
useProjectStore.subscribe(({ project }, previous) => {
  if (project === previous.project) return;
  const { patternId, channelId } = useUiStore.getState();
  if (!findPattern(project, patternId))
    useUiStore.setState({ patternId: project.patterns[0]?.id ?? "" });
  if (channelId === null || !findChannel(project, channelId)) {
    useUiStore.setState({ channelId: project.channels[0]?.id ?? null });
  }
});

export function setView(view: WorkspaceView): void {
  useUiStore.setState({ view });
}

export function toggleRack(): void {
  useUiStore.setState((state) => ({ rackOpen: !state.rackOpen }));
}

export function setPlayMode(playMode: PlayMode): void {
  useUiStore.setState({ playMode });
}

export function togglePlayMode(): void {
  useUiStore.setState((state) => ({ playMode: state.playMode === "pattern" ? "song" : "pattern" }));
}

export function selectPattern(patternId: string): void {
  useUiStore.setState({ patternId });
}

/** Select the next/previous pattern (wraps). */
export function stepPattern(delta: number): void {
  const { patterns } = useProjectStore.getState().project;
  const index = patterns.findIndex((pattern) => pattern.id === useUiStore.getState().patternId);
  const next = patterns[(index + delta + patterns.length) % patterns.length];
  if (next) selectPattern(next.id);
}

export function selectChannel(channelId: string): void {
  useUiStore.setState({ channelId });
}

/** Select a channel and show it in the piano roll. */
export function openPianoRoll(channelId: string): void {
  useUiStore.setState({ channelId, view: "pianoRoll" });
}

/** What the transport plays right now: the selected pattern on loop, or the song. */
export function currentScope(state: UiState = useUiStore.getState()): PlaybackScope {
  return state.playMode === "song"
    ? { kind: "song" }
    : { kind: "pattern", patternId: state.patternId };
}
