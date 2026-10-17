import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/core/schema";
import { selectChannel } from "@/state/ui-store";
import { Button, Select } from "@/ui/Button";
import { LedButton } from "@/ui/LedButton";
import { Segmented, type SegmentedOption } from "@/ui/Segmented";
import { type Snap, zoomAt } from "@/ui/timeline";
import { quantize } from "./actions";
import { type Tool, ZOOM_LIMITS, usePianoRoll } from "./store";

const TOOLS: ReadonlyArray<{
  readonly id: Tool;
  readonly label: string;
  readonly key: string;
  readonly title: string;
  readonly hint: string;
}> = [
  {
    id: "draw",
    label: "Draw",
    key: "P",
    title: "Draw (P): click to add a note, drag to move or resize",
    hint: "Click to add · drag a note to move · drag its end to resize · right-click deletes",
  },
  {
    id: "paint",
    label: "Paint",
    key: "B",
    title: "Paint (B): drag to paint notes",
    hint: "Drag to paint notes at the last length",
  },
  {
    id: "delete",
    label: "Delete",
    key: "D",
    title: "Delete (D): click or drag over notes to delete",
    hint: "Click or drag over notes to delete",
  },
  {
    id: "select",
    label: "Select",
    key: "E",
    title: "Select (E): drag a box, Shift-click to add",
    hint: "Drag to box-select · Shift-click adds · arrows nudge · Delete removes",
  },
];

const TOOL_OPTIONS: readonly SegmentedOption<Tool>[] = TOOLS.map((tool) => ({
  value: tool.id,
  title: tool.title,
  label: (
    <>
      {tool.label}
      <kbd className="ml-1 font-mono text-2xs opacity-60">{tool.key}</kbd>
    </>
  ),
}));

const SNAP_ORDER = ["none", "half", "step", "beat", "bar"] as const satisfies readonly Snap[];
const SNAP_LABELS: Readonly<Record<Snap, string>> = {
  none: "Off",
  half: "1/2 step",
  step: "Step",
  beat: "Beat",
  bar: "Bar",
};

const caption = "caption";

function zoom(factor: number) {
  usePianoRoll.setState((state) => zoomAt(state, factor, 0, ZOOM_LIMITS));
}

/** True for 1 s after `value` changes (not on mount), to flash it. */
function useFlash(value: number): boolean {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(timer);
  }, [value]);
  return flash;
}

/**
 * Channel picker, tools, snap, zoom, quantize and ghost toggle, with a status
 * ("Pattern 1 · 2 bars · 8 notes · 2 selected") and a hint for the active tool.
 */
export function Toolbar(props: {
  readonly channels: readonly Channel[];
  readonly channelId: string | null;
  readonly patternName: string;
  readonly bars: number;
  readonly noteCount: number;
}) {
  const tool = usePianoRoll((s) => s.tool);
  const snap = usePianoRoll((s) => s.snap);
  const showGhosts = usePianoRoll((s) => s.showGhosts);
  const selectedCount = usePianoRoll((s) => s.selected.size);
  const channel = props.channels.find((c) => c.id === props.channelId);
  const barsFlash = useFlash(props.bars);
  const hint = TOOLS.find((t) => t.id === tool)?.hint;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-2 py-1">
      <h2 className="panel-title text-ink">Piano roll</h2>

      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-sm"
          style={{ background: channel?.color ?? "transparent" }}
        />
        <Select
          aria-label="Channel"
          value={props.channelId ?? ""}
          onChange={(event) => selectChannel(event.target.value)}
        >
          {props.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </span>

      <span className="flex items-center gap-1.5">
        <span className={caption}>Tool</span>
        <Segmented
          label="Tool"
          options={TOOL_OPTIONS}
          value={tool}
          onChange={(next) => usePianoRoll.setState({ tool: next })}
        />
      </span>

      <span className="flex items-center gap-1.5">
        <span className={caption}>Snap</span>
        <Select
          aria-label="Snap"
          value={snap}
          onChange={(event) => {
            const next = SNAP_ORDER.find((key) => key === event.target.value);
            if (next) usePianoRoll.setState({ snap: next });
          }}
        >
          {SNAP_ORDER.map((value) => (
            <option key={value} value={value}>
              {SNAP_LABELS[value]}
            </option>
          ))}
        </Select>
      </span>

      <span className="flex items-center gap-1">
        <span className={caption}>Zoom</span>
        <Button
          variant="ghost"
          aria-label="Zoom out"
          title="Zoom out (Ctrl+wheel)"
          onClick={() => zoom(1 / 1.4)}
        >
          −
        </Button>
        <Button
          variant="ghost"
          aria-label="Zoom in"
          title="Zoom in (Ctrl+wheel)"
          onClick={() => zoom(1.4)}
        >
          +
        </Button>
      </span>

      <Button
        className="min-w-[9.5rem]"
        title="Snap note starts to the grid (Ctrl+Q)"
        onClick={quantize}
      >
        {selectedCount > 0 ? `Quantize ${selectedCount} selected` : "Quantize all"}
      </Button>

      <LedButton
        active={showGhosts}
        title="Show other channels' notes as outlines"
        onClick={() => usePianoRoll.setState({ showGhosts: !showGhosts })}
      >
        Ghost notes
      </LedButton>

      {/* Status sits beside the hint so selection changes never wrap the controls row. */}
      <div className="flex w-full items-baseline justify-between gap-3">
        <p className="text-2xs text-ink-dim">{hint}</p>
        <span className="text-xs whitespace-nowrap text-ink-dim">
          {props.patternName} ·{" "}
          <span
            className={`transition-colors duration-300 ${barsFlash ? "text-amber" : "text-ink"}`}
          >
            {props.bars}
          </span>{" "}
          {props.bars === 1 ? "bar" : "bars"} · <span className="text-ink">{props.noteCount}</span>{" "}
          {props.noteCount === 1 ? "note" : "notes"}
          {selectedCount > 0 && (
            <>
              {" "}
              · <span className="text-ink">{selectedCount}</span> selected
            </>
          )}
        </span>
      </div>
    </div>
  );
}
