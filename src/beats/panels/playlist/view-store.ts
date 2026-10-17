/**
 * Playlist view state that survives tab switches: scroll, zoom, tool and clip
 * selection. Not saved, not undoable. Drag pixels never go here (they live in refs).
 */
import { create } from "zustand";
import type { Clip } from "@/core/schema";
import { BAR_TICKS } from "@/core/timing";
import { zoomAt } from "@/ui/timeline";

export const RULER_HEIGHT = 22;
export const ROW_HEIGHT = 44;
export const HEADER_WIDTH = 132;
export const ZOOM_LIMITS = { min: 0.02, max: 2 };

export const TOOLS = [
  {
    id: "draw",
    key: "p",
    label: "Draw",
    title: "Draw (P): click to place the selected pattern, drag to position it",
  },
  { id: "paint", key: "b", label: "Paint", title: "Paint (B): drag to fill repeats" },
  { id: "delete", key: "d", label: "Delete", title: "Delete (D): click or drag over clips" },
  { id: "select", key: "e", label: "Select", title: "Select (E): drag a box, Shift-click to add" },
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
  /** Deltas in pixels; Timeline converts line and page deltas first. */
  readonly deltaX: number;
  readonly deltaY: number;
  readonly zoom: boolean;
  readonly horizontal: boolean;
}

/** Pixels in one typical mouse-wheel notch; one notch scrolls about one bar of time. */
export const WHEEL_NOTCH_PX = 100;

/**
 * Wheel scrolls tracks, Shift+wheel scrolls time, Ctrl+wheel zooms around `anchorX`.
 * Time scroll stops at `maxScrollTick` (the song end), so you can go one view past END.
 */
export function scrollView(
  wheel: Wheel,
  anchorX: number,
  maxScrollY: number,
  maxScrollTick: number,
): void {
  const view = usePlaylistView.getState();
  const clampTick = (tick: number) => Math.min(Math.max(0, tick), maxScrollTick);
  if (wheel.zoom) {
    const zoomed = zoomAt(view, Math.exp(-wheel.deltaY * 0.002), anchorX, ZOOM_LIMITS);
    usePlaylistView.setState({ ...zoomed, scrollTick: clampTick(zoomed.scrollTick) });
    return;
  }
  const dx = wheel.horizontal ? wheel.deltaY || wheel.deltaX : wheel.deltaX;
  const dy = wheel.horizontal ? 0 : wheel.deltaY;
  usePlaylistView.setState({
    scrollTick: clampTick(view.scrollTick + (dx / WHEEL_NOTCH_PX) * BAR_TICKS),
    scrollY: Math.min(Math.max(0, view.scrollY + dy), maxScrollY),
  });
}
