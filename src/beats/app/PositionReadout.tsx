import { useRef } from "react";
import { BAR_TICKS, BEAT_TICKS } from "@/core/timing";
import { engine } from "@/engine";
import { useUiStore } from "@/state/ui-store";
import { useFrame } from "@/ui/frame";

/** "bar.beat" while playing, written straight to the DOM each frame; "1.1" dimmed when stopped. */
export function PositionReadout() {
  const playing = useUiStore((s) => s.playing);
  const text = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    const node = text.current;
    const head = engine.getPlayhead();
    if (!node || !head) return;
    const bar = Math.floor(head.tick / BAR_TICKS) + 1;
    const beat = Math.floor((head.tick % BAR_TICKS) / BEAT_TICKS) + 1;
    const next = `${bar}.${beat}`;
    if (node.textContent !== next) node.textContent = next;
  }, playing);

  return (
    <span
      ref={text}
      // Remount on play/stop so React resets the text that useFrame overwrote.
      key={String(playing)}
      title="Position (bar.beat)"
      className={`hidden w-10 font-mono text-xs tabular-nums xl:inline ${playing ? "text-ink" : "text-ink-dim"}`}
    >
      1.1
    </span>
  );
}
