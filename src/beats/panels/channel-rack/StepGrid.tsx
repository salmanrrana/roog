import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { findPattern, hasStep, setStep } from "@/core/commands";
import { DEFAULT_STEPS } from "@/core/defaults";
import { createId } from "@/core/ids";
import type { Channel, Note, Pattern } from "@/core/schema";
import { patternPlayheadTick } from "@/core/schedule";
import { STEP_TICKS } from "@/core/timing";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, useUiStore } from "@/state/ui-store";
import { useCanvas } from "@/ui/canvas";
import { useFrame } from "@/ui/frame";
import { CANVAS_FONT, type ThemeColor, themeColors } from "@/ui/theme";
import {
  type Cell,
  HEADER_H,
  ROW_H,
  RULER_H,
  cellAt,
  fitCellWidth,
  isStepsOnly,
  litSteps,
  stepsBetween,
} from "./grid";
import { useRackStore } from "./rack-store";

type Colors = Readonly<Record<ThemeColor, string>>;

interface DrawInput {
  readonly channels: readonly Channel[];
  readonly pattern: Pattern | undefined;
  readonly steps: number;
  readonly cellWidth: number;
  readonly selectedId: string | null;
  readonly cursor: Cell | null;
}

/** Paint the beat ruler: bar numbers in bold ink, beat numbers in ink-dim. */
function drawRuler(ctx: CanvasRenderingContext2D, steps: number, cw: number): void {
  const colors = themeColors();
  ctx.font = CANVAS_FONT.label;
  ctx.textBaseline = "middle";
  for (let step = 0; step < steps; step += 4) {
    const bar = step % 16 === 0;
    ctx.fillStyle = bar ? colors.ink : colors["ink-dim"];
    if (bar) {
      ctx.font = CANVAS_FONT.bold;
      ctx.fillStyle = colors["ink-mute"];
      ctx.fillRect(step * cw - 1, 0, 2, RULER_H);
      ctx.fillStyle = colors.ink;
    }
    ctx.fillText(String(bar ? step / 16 + 1 : (step % 16) / 4 + 1), step * cw + 4, RULER_H / 2 + 1);
    if (bar) ctx.font = CANVAS_FONT.label;
  }
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, RULER_H - 1, steps * cw, 1);
}

/**
 * Paint every row: step buttons for plain step rows, a mini note preview for
 * piano-roll rows. Beat and bar lines go on top.
 */
function drawRack(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const colors = themeColors();
  const { steps, cellWidth: cw } = input;
  const width = steps * cw;
  const bottom = input.channels.length * ROW_H;
  const anySolo = input.channels.some((channel) => channel.solo);

  input.channels.forEach((channel, row) => {
    const y = row * ROW_H;
    if (channel.id === input.selectedId) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = colors.ink;
      ctx.fillRect(0, y, width, ROW_H);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, y + ROW_H - 1, width, 1);

    const notes = input.pattern?.notes[channel.id] ?? [];
    // Muted rows, and rows silenced by another channel's solo, draw dimmed.
    ctx.globalAlpha = channel.muted || (anySolo && !channel.solo) ? 0.3 : 1;
    if (isStepsOnly(notes)) drawSteps(ctx, colors, channel.color, litSteps(notes, steps), y, cw);
    else drawPreview(ctx, colors, channel, notes, steps, y, cw);
    ctx.globalAlpha = 1;
  });

  for (let step = 4; step < steps; step += 4) {
    const bar = step % 16 === 0;
    ctx.fillStyle = bar ? colors["ink-mute"] : colors.line;
    ctx.fillRect(step * cw - (bar ? 1 : 0), 0, bar ? 2 : 1, bottom);
  }

  if (input.cursor) {
    ctx.strokeStyle = colors.focus;
    ctx.lineWidth = 2;
    ctx.strokeRect(input.cursor.step * cw + 1, input.cursor.row * ROW_H + 3, cw - 3, ROW_H - 7);
  }
}

/** Step buttons: neutral off cells (every other group of four a touch lighter), lit cells in the channel color by velocity. */
function drawSteps(
  ctx: CanvasRenderingContext2D,
  colors: Colors,
  color: string,
  lit: number[],
  y: number,
  cw: number,
) {
  const base = ctx.globalAlpha;
  lit.forEach((velocity, step) => {
    const x = step * cw + 2;
    const w = cw - 5;
    const h = ROW_H - 9;
    ctx.beginPath();
    ctx.roundRect(x, y + 4, w, h, 2);
    ctx.fillStyle = colors["panel-2"];
    ctx.fill();
    if (Math.floor(step / 4) % 2 === 1) {
      ctx.globalAlpha = base * 0.05;
      ctx.fillStyle = colors.ink;
      ctx.fill();
    }
    if (velocity > 0) {
      ctx.globalAlpha = base * (0.45 + 0.55 * velocity);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = base * 0.5;
      ctx.fillStyle = colors.ink;
      ctx.fillRect(x + 2, y + 5, w - 4, 2);
    } else {
      ctx.globalAlpha = base * 0.6;
      ctx.fillStyle = colors.well;
      ctx.fillRect(x + 1, y + 4 + h - 3, w - 2, 2);
    }
    ctx.globalAlpha = base;
  });
}

