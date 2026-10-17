import { useCanvas } from "@/ui/canvas";
import { drawRuler } from "./draw";
import { usePianoRoll } from "./store";

/** Bar ruler above the grid; the hot marker is where the pattern loops. */
export function Ruler({ loopEnd }: { loopEnd: number }) {
  const scrollTick = usePianoRoll((s) => s.scrollTick);
  const pxPerTick = usePianoRoll((s) => s.pxPerTick);
  const view = { scrollTick, pxPerTick, scrollY: 0, rowHeight: 1 };
  const { ref: rulerRef } = useCanvas((ctx, size) => drawRuler(ctx, size, view, loopEnd));
  return <canvas ref={rulerRef} className="size-full" />;
}
