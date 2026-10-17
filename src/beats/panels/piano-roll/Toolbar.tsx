import type { Channel } from "@/core/schema";
import { selectChannel } from "@/state/ui-store";
import { type Snap, zoomAt } from "@/ui/timeline";
import { quantize } from "./actions";
import { type Tool, ZOOM_LIMITS, usePianoRoll } from "./store";

const TOOLS: ReadonlyArray<{ readonly id: Tool; readonly label: string; readonly key: string }> = [
  { id: "draw", label: "Draw", key: "P" },
  { id: "paint", label: "Paint", key: "B" },
  { id: "delete", label: "Delete", key: "D" },
  { id: "select", label: "Select", key: "E" },
];

const SNAP_ORDER = ["none", "half", "step", "beat", "bar"] as const satisfies readonly Snap[];
const SNAP_LABELS: Readonly<Record<Snap, string>> = {
  none: "Off",
  half: "1/2 step",
  step: "Step",
  beat: "Beat",
  bar: "Bar",
};

const control =
  "h-7 rounded-sm border border-line bg-panel-2 px-2 font-mono text-xs text-ink uppercase hover:border-ink-dim";

function zoom(factor: number) {
  usePianoRoll.setState((state) => zoomAt(state, factor, 0, ZOOM_LIMITS));
}

/** Channel picker, tools, snap, zoom and quantize. */
export function Toolbar(props: {
  channels: readonly Channel[];
  channelId: string | null;
  patternName: string;
  noteCount: number;
}) {
  const tool = usePianoRoll((s) => s.tool);
  const snap = usePianoRoll((s) => s.snap);
  const selectedCount = usePianoRoll((s) => s.selected.size);
  const channel = props.channels.find((c) => c.id === props.channelId);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-2 py-1">
      <span className="font-display text-lg leading-none tracking-wide text-hot">PIANO ROLL</span>

      <label className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-sm"
          style={{ background: channel?.color ?? "transparent" }}
        />
        <select
          aria-label="Channel"
          value={props.channelId ?? ""}
          onChange={(event) => selectChannel(event.target.value)}
          className={`${control} normal-case`}
        >
          {props.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div role="radiogroup" aria-label="Tool" className="flex">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={tool === item.id}
            title={`${item.label} (${item.key})`}
            onClick={() => usePianoRoll.setState({ tool: item.id })}
            className="h-7 border border-line px-2 font-mono text-xs uppercase first:rounded-l-sm last:rounded-r-sm hover:border-ink-dim aria-checked:border-amber aria-checked:bg-amber aria-checked:text-well"
          >
            {item.label}
            <kbd className="ml-1 opacity-60">{item.key}</kbd>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 font-mono text-xs text-ink-dim uppercase">
        Snap
        <select
          value={snap}
          onChange={(event) => {
            const next = SNAP_ORDER.find((key) => key === event.target.value);
            if (next) usePianoRoll.setState({ snap: next });
          }}
          className={control}
        >
          {SNAP_ORDER.map((value) => (
            <option key={value} value={value}>
              {SNAP_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-1">
        <button
          type="button"
          className={control}
          title="Zoom out (Ctrl+wheel)"
          onClick={() => zoom(1 / 1.4)}
        >
          −
        </button>
        <button
          type="button"
          className={control}
          title="Zoom in (Ctrl+wheel)"
          onClick={() => zoom(1.4)}
        >
          +
        </button>
      </div>

      <button
        type="button"
        className={control}
        title="Quantize starts to snap (Ctrl+Q)"
        onClick={quantize}
      >
        Quantize
      </button>

      <span className="ml-auto font-mono text-xs text-ink-dim uppercase">
        {props.patternName} · {props.noteCount} notes
        {selectedCount > 0 && <span className="text-amber"> · {selectedCount} sel</span>}
      </span>
    </div>
  );
}
