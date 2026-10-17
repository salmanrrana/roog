import { type MouseEvent, type PointerEvent, useEffect, useRef } from "react";
import { addClip, removeClips, updateClip } from "@/core/commands";
import { createId } from "@/core/ids";
import { patternLength, songLength } from "@/core/schedule";
import { BAR_TICKS } from "@/core/timing";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { selectPattern, useUiStore } from "@/state/ui-store";
import { useCanvas } from "@/ui/canvas";
import { useFrame } from "@/ui/frame";
import { themeColors } from "@/ui/theme";
import { snapTick, tickToX, xToTick } from "@/ui/timeline";
import {
  type Box,
  type Grab,
  clipsInBox,
  hitClip,
  isFree,
  moveDelta,
  moveIsFree,
  resizedLength,
} from "./clips";
import { drawTimeline } from "./draw";
import { TrackHeaders } from "./TrackHeaders";
import {
  HEADER_WIDTH,
  ROW_HEIGHT,
  RULER_HEIGHT,
  scrollView,
  setSelection,
  usePlaylistView,
  WHEEL_NOTCH_PX,
} from "./view-store";

/** Pixels at a clip's right edge that grab the resize handle. */
const EDGE_PX = 8;

/** The pointer gesture in progress. Lives in a ref: drags never re-render React. */
type Drag =
  | {
      readonly kind: "move";
      readonly gesture: string;
      readonly lead: Grab;
      readonly group: readonly (Grab & { readonly id: string })[];
      readonly downTick: number;
      readonly downRow: number;
      readonly trackIds: readonly string[];
      last: { ticks: number; rows: number };
      /** Set when a plain click on an already-selected clip should narrow the selection on release. */
      clickId: string | null;
    }
  | {
      readonly kind: "resize";
      readonly gesture: string;
      readonly id: string;
      readonly start: number;
      last: number;
    }
  | { readonly kind: "erase"; readonly gesture: string }
  | {
      readonly kind: "paint";
      readonly gesture: string;
      readonly patternId: string;
      readonly anchor: number;
      readonly length: number;
    }
  | { readonly kind: "marquee"; readonly additive: boolean };

/** Snap grid for a pointer event: bars, or single ticks with Alt held. */
const gridOf = (event: { altKey: boolean }) => (event.altKey ? 1 : BAR_TICKS);

