import { type PointerEvent, useRef } from "react";
import { updateNotes } from "@/core/commands";
import { createId } from "@/core/ids";
import type { Note } from "@/core/schema";
import { edit } from "@/state/project-store";
import { useCanvas } from "@/ui/canvas";
import { tickToX } from "@/ui/timeline";
import { drawVelocity } from "./draw";
import { usePianoRoll } from "./store";

/** Extra pixels on each side of a note that still count as touching it. */
const REACH = 4;

interface Drag {
  readonly gesture: string;
  lastX: number;
  /** Pointer position and value for the "Vel N" readout. */
  x: number;
  y: number;
  velocity: number;
}

/**
 * Velocity stems under the grid. Drag to draw velocities across every note the
 * pointer passes over, anywhere along its length (only selected notes when there
 * is a selection). One undo step per drag; a "Vel N" readout follows the pointer.
 */
export function VelocityLane(props: {
  readonly patternId: string;
  readonly channelId: string;
  readonly notes: readonly Note[];
  readonly color: string;
}) {
  const { patternId, channelId, notes, color } = props;
  const scrollTick = usePianoRoll((s) => s.scrollTick);
  const pxPerTick = usePianoRoll((s) => s.pxPerTick);
  const selected = usePianoRoll((s) => s.selected);
  const view = { scrollTick, pxPerTick, scrollY: 0, rowHeight: 1 };
  const drag = useRef<Drag | null>(null);

  const { ref: laneRef, redraw } = useCanvas((ctx, size) =>
    drawVelocity(ctx, size, view, notes, color, selected, drag.current),
  );

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const velocity = Math.round(Math.min(1, Math.max(0, 1 - y / rect.height)) * 100) / 100;
    const from = Math.min(x, current.lastX);
    const to = Math.max(x, current.lastX);
    Object.assign(current, { lastX: x, x, y, velocity });
    const changes = new Map<string, { velocity: number }>();
    for (const note of notes) {
      const left = tickToX(view, note.tick) - REACH;
      const right = tickToX(view, note.tick + note.length) + REACH;
      if (right < from || left > to || note.velocity === velocity) continue;
      if (selected.size > 0 && !selected.has(note.id)) continue;
      changes.set(note.id, { velocity });
    }
    if (changes.size > 0)
      edit((p) => updateNotes(p, patternId, channelId, changes), current.gesture);
    redraw();
  }

  function end() {
    drag.current = null;
    redraw();
  }

  return (
    <canvas
      ref={laneRef}
      aria-label="Velocity"
      className="size-full cursor-ns-resize touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        drag.current = { gesture: createId(), lastX: x, x, y: 0, velocity: 0 };
        paint(event);
      }}
      onPointerMove={paint}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
