import { useState } from "react";
import { useCanvas } from "./canvas";
import { useFrame } from "./frame";
import { themeColors } from "./theme";

interface MeterProps {
  /** Returns the peak since the last call, e.g. `() => engine.readMeter(trackId)`. */
  readonly read: () => number;
  /** Size it with classes; it fills vertically when taller than wide. */
  readonly className?: string;
  /** Accessible name and tooltip, e.g. "Master level". Without it the meter is hidden from screen readers. */
  readonly title?: string;
}

const FLOOR_DB = -60;
const HOLD_MS = 1000;
const CLIP_MS = 2000;
/** Peaks above -1 dBFS light the clip segment; the red band starts at the same level. */
const CLIP_DB = -1;
const CLIP_LEVEL = 10 ** (CLIP_DB / 20);
/** Length of the clip segment at the loud end, in CSS px. */
const CLIP_PX = 3;

/** dB → 0..1 position on the meter. */
function position(db: number): number {
  return Math.min(1, Math.max(0, 1 - db / FLOOR_DB));
}

function toDb(level: number): number {
  return level > 0 ? 20 * Math.log10(level) : FLOOR_DB;
}

/**
 * Meter state outside React: displayed level with fall-off, a 1 s peak hold, and a
 * clip flag held 2 s after the last raw read >= 1.
 */
function createMeterState() {
  let level = 0;
  let hold = 0;
  let holdAt = 0;
  let clipAt = -Infinity;
  let clipping = false;
  return {
    get level() {
      return level;
    },
    get hold() {
      return hold;
    },
    get clipping() {
      return clipping;
    },
    /** Fold in a new peak. Returns true when anything drawn changed. */
    push(peak: number, now: number): boolean {
      const next = Math.max(peak, level * 0.9);
      const settled = next < 0.0005 ? 0 : next;
      let nextHold = hold;
      if (settled >= hold || now - holdAt > HOLD_MS) {
        nextHold = settled;
        holdAt = now;
      }
      if (peak > CLIP_LEVEL) clipAt = now;
      const nextClipping = now - clipAt < CLIP_MS;
      const changed = settled !== level || nextHold !== hold || nextClipping !== clipping;
      level = settled;
      hold = nextHold;
      clipping = nextClipping;
      return changed;
    },
  };
}

/**
 * A level meter drawn on canvas outside React. Fill zones like hardware: acid up to
 * -6 dB, amber -6..-1 dB, rec above -1 dB; a 2px ink peak-hold tick; and a clip
 * segment at the loud end that stays red 2 s after the last clip.
 */
export function Meter({ read, className = "", title }: MeterProps) {
  const [state] = useState(createMeterState);
  const { ref: canvasRef, redraw } = useCanvas((ctx, { width, height }) => {
    const colors = themeColors();
    const vertical = height >= width;
    const length = vertical ? height : width;
    const span = length - CLIP_PX;
    // Paint a band from a to b (0..1 of the span, 0 = silent end).
    const band = (a: number, b: number, color: string) => {
      if (b <= a) return;
      ctx.fillStyle = color;
      if (vertical) ctx.fillRect(0, CLIP_PX + span * (1 - b), width, span * (b - a));
      else ctx.fillRect(span * a, 0, span * (b - a), height);
    };
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, width, height);
    for (const db of [-12, -6]) band(position(db) - 1 / span, position(db), colors.line);

    const fill = position(toDb(state.level));
    const amberAt = position(-6);
    const recAt = position(CLIP_DB);
    band(0, Math.min(fill, amberAt), colors.acid);
    band(amberAt, Math.min(fill, recAt), colors.amber);
    band(recAt, fill, colors.rec);
    if (state.hold > 0) {
      const at = position(toDb(state.hold));
      band(Math.max(0, at - 2 / span), at, colors.ink);
    }

    ctx.fillStyle = state.clipping ? colors.rec : colors.line;
    if (vertical) ctx.fillRect(0, 0, width, CLIP_PX);
    else ctx.fillRect(width - CLIP_PX, 0, CLIP_PX, height);
  });

  useFrame(() => {
    if (state.push(read(), performance.now())) redraw();
  });

  return title ? (
    <canvas ref={canvasRef} className={className} title={title} role="img" aria-label={title} />
  ) : (
    <canvas ref={canvasRef} className={className} aria-hidden="true" />
  );
}
