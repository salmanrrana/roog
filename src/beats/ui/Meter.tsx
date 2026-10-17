import { useState } from "react";
import { useCanvas } from "./canvas";
import { useFrame } from "./frame";
import { themeColors } from "./theme";

interface MeterProps {
  /** Returns the peak since the last call, e.g. `() => engine.readMeter(trackId)`. */
  readonly read: () => number;
  /** Size it with classes; it fills vertically when taller than wide. */
  readonly className?: string;
}

const FLOOR_DB = -60;

/** Displayed level with a smooth fall-off. Lives outside React state on purpose. */
function createLevel() {
  let level = 0;
  return {
    get value() {
      return level;
    },
    /** Fold in a new peak. Returns true when the displayed level changed. */
    push(peak: number): boolean {
      const next = Math.max(peak, level * 0.9);
      const settled = next < 0.0005 ? 0 : next;
      if (settled === level) return false;
      level = settled;
      return true;
    },
  };
}

/** A level meter repainted on canvas every frame, outside React (dB scale, red at 0 dBFS). */
export function Meter({ read, className = "" }: MeterProps) {
  const [level] = useState(createLevel);
  const { ref: canvasRef, redraw } = useCanvas((ctx, { width, height }) => {
    const colors = themeColors();
    const db = level.value > 0 ? 20 * Math.log10(level.value) : FLOOR_DB;
    const fill = Math.min(1, Math.max(0, 1 - db / FLOOR_DB));
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = level.value >= 1 ? colors.rec : colors.acid;
    if (height >= width) ctx.fillRect(0, height * (1 - fill), width, height * fill);
    else ctx.fillRect(0, 0, width * fill, height);
  });

  useFrame(() => {
    if (level.push(read())) redraw();
  });

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
