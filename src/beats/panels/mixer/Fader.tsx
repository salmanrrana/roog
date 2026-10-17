import { type KeyboardEvent, type PointerEvent, useEffect, useEffectEvent, useRef } from "react";
import { createId } from "@/core/ids";
import { type ParamSpec, normToParam, paramToNorm } from "@/core/params";

interface FaderProps {
  readonly spec: ParamSpec;
  readonly value: number;
  /** Same `gesture` for a whole drag or wheel burst, so it lands as one undo step. */
  readonly onChange: (value: number, gesture: string) => void;
  readonly label: string;
}

/** Linear gain → "+1.9", "-6.0", "-inf" (dB). */
export function formatDb(gain: number): string {
  if (gain <= 0.00001) return "-inf";
  const db = 20 * Math.log10(gain);
  return `${db > 0.05 ? "+" : ""}${db.toFixed(1)}`;
}

/** dB marks drawn beside the groove. */
const MARKS = [0, -6, -12, -24] as const;

/**
 * Vertical console fader. Drag anywhere on it (relative, Shift = fine), wheel,
 * arrow/Page keys, double-click to reset. Position is linear in gain, so unity
 * sits at 80% of the travel with headroom above it.
 */
export function Fader({ spec, value, onChange, label }: FaderProps) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lastY: number; norm: number; height: number; gesture: string } | null>(
    null,
  );
  const wheel = useRef({ gesture: "", at: 0 });
  const norm = paramToNorm(spec, value);

  function commit(nextNorm: number, gesture: string) {
    const next = normToParam(spec, nextNorm);
    if (next !== value) onChange(next, gesture);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const height = Math.max(40, event.currentTarget.getBoundingClientRect().height);
    drag.current = { lastY: event.clientY, norm, height, gesture: createId() };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    state.norm += ((state.lastY - event.clientY) / state.height) * (event.shiftKey ? 0.2 : 1);
    state.lastY = event.clientY;
    commit(state.norm, state.gesture);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowUp: 0.01,
      ArrowRight: 0.01,
      ArrowDown: -0.01,
      ArrowLeft: -0.01,
      PageUp: 0.1,
      PageDown: -0.1,
    };
    const move = moves[event.key];
    if (move !== undefined) commit(norm + move * (event.shiftKey ? 0.2 : 1), createId());
    else if (event.key === "Home") commit(0, createId());
    else if (event.key === "End") commit(1, createId());
    else return;
    event.preventDefault();
  }

  // Native listener: React's onWheel is passive and can't stop the page scrolling.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    const now = performance.now();
    if (now - wheel.current.at > 400) wheel.current.gesture = createId();
    wheel.current.at = now;
    commit(norm - Math.sign(event.deltaY) * (event.shiftKey ? 0.004 : 0.02), wheel.current.gesture);
  });
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const listener = (event: WheelEvent) => onWheel(event);
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, []);

  return (
    <div
      ref={element}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={`${formatDb(value)} dB`}
      title={`${label}: ${formatDb(value)} dB`}
      className="relative h-full w-7 cursor-ns-resize touch-none rounded-sm"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(spec.default, createId())}
      onKeyDown={onKeyDown}
    >
      {/* Travel area inset by half the cap height so the cap never leaves the box. */}
      <div className="absolute inset-x-0 top-2 bottom-2">
        {MARKS.map((db) => (
          <span
            key={db}
            aria-hidden="true"
            className={`absolute left-0 h-px ${db === 0 ? "w-full bg-ink-dim" : "w-1.5 bg-line"}`}
            style={{ bottom: `${paramToNorm(spec, 10 ** (db / 20)) * 100}%` }}
          />
        ))}
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-well shadow-[inset_0_0_0_1px_var(--color-line)]" />
        <div
          className="absolute left-1/2 h-4 w-6 -translate-x-1/2 translate-y-1/2 rounded-[2px] border border-ink-dim bg-panel-2 shadow-md shadow-black/60"
          style={{ bottom: `${norm * 100}%` }}
        >
          <div className="mx-auto mt-[6px] h-0.5 w-4 bg-ink" />
        </div>
      </div>
    </div>
  );
}
