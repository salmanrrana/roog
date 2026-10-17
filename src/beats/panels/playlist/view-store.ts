/**
 * Playlist view state that survives tab switches: scroll, zoom, tool and clip
 * selection. Not saved, not undoable. Drag pixels never go here (they live in refs).
 */
import { create } from "zustand";
import type { Clip } from "@/core/schema";
import { zoomAt } from "@/ui/timeline";

export const RULER_HEIGHT = 22;
export const ROW_HEIGHT = 44;
export const HEADER_WIDTH = 132;
export const ZOOM_LIMITS = { min: 0.02, max: 2 };

export const TOOLS = [
  { id: "draw", key: "p", label: "Draw" },
  { id: "paint", key: "b", label: "Paint" },
  { id: "delete", key: "d", label: "Delete" },
  { id: "select", key: "e", label: "Select" },
] as const;

export type Tool = (typeof TOOLS)[number]["id"];

interface PlaylistView {
  readonly scrollTick: number;
  readonly pxPerTick: number;
  /** Vertical scroll in CSS pixels. */
  readonly scrollY: number;
  readonly tool: Tool;
  readonly selected: ReadonlySet<string>;
}

export const usePlaylistView = create<PlaylistView>()(() => ({
  scrollTick: 0,
  pxPerTick: 0.2,
  scrollY: 0,
  tool: "draw",
  selected: new Set(),
}));

export function setTool(tool: Tool): void {
  usePlaylistView.setState({ tool });
}

export function setSelection(selected: ReadonlySet<string>): void {
  usePlaylistView.setState({ selected });
}

/** Clips copied with Ctrl+C, and how far the next Ctrl+V shifts them. */
export const clipboard: { clips: readonly Omit<Clip, "id">[]; offset: number } = {
  clips: [],
  offset: 0,
};

export interface Wheel {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly zoom: boolean;
  readonly horizontal: boolean;
}

/** Wheel scrolls tracks, Shift+wheel scrolls time, Ctrl+wheel zooms around `anchorX`. */
export function scrollView(wheel: Wheel, anchorX: number, maxScrollY: number): void {
  const view = usePlaylistView.getState();
  if (wheel.zoom) {
    usePlaylistView.setState(zoomAt(view, Math.exp(-wheel.deltaY * 0.002), anchorX, ZOOM_LIMITS));
    return;
  }
  const dx = wheel.horizontal ? wheel.deltaY || wheel.deltaX : wheel.deltaX;
  const dy = wheel.horizontal ? 0 : wheel.deltaY;
  usePlaylistView.setState({
    scrollTick: Math.max(0, view.scrollTick + dx / view.pxPerTick),
    scrollY: Math.min(Math.max(0, view.scrollY + dy), maxScrollY),
  });
}
