import { type PointerEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { setBpm } from "@/core/commands";
import { createId } from "@/core/ids";
import { MAX_BPM, MIN_BPM } from "@/core/timing";
import { edit, useProjectStore } from "@/state/project-store";

/** Pixels of vertical drag on the caption per BPM step. */
const DRAG_PX = 4;
const WHEEL_BURST_MS = 400;

/**
 * Tempo field. Type and press Enter (blank or junk reverts; out of range clamps and
 * flashes amber), arrow keys (Shift = 10), wheel over the field (Shift = 10), or drag
 * the "BPM" caption up/down (Shift = fine). Each wheel burst or drag is one undo step.
 */
export function BpmField() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const [draft, setDraft] = useState<string | null>(null);
  const [clamped, setClamped] = useState(false);
  const field = useRef<HTMLLabelElement>(null);
  const wheel = useRef({ gesture: "", at: 0 });
  const cancelled = useRef(false);
  const drag = useRef<{ startY: number; start: number; gesture: string } | null>(null);

  useEffect(() => {
    if (!clamped) return;
    const timer = setTimeout(() => setClamped(false), 1000);
    return () => clearTimeout(timer);
  }, [clamped]);

  function commit() {
    if (cancelled.current) cancelled.current = false;
    else if (draft !== null && draft.trim() !== "") {
      const typed = Number(draft);
      if (Number.isFinite(typed)) {
        if (typed < MIN_BPM || typed > MAX_BPM) setClamped(true);
        edit((p) => setBpm(p, typed));
      }
    }
    setDraft(null);
  }

  // Native listener: React's onWheel is passive and can't stop the page scrolling.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    const now = performance.now();
    if (now - wheel.current.at > WHEEL_BURST_MS) wheel.current.gesture = createId();
    wheel.current.at = now;
    const step = -Math.sign(event.deltaY) * (event.shiftKey ? 10 : 1);
    edit((p) => setBpm(p, Math.round(p.bpm) + step), wheel.current.gesture);
  });
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    const listener = (event: WheelEvent) => onWheel(event);
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, []);

  function onDragStart(event: PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, start: bpm, gesture: createId() };
  }

  function onDragMove(event: PointerEvent<HTMLSpanElement>) {
    const state = drag.current;
    if (!state) return;
    const steps = (state.startY - event.clientY) / DRAG_PX;
    const next = state.start + steps * (event.shiftKey ? 0.25 : 1);
    edit((p) => setBpm(p, event.shiftKey ? next : Math.round(next)), state.gesture);
  }

  return (
    <label
      ref={field}
      title={`Tempo ${MIN_BPM}–${MAX_BPM} BPM · wheel or drag to change`}
      className={`flex h-7 items-center gap-1.5 rounded-sm border bg-well px-2 transition-colors focus-within:border-focus ${clamped ? "border-amber" : "border-line"}`}
    >
      <span
        className="caption cursor-ns-resize touch-none select-none"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        BPM
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label="Tempo (BPM)"
        className="w-12 bg-transparent font-mono text-sm text-ink tabular-nums outline-none focus-visible:outline-none"
        value={draft ?? String(bpm)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          const nudge = { ArrowUp: 1, ArrowDown: -1 }[event.key];
          if (nudge !== undefined) {
            event.preventDefault();
            edit(
              (p) => setBpm(p, Math.round(p.bpm) + nudge * (event.shiftKey ? 10 : 1)),
              "bpm-nudge",
            );
          } else if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
