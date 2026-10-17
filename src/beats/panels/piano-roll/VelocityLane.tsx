import { type PointerEvent, useRef } from "react";
import { updateNotes } from "@/core/commands";
import { createId } from "@/core/ids";
import type { Note } from "@/core/schema";
import { edit } from "@/state/project-store";
import { useCanvas } from "@/ui/canvas";
import { tickToX } from "@/ui/timeline";
import { drawVelocity } from "./draw";
import { usePianoRoll } from "./store";

const REACH = 4;

/**
 * Velocity stems under the grid. Drag to draw velocities across every note the
 * pointer passes (only selected notes when there is a selection). One undo step per drag.
 */
export function VelocityLane(props: {
  patternId: string;
  channelId: string;
  notes: readonly Note[];
  color: string;
}) {
  const { patternId, channelId, notes, color } = props;
  const scrollTick = usePianoRoll((s) => s.scrollTick);
  const pxPerTick = usePianoRoll((s) => s.pxPerTick);
  const selected = usePianoRoll((s) => s.selected);
  const view = { scrollTick, pxPerTick, scrollY: 0, rowHeight: 1 };
  const drag = useRef<{ gesture: string; lastX: number } | null>(null);

  const { ref: laneRef } = useCanvas((ctx, size) =>
    drawVelocity(ctx, size, view, notes, color, selected),
  );

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const velocity =
      Math.round(Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)) * 100) /
      100;
    const from = Math.min(x, current.lastX) - REACH;
    const to = Math.max(x, current.lastX) + REACH;
    current.lastX = x;
    const changes = new Map<string, { velocity: number }>();
    for (const note of notes) {
      const noteX = tickToX(view, note.tick);
      if (noteX < from || noteX > to || note.velocity === velocity) continue;
      if (selected.size > 0 && !selected.has(note.id)) continue;
      changes.set(note.id, { velocity });
    }
    if (changes.size > 0)
      edit((p) => updateNotes(p, patternId, channelId, changes), current.gesture);
  }

  return (
    <canvas
      ref={laneRef}
      className="size-full cursor-ns-resize touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          gesture: createId(),
          lastX: event.clientX - event.currentTarget.getBoundingClientRect().left,
        };
        paint(event);
      }}
      onPointerMove={paint}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
}
