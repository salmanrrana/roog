import { type PointerEvent, useRef } from "react";
import { engine } from "@/engine";
import { useCanvas } from "@/ui/canvas";
import { drawKeyboard } from "./draw";
import { yToPitch } from "./geometry";
import { scrollRows, usePianoRoll } from "./store";

/** The key column. Click (or drag across) keys to audition the channel. */
export function Keyboard({ channelId }: { channelId: string }) {
  const scrollY = usePianoRoll((s) => s.scrollY);
  const rowHeight = usePianoRoll((s) => s.rowHeight);
  const view = { scrollTick: 0, pxPerTick: 1, scrollY, rowHeight };
  const held = useRef<number | null>(null);

  const { ref: keysRef, redraw } = useCanvas((ctx, size) =>
    drawKeyboard(ctx, size, view, held.current),
  );

  function press(event: PointerEvent<HTMLCanvasElement>) {
    const pitch = yToPitch(view, event.clientY - event.currentTarget.getBoundingClientRect().top);
    if (pitch === held.current) return;
    held.current = pitch;
    engine.audition(channelId, pitch);
    redraw();
  }

  function release() {
    held.current = null;
    redraw();
  }

  return (
    <canvas
      ref={keysRef}
      className="size-full cursor-pointer touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        press(event);
      }}
      onPointerMove={(event) => {
        if (held.current !== null) press(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onWheel={(event) => scrollRows(event.deltaY, event.currentTarget.clientHeight)}
    />
  );
}