/**
 * Mini piano roll: faded empty step cells underneath (so the row still reads as
 * part of the grid), then the notes as bars in the channel color, pitch range
 * fitted to the lane.
 */
function drawPreview(
  ctx: CanvasRenderingContext2D,
  colors: Colors,
  channel: Channel,
  notes: readonly Note[],
  steps: number,
  y: number,
  cw: number,
) {
  const top = y + 4;
  const height = ROW_H - 9;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.4;
  drawSteps(ctx, colors, channel.color, new Array<number>(steps).fill(0), y, cw);
  ctx.globalAlpha = base;
  let low = 127;
  let high = 0;
  for (const note of notes) {
    low = Math.min(low, note.pitch);
    high = Math.max(high, note.pitch);
  }
  const span = Math.max(1, high - low);
  const barH = 3;
  ctx.fillStyle = channel.color;
  for (const note of notes) {
    const x = (note.tick / STEP_TICKS) * cw;
    if (x >= steps * cw) continue;
    const w = Math.max(2, Math.min((note.length / STEP_TICKS) * cw - 1, steps * cw - x));
    const ny = top + 2 + ((high - note.pitch) / span) * (height - barH - 4);
    ctx.fillRect(x + 1, ny, w, barH);
  }
}

interface Drag {
  readonly gesture: string;
  readonly on: boolean;
  readonly row: number;
  step: number;
}

/** Light or clear one step from a fresh store read; auditions newly lit steps. */
function paint(patternId: string, row: number, step: number, on: boolean, gesture: string) {
  const { project } = useProjectStore.getState();
  const channel = project.channels[row];
  const pattern = findPattern(project, patternId);
  if (!channel || !pattern || hasStep(pattern, channel.id, step) === on) return;
  edit((p) => setStep(p, patternId, channel.id, step, on), gesture);
  if (on) engine.audition(channel.id);
}

/**
 * One canvas for every row's steps, under its own beat-ruler canvas that sticks to
 * the top while the rack scrolls (and follows sideways scrolling). Cells scale to the
 * panel width (fitCellWidth); a grid wider than the panel scrolls sideways with a
 * right-edge fade. Left-drag paints (lighting or clearing is decided by the first
 * cell), right-drag erases, a drag stays on its row and is one undo step. Clicking
 * a piano-roll preview row opens the piano roll (hovering one says so). Keyboard: arrows move a cursor,
 * Enter toggles the step under it. The cursor shows only while you use the keyboard; a click moves it.
 */
