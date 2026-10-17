import { type PointerEvent, useEffect, useEffectEvent, useRef } from "react";
import { addNotes, findPattern, removeNotes, updateNotes } from "@/core/commands";
import { createId } from "@/core/ids";
import { patternLength } from "@/core/schedule";
import type { Note } from "@/core/schema";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { useCanvas } from "@/ui/canvas";
import { useFrame } from "@/ui/frame";
import { SNAP_TICKS, type Snap, snapTick, xToTick, zoomAt } from "@/ui/timeline";
import { moveNotes, resizeNotes } from "./commands";
import { drawGrid, drawOverlay } from "./draw";
import { type Rect, type RollView, noteAt, notesInRect, yToPitch } from "./geometry";
import {
  NO_SELECTION,
  type Tool,
  ZOOM_LIMITS,
  scrollRows,
  setSelection,
  usePianoRoll,
} from "./store";

/** One pointer gesture, from pointerdown to pointerup. Lives in a ref, never in React state. */
type Drag =
  | {
      readonly kind: "move";
      readonly gesture: string;
      readonly anchor: Note;
      /** The dragged notes as they were at pointerdown. */
      readonly group: readonly Note[];
      readonly startTick: number;
      readonly startPitch: number;
      /** Last committed deltas and the anchor's pitch, so only snapped changes commit. */
      dTick: number;
      dPitch: number;
      pitch: number;
    }
  | {
      readonly kind: "resize";
      readonly gesture: string;
      readonly anchor: Note;
      readonly group: readonly Note[];
      readonly startTick: number;
      length: number;
    }
  | {
      readonly kind: "paint";
      readonly gesture: string;
      readonly origin: number;
      readonly done: Set<number>;
    }
  | { readonly kind: "erase"; readonly gesture: string }
  | { readonly kind: "marquee"; readonly additive: boolean; rect: Rect };

const EMPTY: readonly Note[] = [];
const WHEEL_GESTURE_MS = 500;

const CURSOR: Record<Tool, string> = {
  draw: "crosshair",
  paint: "copy",
  delete: "not-allowed",
  select: "default",
};

/** Where the transport is inside this pattern, in pattern mode or inside a song clip. */
function playheadTick(patternId: string): number | null {
  const head = engine.getPlayhead();
  if (!head) return null;
  if (head.scope.kind === "pattern") return head.scope.patternId === patternId ? head.tick : null;
  const { project } = useProjectStore.getState();
  const pattern = findPattern(project, patternId);
  const clip = project.playlist.clips.find(
    (c) => c.patternId === patternId && head.tick >= c.start && head.tick < c.start + c.length,
  );
  return pattern && clip ? (head.tick - clip.start) % patternLength(pattern) : null;
}

