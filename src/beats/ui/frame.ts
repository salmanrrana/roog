import { useEffect, useEffectEvent } from "react";

type FrameCallback = (now: number) => void;

const callbacks = new Set<FrameCallback>();
let handle = 0;

function loop(now: number) {
  for (const callback of callbacks) callback(now);
  handle = callbacks.size > 0 ? requestAnimationFrame(loop) : 0;
}

/**
 * Run `callback` on every animation frame until the returned function is called.
 * The whole app shares one requestAnimationFrame loop, which stops when idle.
 * This is where playheads and meters are drawn: never through React state.
 */
export function onFrame(callback: FrameCallback): () => void {
  callbacks.add(callback);
  if (handle === 0) handle = requestAnimationFrame(loop);
  return () => {
    callbacks.delete(callback);
  };
}

/** React binding for onFrame. Always calls the latest `callback` without resubscribing. */
export function useFrame(callback: FrameCallback, enabled = true): void {
  const tick = useEffectEvent(callback);
  useEffect(() => (enabled ? onFrame((now) => tick(now)) : undefined), [enabled]);
}