export function StepGrid({ patternId }: { readonly patternId: string }) {
  const pattern = useProjectStore((s) => findPattern(s.project, patternId));
  const channels = useProjectStore((s) => s.project.channels);
  const selectedId = useUiStore((s) => s.channelId);
  const storedCursor = useRackStore((s) => s.cursor);
  /** The blue keyboard cursor shows only for keyboard use: focus via Tab, or an arrow/Enter press. */
  const [cursorShown, setCursorShown] = useState(false);
  const [available, setAvailable] = useState(0);
  const drag = useRef<Drag | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const steps = pattern?.steps ?? DEFAULT_STEPS;
  const rows = channels.length;
  const cellWidth = fitCellWidth(available, steps);
  const cursor =
    cursorShown && rows > 0
      ? {
          row: Math.min(storedCursor.row, rows - 1),
          step: Math.min(storedCursor.step, steps - 1),
        }
      : null;

  const { ref: gridRef } = useCanvas((ctx) =>
    drawRack(ctx, { channels, pattern, steps, cellWidth, selectedId, cursor }),
  );
  const { ref: rulerRef } = useCanvas((ctx) => drawRuler(ctx, steps, cellWidth));
  const rulerStrip = useRef<HTMLDivElement>(null);

  // Track the wrapper's width for the cell size, toggle the right-edge fade, and
  // slide the ruler with sideways scrolling (straight on the DOM, no re-render).
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const update = () => {
      setAvailable(element.clientWidth);
      if (rulerStrip.current)
        rulerStrip.current.style.transform = `translateX(${-element.scrollLeft}px)`;
      element.toggleAttribute(
        "data-fade",
        element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  // The content width changes with steps and cell width: re-check the fade.
  useEffect(() => {
    const element = wrapper.current;
    element?.toggleAttribute(
      "data-fade",
      element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    );
  }, [steps, cellWidth]);

  function pointFrom(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    setCursorShown(false);
    const { x, y } = pointFrom(event);
    const cell = cellAt(x, y, { rows, steps, cellWidth });
    const channel = cell ? channels[cell.row] : undefined;
    if (!cell || !channel) return;
    // Arrow keys carry on from the clicked cell.
    useRackStore.setState({ cursor: { row: cell.row, step: cell.step } });
    if (!isStepsOnly(pattern?.notes[channel.id] ?? [])) {
      if (event.button === 0) openPianoRoll(channel.id);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const on = event.button === 0 && !(pattern && hasStep(pattern, channel.id, cell.step));
    const gesture = createId();
    drag.current = { gesture, on, row: cell.row, step: cell.step };
    paint(patternId, cell.row, cell.step, on, gesture);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const state = drag.current;
    if (!state) {
      // Hover hint for piano-roll rows, set on the DOM so moving never re-renders.
      const { x, y } = pointFrom(event);
      const hovered = cellAt(x, y, { rows, steps, cellWidth });
      const channel = hovered ? channels[hovered.row] : undefined;
      const notesRow = channel && !isStepsOnly(pattern?.notes[channel.id] ?? []);
      event.currentTarget.title = notesRow
        ? "Notes from the piano roll. Click to edit them there."
        : "";
      return;
    }
    const { x } = pointFrom(event);
    const cell = cellAt(x, state.row * ROW_H, { rows, steps, cellWidth }, true);
    if (!cell || cell.step === state.step) return;
    for (const step of stepsBetween(state.step, cell.step))
      paint(patternId, state.row, step, state.on, state.gesture);
    state.step = cell.step;
  }

  function endDrag() {
    drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!cursor) {
      // Focused by a click: the first arrow or Enter reveals the cursor where it was.
      if ((move || event.key === "Enter") && rows > 0) {
        setCursorShown(true);
        event.preventDefault();
      }
      return;
    }
    if (move) {
      useRackStore.setState({
        cursor: {
          row: Math.max(0, Math.min(rows - 1, cursor.row + move[0])),
          step: Math.max(0, Math.min(steps - 1, cursor.step + move[1])),
        },
      });
    } else if (event.key === "Enter") {
      const channel = channels[cursor.row];
      if (channel && isStepsOnly(pattern?.notes[channel.id] ?? [])) {
        const on = !(pattern && hasStep(pattern, channel.id, cursor.step));
        paint(patternId, cursor.row, cursor.step, on, createId());
      } else if (channel) openPianoRoll(channel.id);
    } else return;
    event.preventDefault();
  }

  const width = steps * cellWidth;
  const height = rows * ROW_H;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* The ruler sits outside the sideways scroller so it can stick to the top. */}
      <div
        style={{ height: RULER_H, top: HEADER_H }}
        className="sticky z-10 overflow-hidden bg-panel"
      >
        <div ref={rulerStrip} style={{ width, height: RULER_H }}>
          <canvas ref={rulerRef} aria-hidden="true" className="block size-full" />
        </div>
      </div>
      <div
        ref={wrapper}
        className="overflow-x-auto bg-panel data-fade:[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]"
      >
        <div className="relative" style={{ width, height }}>
          {/* data-* geometry is for tools and e2e tests; rows start at the canvas top. */}
          <canvas
            ref={gridRef}
            tabIndex={0}
            role="application"
            aria-label="Step sequencer"
            aria-description="Arrow keys move, Enter toggles a step."
            data-cell-width={String(cellWidth)}
            data-row-height={String(ROW_H)}
            data-ruler-height="0"
            className="block size-full cursor-pointer touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onFocus={(event) => setCursorShown(event.currentTarget.matches(":focus-visible"))}
            onBlur={() => setCursorShown(false)}
          />
          <PlayheadOverlay patternId={patternId} steps={steps} cellWidth={cellWidth} />
        </div>
      </div>
    </div>
  );
}

/**
 * Highlights the sounding step column while playing, in pattern or song mode
 * (patternPlayheadTick). Drawn straight to its own canvas from the shared frame
 * loop, and only when the step changes; React never sees the playhead.
 */
function PlayheadOverlay({
  patternId,
  steps,
  cellWidth,
}: {
  readonly patternId: string;
  readonly steps: number;
  readonly cellWidth: number;
}) {
  const active = useUiStore((s) => s.playing);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painted = useRef("");

  useFrame(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const tick = patternPlayheadTick(
      useProjectStore.getState().project,
      engine.getPlayhead(),
      patternId,
    );
    const step = tick === null ? -1 : Math.floor(tick / STEP_TICKS);
    const dpr = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const key = `${step}:${width}:${height}:${dpr}:${cellWidth}`;
    if (key === painted.current) return;
    painted.current = key;
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (step < 0 || step >= steps) return;
    const colors = themeColors();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.hot;
    ctx.fillRect(step * cellWidth, 0, cellWidth, height);
    ctx.globalAlpha = 1;
    ctx.fillRect(step * cellWidth, 0, cellWidth, 3);
  }, active);

  useEffect(() => {
    if (active) return;
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    painted.current = "";
  }, [active]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
