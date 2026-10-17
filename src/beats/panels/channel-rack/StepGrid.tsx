import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { findPattern, hasStep, setStep } from "@/core/commands";
import { DEFAULT_STEPS } from "@/core/defaults";
import { createId } from "@/core/ids";
import type { Channel, Note, Pattern } from "@/core/schema";
import { STEP_TICKS } from "@/core/timing";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, useUiStore } from "@/state/ui-store";
import { useCanvas } from "@/ui/canvas";
import { useFrame } from "@/ui/frame";
import { type ThemeColor, themeColors } from "@/ui/theme";
import { CELL_W, type Cell, ROW_H, cellAt, isStepsOnly, litSteps, stepsBetween } from "./grid";
import { useRackStore } from "./rack-store";

type Colors = Readonly<Record<ThemeColor, string>>;

interface DrawInput {
  readonly channels: readonly Channel[];
  readonly pattern: Pattern | undefined;
  readonly steps: number;
  readonly selectedId: string | null;
  readonly cursor: Cell | null;
}

/** Paint every row: step buttons for plain step rows, a mini note preview for piano-roll rows. */
function drawRack(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const colors = themeColors();
  input.channels.forEach((channel, row) => {
    const y = row * ROW_H;
    if (channel.id === input.selectedId) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = colors.amber;
      ctx.fillRect(0, y, input.steps * CELL_W, ROW_H);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, y + ROW_H - 1, input.steps * CELL_W, 1);

    const notes = input.pattern?.notes[channel.id] ?? [];
    ctx.globalAlpha = channel.muted ? 0.35 : 1;
    if (isStepsOnly(notes)) drawSteps(ctx, colors, litSteps(notes, input.steps), y);
    else drawPreview(ctx, colors, channel, notes, input.steps, y);
    ctx.globalAlpha = 1;
  });

  if (input.cursor) {
    ctx.strokeStyle = colors.amber;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      input.cursor.step * CELL_W + 1,
      input.cursor.row * ROW_H + 4,
      CELL_W - 3,
      ROW_H - 9,
    );
  }
}

/** FL-style buttons in alternating groups of four; lit steps glow brighter with velocity. */
function drawSteps(ctx: CanvasRenderingContext2D, colors: Colors, lit: number[], y: number) {
  const base = ctx.globalAlpha;
  lit.forEach((velocity, step) => {
    const x = step * CELL_W + 2;
    const w = CELL_W - 5;
    const h = ROW_H - 9;
    ctx.beginPath();
    ctx.roundRect(x, y + 4, w, h, 2);
    ctx.fillStyle = colors["panel-2"];
    ctx.fill();
    if (Math.floor(step / 4) % 2 === 1) {
      ctx.globalAlpha = base * 0.16;
      ctx.fillStyle = colors.hot;
      ctx.fill();
    }
    if (velocity > 0) {
      ctx.globalAlpha = base * (0.45 + 0.55 * velocity);
      ctx.fillStyle = colors.acid;
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

/** Mini piano roll: notes as bars in the channel color, pitch range fitted to the lane. */
function drawPreview(
  ctx: CanvasRenderingContext2D,
  colors: Colors,
  channel: Channel,
  notes: readonly Note[],
  steps: number,
  y: number,
) {
  const top = y + 4;
  const height = ROW_H - 9;
  ctx.fillStyle = colors.well;
  ctx.fillRect(1, top, steps * CELL_W - 2, height);
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
    const x = (note.tick / STEP_TICKS) * CELL_W;
    if (x >= steps * CELL_W) continue;
    const w = Math.max(2, Math.min((note.length / STEP_TICKS) * CELL_W - 1, steps * CELL_W - x));
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
 * One canvas for every row's steps. Left-drag paints (lighting or clearing is
 * decided by the first cell), right-drag erases, a drag stays on its row and is
 * one undo step. Clicking a piano-roll preview row opens the piano roll.
 * Keyboard: arrows move a cursor, Enter toggles the step under it.
 */
export function StepGrid({ patternId }: { readonly patternId: string }) {
  const pattern = useProjectStore((s) => findPattern(s.project, patternId));
  const channels = useProjectStore((s) => s.project.channels);
  const selectedId = useUiStore((s) => s.channelId);
  const storedCursor = useRackStore((s) => s.cursor);
  const [focused, setFocused] = useState(false);
  const drag = useRef<Drag | null>(null);

  const steps = pattern?.steps ?? DEFAULT_STEPS;
  const rows = channels.length;
  const cursor =
    focused && rows > 0
      ? {
          row: Math.min(storedCursor.row, rows - 1),
          step: Math.min(storedCursor.step, steps - 1),
        }
      : null;

  const { ref: gridRef } = useCanvas((ctx) =>
    drawRack(ctx, { channels, pattern, steps, selectedId, cursor }),
  );

  function pointFrom(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 2) return;
    const { x, y } = pointFrom(event);
    const cell = cellAt(x, y, { rows, steps });
    const channel = cell ? channels[cell.row] : undefined;
    if (!cell || !channel) return;
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
    if (!state) return;
    const { x } = pointFrom(event);
    const cell = cellAt(x, state.row * ROW_H, { rows, steps }, true);
    if (!cell || cell.step === state.step) return;
    for (const step of stepsBetween(state.step, cell.step))
      paint(patternId, state.row, step, state.on, state.gesture);
    state.step = cell.step;
  }

  function endDrag() {
    drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!cursor || event.altKey || event.ctrlKey || event.metaKey) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
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

  const width = steps * CELL_W;
  const height = rows * ROW_H;
  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={gridRef}
        tabIndex={0}
        role="application"
        aria-label="Step sequencer. Arrow keys move, Enter toggles a step."
        className="block size-full cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <PlayheadOverlay patternId={patternId} steps={steps} />
    </div>
  );
}

/**
 * Highlights the playing step column in pattern mode. Drawn straight to its own
 * canvas from the shared frame loop, and only when the step changes; React never
 * sees the playhead.
 */
function PlayheadOverlay({
  patternId,
  steps,
}: {
  readonly patternId: string;
  readonly steps: number;
}) {
  const active = useUiStore((s) => s.playing && s.playMode === "pattern");
  const canvas = useRef<HTMLCanvasElement>(null);
  const painted = useRef("");

  useFrame(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const head = engine.getPlayhead();
    const step =
      head?.scope.kind === "pattern" && head.scope.patternId === patternId
        ? Math.floor(head.tick / STEP_TICKS)
        : -1;
    const dpr = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const key = `${step}:${width}:${height}:${dpr}`;
    if (key === painted.current) return;
    painted.current = key;
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (step < 0 || step >= steps) return;
    const colors = themeColors();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.hot;
    ctx.fillRect(step * CELL_W, 0, CELL_W, height);
    ctx.globalAlpha = 1;
    ctx.fillRect(step * CELL_W + 2, 0, CELL_W - 5, 3);
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