function point(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * The note canvas for one pattern + channel: draws notes and ghosts, and handles
 * every pointer tool. Drags commit to the store only when the snapped result
 * changes, under one gesture id, so each drag is a single undo step.
 */
export function NoteGrid({ patternId, channelId }: { patternId: string; channelId: string }) {
  const pattern = useProjectStore((s) => findPattern(s.project, patternId));
  const channels = useProjectStore((s) => s.project.channels);
  const playing = useUiStore((s) => s.playing);
  const tool = usePianoRoll((s) => s.tool);
  const snap = usePianoRoll((s) => s.snap);
  const scrollTick = usePianoRoll((s) => s.scrollTick);
  const pxPerTick = usePianoRoll((s) => s.pxPerTick);
  const scrollY = usePianoRoll((s) => s.scrollY);
  const rowHeight = usePianoRoll((s) => s.rowHeight);
  const selected = usePianoRoll((s) => s.selected);

  const view: RollView = { scrollTick, pxPerTick, scrollY, rowHeight };
  const notes = pattern?.notes[channelId] ?? EMPTY;
  const color = channels.find((channel) => channel.id === channelId)?.color ?? "#fff";
  const ghosts = channels
    .filter((channel) => channel.id !== channelId)
    .map((channel) => ({ color: channel.color, notes: pattern?.notes[channel.id] ?? EMPTY }));
  const loopEnd = pattern ? patternLength(pattern) : 0;

  const drag = useRef<Drag | null>(null);
  const wheel = useRef({ gesture: "", at: 0 });
  const box = useRef<HTMLDivElement>(null);

  const { ref: gridRef } = useCanvas((ctx, size) =>
    drawGrid(ctx, size, { view, notes, color, selected, ghosts, loopEnd }),
  );
  const { ref: overlayRef, redraw: redrawOverlay } = useCanvas((ctx, size) => {
    const current = drag.current;
    drawOverlay(
      ctx,
      size,
      view,
      playheadTick(patternId),
      current?.kind === "marquee" ? current.rect : null,
    );
  });
  useFrame(() => redrawOverlay(), playing);

  const snapFor = (event: { altKey: boolean }): Snap => (event.altKey ? "none" : snap);
  const audition = (pitch: number, velocity?: number) =>
    engine.audition(channelId, pitch, velocity);

  function erase(x: number, y: number, gesture: string) {
    const hit = noteAt(notes, view, x, y);
    if (hit) edit((p) => removeNotes(p, patternId, channelId, new Set([hit.note.id])), gesture);
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    const gesture = createId();
    const tick = xToTick(view, x);
    const pitch = yToPitch(view, y);

    if (event.button === 2 || tool === "delete") {
      drag.current = { kind: "erase", gesture };
      erase(x, y, gesture);
      return;
    }

    const hit = noteAt(notes, view, x, y);
    if (event.ctrlKey || event.metaKey || (tool === "select" && !hit)) {
      drag.current = {
        kind: "marquee",
        additive: event.shiftKey,
        rect: { x0: x, y0: y, x1: x, y1: y },
      };
      return;
    }

    if (hit) {
      const { note } = hit;
      const inSelection = selected.has(note.id);
      if (tool === "select" && event.shiftKey) {
        const next = new Set(selected);
        if (inSelection) next.delete(note.id);
        else next.add(note.id);
        setSelection(next);
        return;
      }
      if (!inSelection) setSelection(tool === "select" ? new Set([note.id]) : NO_SELECTION);
      usePianoRoll.setState({ lastLength: note.length, lastVelocity: note.velocity });
      const group = inSelection ? notes.filter((n) => selected.has(n.id)) : [note];
      drag.current =
        hit.zone === "end"
          ? { kind: "resize", gesture, anchor: note, group, startTick: tick, length: note.length }
          : {
              kind: "move",
              gesture,
              anchor: note,
              group,
              startTick: tick,
              startPitch: pitch,
              dTick: 0,
              dPitch: 0,
              pitch: note.pitch,
            };
      audition(note.pitch, note.velocity);
      return;
    }

    // Draw or paint on empty space: place a note with the last-used length.
    const { lastLength, lastVelocity } = usePianoRoll.getState();
    const note: Note = {
      id: createId(),
      tick: snapTick(tick, snapFor(event)),
      length: lastLength,
      pitch,
      velocity: lastVelocity,
    };
    edit((p) => addNotes(p, patternId, channelId, [note]), gesture);
    setSelection(NO_SELECTION);
    audition(pitch, lastVelocity);
    drag.current =
      tool === "paint"
        ? { kind: "paint", gesture, origin: note.tick, done: new Set([note.tick]) }
        : {
            kind: "move",
            gesture,
            anchor: note,
            group: [note],
            startTick: tick,
            startPitch: pitch,
            dTick: 0,
            dPitch: 0,
            pitch,
          };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const { x, y } = point(event);
    const current = drag.current;
    if (!current) {
      const hit = noteAt(notes, view, x, y);
      event.currentTarget.style.cursor = hit
        ? hit.zone === "end"
          ? "ew-resize"
          : "grab"
        : CURSOR[tool];
      return;
    }
    const delta = snapTick(
      xToTick(view, x) - ("startTick" in current ? current.startTick : 0),
      snapFor(event),
      "round",
    );

    switch (current.kind) {
      case "move": {
        const dPitch = yToPitch(view, y) - current.startPitch;
        if (delta === current.dTick && dPitch === current.dPitch) return;
        current.dTick = delta;
        current.dPitch = dPitch;
        const changes = moveNotes(current.group, delta, dPitch);
        edit((p) => updateNotes(p, patternId, channelId, changes), current.gesture);
        const pitch = changes.get(current.anchor.id)?.pitch ?? current.pitch;
        if (pitch !== current.pitch) audition(pitch, current.anchor.velocity);
        current.pitch = pitch;
        return;
      }
      case "resize": {
        const min = SNAP_TICKS[snapFor(event)];
        const length = Math.max(min, current.anchor.length + delta);
        if (length === current.length) return;
        current.length = length;
        const changes = resizeNotes(current.group, length - current.anchor.length, min);
        edit((p) => updateNotes(p, patternId, channelId, changes), current.gesture);
        return;
      }
      case "paint": {
        const { lastLength, lastVelocity } = usePianoRoll.getState();
        const tick =
          current.origin +
          Math.floor((xToTick(view, x) - current.origin) / lastLength) * lastLength;
        if (tick < 0 || current.done.has(tick)) return;
        current.done.add(tick);
        const pitch = yToPitch(view, y);
        const note: Note = {
          id: createId(),
          tick,
          length: lastLength,
          pitch,
          velocity: lastVelocity,
        };
        edit((p) => addNotes(p, patternId, channelId, [note]), current.gesture);
        audition(pitch, lastVelocity);
        return;
      }
      case "erase":
        erase(x, y, current.gesture);
        return;
      case "marquee":
        current.rect = { ...current.rect, x1: x, y1: y };
        redrawOverlay();
        return;
    }
  }

  function onPointerUp() {
    const current = drag.current;
    drag.current = null;
    if (current?.kind === "resize") usePianoRoll.setState({ lastLength: current.length });
    if (current?.kind === "marquee") {
      const ids = notesInRect(notes, view, current.rect);
      setSelection(current.additive ? new Set([...selected, ...ids]) : ids);
      redrawOverlay();
    }
  }

  // Native listener: React's wheel handler is passive, and Ctrl+wheel must not zoom the page.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (event.ctrlKey || event.metaKey) {
      usePianoRoll.setState(zoomAt(view, event.deltaY < 0 ? 1.15 : 1 / 1.15, x, ZOOM_LIMITS));
    } else if (event.altKey) {
      const hit = noteAt(notes, view, x, y);
      if (!hit) return;
      const group = selected.has(hit.note.id)
        ? notes.filter((n) => selected.has(n.id))
        : [hit.note];
      const step = event.deltaY < 0 ? 0.05 : -0.05;
      const changes = new Map(
        group.map((n) => [n.id, { velocity: Math.min(1, Math.max(0, n.velocity + step)) }]),
      );
      const now = performance.now();
      if (now - wheel.current.at > WHEEL_GESTURE_MS) wheel.current.gesture = createId();
      wheel.current.at = now;
      edit((p) => updateNotes(p, patternId, channelId, changes), wheel.current.gesture);
    } else if (event.shiftKey) {
      const dx = event.deltaX || event.deltaY;
      usePianoRoll.setState({ scrollTick: Math.max(0, scrollTick + dx / pxPerTick) });
    } else {
      scrollRows(event.deltaY, rect.height);
      if (event.deltaX !== 0)
        usePianoRoll.setState({ scrollTick: Math.max(0, scrollTick + event.deltaX / pxPerTick) });
    }
  });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const listener = (event: WheelEvent) => onWheel(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);

  return (
    <div ref={box} className="relative size-full overflow-hidden">
      <canvas ref={gridRef} className="absolute inset-0 size-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 size-full touch-none"
        style={{ cursor: CURSOR[tool] }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
