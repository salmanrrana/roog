import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { createId } from "@/core/ids";
import { type ParamSpec, formatParam, normToParam, paramToNorm } from "@/core/params";

interface KnobProps {
  readonly spec: ParamSpec;
  readonly value: number;
  /**
   * New value. `gesture` stays the same for one drag (or a burst of wheel ticks),
   * so passing it to `edit(recipe, gesture)` makes the whole drag one undo step.
   */
  readonly onChange: (value: number, gesture: string) => void;
  /** Visible caption; defaults to spec.label. */
  readonly label?: string;
  /** Accessible name; defaults to `label` (e.g. "Kick pan" while the caption says "Pan"). */
  readonly name?: string;
  readonly format?: (value: number) => string;
  /** Diameter in px. */
  readonly size?: number;
  /** Arc color (any CSS color). Ink by default; the channel color inside its settings. */
  readonly color?: string;
  /**
   * stack: caption above, value below (settings, effects, mixer pan).
   * inline: dial with caption and value to its right (header).
   * bare: dial only, for dense rows with column headers; a "<label> <value>" bubble
   * shows to the right on hover, keyboard focus and drag.
   */
  readonly layout?: "stack" | "inline" | "bare";
}

const SWEEP = 270;
const START = -135;

/** Point on the knob face; 0 degrees is straight up. */
function polar(angle: number, radius: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: 18 + radius * Math.cos(rad), y: 18 + radius * Math.sin(rad) };
}

function arc(from: number, to: number): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const start = polar(a, 14);
  const end = polar(b, 14);
  return `M ${start.x} ${start.y} A 14 14 0 ${b - a > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

/**
 * The one knob. Drag up/down (Shift = fine), wheel, arrow keys, double-click to
 * reset. Bipolar ranges (like pan) draw their arc from zero. Works for every
 * ParamSpec, including enums (snaps to options).
 */
export function Knob({
  spec,
  value,
  onChange,
  label = spec.label,
  name = label,
  format = (v) => formatParam(spec, v),
  size = 36,
  color = "var(--color-ink)",
  layout = "stack",
}: KnobProps) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ lastY: number; norm: number; gesture: string } | null>(null);
  const wheel = useRef({ gesture: "", at: 0 });
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyFocused, setKeyFocused] = useState(false);
  const norm = paramToNorm(spec, value);
  const zero = spec.min < 0 && spec.max > 0 ? paramToNorm(spec, 0) : 0;
  const keyStep = spec.options ? 1 / Math.max(1, spec.options.length - 1) : 0.05;

  function commit(nextNorm: number, gesture: string) {
    const next = normToParam(spec, nextNorm);
    if (next !== value) onChange(next, gesture);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { lastY: event.clientY, norm, gesture: createId() };
    setActive(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    state.norm += (state.lastY - event.clientY) / (event.shiftKey ? 1000 : 200);
    state.lastY = event.clientY;
    commit(state.norm, state.gesture);
  }

  function endDrag() {
    drag.current = null;
    setActive(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey && !spec.options ? keyStep / 5 : keyStep;
    const moves: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
    };
    const move = moves[event.key];
    if (move !== undefined) commit(norm + move, createId());
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
    commit(
      norm - Math.sign(event.deltaY) * (event.shiftKey ? keyStep / 5 : keyStep),
      wheel.current.gesture,
    );
  });
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const listener = (event: WheelEvent) => onWheel(event);
    node.addEventListener("wheel", listener, { passive: false });
    return () => node.removeEventListener("wheel", listener);
  }, []);

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    setKeyFocused(event.currentTarget.matches(":focus-visible"));
  }

  const angle = START + SWEEP * norm;
  const text = format(value);
  const tip = polar(angle, 10);
  const title = `${label}: ${text} · double-click to reset`;
  const dial = (
    <div
      ref={element}
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={text}
      className="cursor-ns-resize touch-none rounded-full select-none"
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onChange(spec.default, createId())}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={() => setKeyFocused(false)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <svg viewBox="0 0 36 36" className="size-full overflow-visible">
        <circle cx="18" cy="18" r="11" className="fill-panel-2 stroke-line" strokeWidth="2" />
        <path
          d={arc(START, START + SWEEP)}
          className="stroke-line"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        {norm !== zero && (
          <path
            d={arc(START + SWEEP * zero, angle)}
            stroke={color}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <line
          x1="18"
          y1="18"
          x2={tip.x}
          y2={tip.y}
          className="stroke-ink"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );

  if (layout === "inline") {
    return (
      <div className="flex items-center gap-1.5" title={title}>
        {dial}
        <div className="flex flex-col whitespace-nowrap">
          <span className="caption">{label}</span>
          <span className="font-mono text-xs text-ink tabular-nums">{text}</span>
        </div>
      </div>
    );
  }
  if (layout === "bare") {
    return (
      <div className="relative w-min" title={title}>
        {dial}
        {(hovered || keyFocused || active) && (
          <span className="pointer-events-none absolute top-1/2 left-full z-20 ml-1 -translate-y-1/2 rounded-xs border border-line bg-well px-1 font-mono text-2xs whitespace-nowrap text-ink">
            {label} {text}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex min-w-11 flex-col items-center gap-0.5 whitespace-nowrap" title={title}>
      <span className="caption">{label}</span>
      {dial}
      <span className="font-mono text-2xs text-ink tabular-nums">{text}</span>
    </div>
  );
}
