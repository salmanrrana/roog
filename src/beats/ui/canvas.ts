import { useLayoutEffect, useState } from "react";

export interface CanvasSize {
  /** CSS pixels. Draw in these units; the context is already scaled for the device. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export type Draw = (ctx: CanvasRenderingContext2D, size: CanvasSize) => void;

export interface CanvasSurface {
  /** Pass to <canvas ref={...}>. Give the canvas a CSS size (e.g. `size-full`). */
  readonly ref: (canvas: HTMLCanvasElement | null) => void;
  /** Schedule a repaint (coalesced to one per frame). For changes React doesn't see, like hover kept in a ref. */
  readonly redraw: () => void;
  /** Swap the draw function and repaint. useCanvas calls this after every render. */
  readonly paintWith: (draw: Draw) => void;
}

function createSurface(): CanvasSurface {
  let canvas: HTMLCanvasElement | null = null;
  let frame = 0;
  let draw: Draw = () => undefined;
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => redraw());

  function paint() {
    frame = 0;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw(ctx, { width, height, dpr });
  }

  function redraw() {
    if (frame === 0) frame = requestAnimationFrame(paint);
  }

  function ref(next: HTMLCanvasElement | null) {
    if (canvas) observer?.unobserve(canvas);
    canvas = next;
    if (canvas) {
      observer?.observe(canvas);
      redraw();
    } else if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function paintWith(next: Draw) {
    draw = next;
    redraw();
  }

  return { ref, redraw, paintWith };
}

/**
 * A device-pixel-ratio aware canvas that repaints after every render of the
 * component and on resize. Keep the component's subscriptions narrow so it only
 * re-renders when the data it draws changes; draw per-frame overlays (playhead)
 * on a second canvas with useFrame instead.
 *
 *   const { ref: gridRef, redraw } = useCanvas((ctx, { width, height }) => { ... });
 *   return <canvas ref={gridRef} className="size-full" />;
 *
 * Destructure it: the React Compiler lint misreads `surface.ref` as a ref read.
 */
export function useCanvas(draw: Draw): CanvasSurface {
  const [surface] = useState(createSurface);
  useLayoutEffect(() => surface.paintWith(draw));
  return surface;
}