/** Timeline canvas with track headers: place, move, resize, paint, erase and marquee-select clips. */
export function Timeline() {
  const tracks = useProjectStore((s) => s.project.playlist.tracks);
  const clips = useProjectStore((s) => s.project.playlist.clips);
  const patterns = useProjectStore((s) => s.project.patterns);
  const scrollTick = usePlaylistView((s) => s.scrollTick);
  const pxPerTick = usePlaylistView((s) => s.pxPerTick);
  const scrollY = usePlaylistView((s) => s.scrollY);
  const selected = usePlaylistView((s) => s.selected);
  const songEnd = useProjectStore((s) => songLength(s.project));
  const animate = useUiStore((s) => s.playing && s.playMode === "song");
  // Pattern mode while playing: clips of the looping pattern get a hot top bar.
  const playingPatternId = useUiStore((s) =>
    s.playing && s.playMode === "pattern" ? s.patternId : null,
  );

  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const marquee = useRef<Box | null>(null);

  const patternMap = new Map(patterns.map((pattern) => [pattern.id, pattern]));

  const { ref: gridRef } = useCanvas((ctx, size) =>
    drawTimeline(ctx, size, {
      view: { scrollTick, pxPerTick },
      scrollY,
      tracks,
      clips,
      patterns: patternMap,
      selected,
      songEnd,
      playingPatternId,
    }),
  );

  // Overlay: song playhead (paging the view to follow it) and the marquee.
  const { ref: overlayRef, redraw: redrawOverlay } = useCanvas((ctx, { width, height }) => {
    const colors = themeColors();
    let view = usePlaylistView.getState();
    const playhead = engine.getPlayhead();
    if (playhead?.scope.kind === "song") {
      const headX = tickToX(view, playhead.tick);
      if (headX > width * 0.9 || headX < 0) {
        const scrollTick = Math.max(0, playhead.tick - (width * 0.1) / view.pxPerTick);
        usePlaylistView.setState({ scrollTick });
        view = usePlaylistView.getState();
      }
      const x = Math.round(tickToX(view, playhead.tick));
      ctx.fillStyle = colors.hot;
      ctx.fillRect(x - 1, 0, 2, height);
    }
    const box = marquee.current;
    if (box) {
      const x0 = tickToX(view, Math.min(box.tick0, box.tick1));
      const x1 = tickToX(view, Math.max(box.tick0, box.tick1));
      const y0 = RULER_HEIGHT + Math.min(box.row0, box.row1) * ROW_HEIGHT - view.scrollY;
      const y1 = RULER_HEIGHT + Math.max(box.row0, box.row1) * ROW_HEIGHT - view.scrollY;
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }
  });
  useFrame(redrawOverlay, animate);

  // Wheel needs a non-passive native listener so it can stop the page from scrolling.
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      // Lines (Firefox mice) and pages become pixels: 3 lines ≈ one notch.
      const scale =
        event.deltaMode === 1 ? WHEEL_NOTCH_PX / 3 : event.deltaMode === 2 ? rect.width : 1;
      const { project } = useProjectStore.getState();
      const rowCount = project.playlist.tracks.length;
      scrollView(
        {
          deltaX: event.deltaX * scale,
          deltaY: event.deltaY * scale,
          zoom: event.ctrlKey || event.metaKey,
          horizontal: event.shiftKey,
        },
        event.clientX - rect.left - HEADER_WIDTH,
        Math.max(0, (rowCount + 1) * ROW_HEIGHT - (rect.height - RULER_HEIGHT)),
        songLength(project),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /** Pointer position in timeline units. `row` is fractional. */
  function locate(event: MouseEvent<HTMLCanvasElement>) {
    const view = usePlaylistView.getState();
    const { offsetX: x, offsetY: y } = event.nativeEvent;
    return { y, tick: xToTick(view, x), row: (y - RULER_HEIGHT + view.scrollY) / ROW_HEIGHT };
  }

  function hitAt(tick: number, row: number) {
    const { playlist } = useProjectStore.getState().project;
    const rowOf = new Map(playlist.tracks.map((track, index) => [track.id, index]));
    const edgeTicks = EDGE_PX / usePlaylistView.getState().pxPerTick;
    return hitClip(playlist.clips, rowOf, tick, Math.floor(row), edgeTicks);
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    const { y, tick, row: rowF } = locate(event);
    if (y < RULER_HEIGHT) return;
    const row = Math.floor(rowF);
    const { tool, selected: current } = usePlaylistView.getState();
    const { project } = useProjectStore.getState();
    const { tracks: liveTracks, clips: liveClips } = project.playlist;
    const hit = hitAt(tick, rowF);
    const gesture = createId();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 2 || tool === "delete") {
      if (hit) edit((p) => removeClips(p, new Set([hit.clip.id])), gesture);
      drag.current = { kind: "erase", gesture };
      return;
    }

    if (event.ctrlKey || event.metaKey || (tool === "select" && !hit)) {
      marquee.current = { tick0: tick, tick1: tick, row0: rowF, row1: rowF };
      drag.current = { kind: "marquee", additive: event.shiftKey };
      return;
    }

    const rowOf = new Map(liveTracks.map((track, index) => [track.id, index]));
    const trackIds = liveTracks.map((track) => track.id);

    if (hit?.zone === "end") {
      setSelection(new Set([hit.clip.id]));
      drag.current = {
        kind: "resize",
        gesture,
        id: hit.clip.id,
        start: hit.clip.start,
        last: hit.clip.length,
      };
      return;
    }

    if (hit) {
      const id = hit.clip.id;
      let next = current;
      if (event.shiftKey) {
        const toggled = new Set(current);
        if (!toggled.delete(id)) toggled.add(id);
        setSelection(toggled);
        if (!toggled.has(id)) return;
        next = toggled;
      } else if (!current.has(id)) {
        next = new Set([id]);
        setSelection(next);
      }
      drag.current = {
        kind: "move",
        gesture,
        lead: { start: hit.clip.start, row },
        group: liveClips
          .filter((clip) => next.has(clip.id))
          .map((clip) => ({ id: clip.id, start: clip.start, row: rowOf.get(clip.trackId) ?? 0 })),
        downTick: tick,
        downRow: row,
        trackIds,
        last: { ticks: 0, rows: 0 },
        clickId: !event.shiftKey && current.has(id) && current.size > 1 ? id : null,
      };
      return;
    }

    // Empty space: place the brush (the selected pattern).
    const track = liveTracks[row];
    const pattern = project.patterns.find((p) => p.id === useUiStore.getState().patternId);
    if (!track || !pattern || tool === "select") return;
    const length = patternLength(pattern);
    const start = Math.max(0, snapTick(tick, event.altKey ? "none" : "bar"));
    const id = edit(
      (p) => addClip(p, { patternId: pattern.id, trackId: track.id, start, length }),
      gesture,
    );
    setSelection(new Set([id]));
    drag.current =
      tool === "paint"
        ? { kind: "paint", gesture, patternId: pattern.id, anchor: start, length }
        : {
            kind: "move",
            gesture,
            lead: { start, row },
            group: [{ id, start, row }],
            downTick: tick,
            downRow: row,
            trackIds,
            last: { ticks: 0, rows: 0 },
            clickId: null,
          };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const { tick, row: rowF } = locate(event);
    const current = drag.current;
    if (!current) {
      const hit = hitAt(tick, rowF);
      event.currentTarget.style.cursor =
        hit?.zone === "end" ? "ew-resize" : hit ? "grab" : "crosshair";
      return;
    }
    switch (current.kind) {
      case "move": {
        const delta = moveDelta(
          current.group,
          current.lead,
          tick - current.downTick,
          Math.floor(rowF) - current.downRow,
          current.trackIds.length,
          gridOf(event),
        );
        if (delta.ticks === current.last.ticks && delta.rows === current.last.rows) return;
        // Never overlap: a blocked spot leaves the clips at their last free position.
        const { clips: liveClips } = useProjectStore.getState().project.playlist;
        if (!moveIsFree(liveClips, current.group, delta, current.trackIds)) return;
        current.last = delta;
        current.clickId = null;
        edit((p) => {
          for (const grab of current.group) {
            const trackId = current.trackIds[grab.row + delta.rows];
            updateClip(p, grab.id, {
              start: grab.start + delta.ticks,
              ...(trackId === undefined ? {} : { trackId }),
            });
          }
        }, current.gesture);
        return;
      }
      case "resize": {
        const length = resizedLength(current.start, tick, gridOf(event));
        if (length === current.last) return;
        current.last = length;
        edit((p) => updateClip(p, current.id, { length }), current.gesture);
        return;
      }
      case "erase": {
        const hit = hitAt(tick, rowF);
        if (hit) edit((p) => removeClips(p, new Set([hit.clip.id])), current.gesture);
        return;
      }
      case "paint": {
        const { playlist } = useProjectStore.getState().project;
        const track = playlist.tracks[Math.floor(rowF)];
        const slot =
          current.anchor + Math.floor((tick - current.anchor) / current.length) * current.length;
        if (!track || slot < 0 || !isFree(playlist.clips, track.id, slot, current.length)) return;
        edit(
          (p) =>
            addClip(p, {
              patternId: current.patternId,
              trackId: track.id,
              start: slot,
              length: current.length,
            }),
          current.gesture,
        );
        return;
      }
      case "marquee": {
        if (marquee.current) marquee.current = { ...marquee.current, tick1: tick, row1: rowF };
        redrawOverlay();
        return;
      }
    }
  }

  function onPointerUp() {
    const current = drag.current;
    drag.current = null;
    if (current?.kind === "move" && current.clickId) setSelection(new Set([current.clickId]));
    const box = marquee.current;
    if (current?.kind === "marquee" && box) {
      const { playlist } = useProjectStore.getState().project;
      const rowOf = new Map(playlist.tracks.map((track, index) => [track.id, index]));
      const ids = clipsInBox(playlist.clips, rowOf, box);
      if (current.additive) for (const id of usePlaylistView.getState().selected) ids.add(id);
      setSelection(ids);
    }
    marquee.current = null;
    redrawOverlay();
  }

  function onDoubleClick(event: MouseEvent<HTMLCanvasElement>) {
    const { tick, row } = locate(event);
    const hit = hitAt(tick, row);
    if (hit) selectPattern(hit.clip.patternId);
  }

  return (
    <div
      ref={wrap}
      className="grid min-h-0 flex-1 overflow-hidden"
      style={{ gridTemplateColumns: `${HEADER_WIDTH}px minmax(0,1fr)` }}
    >
      <TrackHeaders />
      <div className="relative min-w-0">
        {/* Geometry for tools and e2e tests. */}
        <canvas
          ref={gridRef}
          aria-label="Playlist timeline"
          data-bar-width={BAR_TICKS * pxPerTick}
          data-row-height={ROW_HEIGHT}
          data-ruler-height={RULER_HEIGHT}
          className="absolute inset-0 size-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={(event) => event.preventDefault()}
        />
        <canvas
          ref={overlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        />
        {clips.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-ink-dim">
            Pick a pattern on the left, then click a track to place it.
          </p>
        )}
      </div>
    </div>
  );
}
