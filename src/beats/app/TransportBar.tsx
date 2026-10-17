import { addPattern, setSwing } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { engine } from "@/engine";
import { ProjectMenu } from "@/panels/projects";
import {
  edit,
  redo,
  selectCanRedo,
  selectCanUndo,
  undo,
  useProjectStore,
} from "@/state/project-store";
import { selectPattern, setPlayMode, stepPattern, useUiStore } from "@/state/ui-store";
import { Button, Select } from "@/ui/Button";
import { Knob } from "@/ui/Knob";
import { Meter } from "@/ui/Meter";
import { Segmented } from "@/ui/Segmented";
import { SWING_SPEC } from "@/ui/specs";
import { BpmField } from "./BpmField";
import { PositionReadout } from "./PositionReadout";
import { ProjectTitle, SaveStatusBadge } from "./ProjectTitle";

const groupClass = "flex shrink-0 items-center gap-1 2xl:gap-1.5";

function Divider({ className = "" }: { readonly className?: string }) {
  return <span aria-hidden="true" className={`h-6 w-px shrink-0 bg-line ${className}`} />;
}

/**
 * Top bar, one row from 1024px up:
 * brand | Play · mode · position | BPM · swing | pattern picker | undo · redo |
 * (right) project name + save status · Project menu | master meter.
 * Below 2xl (1536px) the Pattern and Master captions hide and the meter, pattern select and gaps
 * shrink. Below xl (1280px) the position readout, the "BEATS" wordmark and the master meter
 * (also on the Mixer's master strip) hide so it fits 1024.
 */
export function TransportBar() {
  const playing = useUiStore((s) => s.playing);
  const playMode = useUiStore((s) => s.playMode);
  const swing = useProjectStore((s) => s.project.swing);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);

  return (
    <header className="flex h-11 items-center gap-1 overflow-hidden border-b border-line bg-panel px-2 xl:gap-1.5 2xl:gap-3 2xl:px-3">
      <div className="flex shrink-0 items-baseline gap-1.5">
        <span className="font-display text-2xl leading-none tracking-wide">ROOG</span>
        <span className="font-display text-lg leading-none text-hot max-xl:hidden">BEATS</span>
      </div>
      <Divider />

      <div className={groupClass}>
        <Button
          onClick={() => engine.togglePlay()}
          title={playing ? "Stop (Space)" : "Play (Space)"}
          aria-label={playing ? "Stop" : "Play"}
          className={`min-w-20 ${playing ? "border-hot! bg-hot! text-well!" : ""}`}
        >
          <span aria-hidden="true">{playing ? "■" : "▶"}</span>
          {playing ? "Stop" : "Play"}
        </Button>
        <Segmented
          label="Play mode"
          value={playMode}
          onChange={setPlayMode}
          options={[
            { value: "pattern", label: "Pattern", title: "Loop the selected pattern (L)" },
            { value: "song", label: "Song", title: "Play the playlist from the start (L)" },
          ]}
        />
        <PositionReadout />
      </div>
      <Divider />

      <div className={groupClass}>
        <BpmField />
        <Knob
          spec={SWING_SPEC}
          value={swing}
          size={24}
          layout="inline"
          onChange={(value, gesture) => edit((p) => setSwing(p, value), gesture)}
        />
      </div>
      <Divider />

      <PatternPicker />
      <Divider />

      <div className={groupClass}>
        <Button
          variant="ghost"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="w-7 px-0 text-base"
          onClick={undo}
          disabled={!canUndo}
        >
          ↶
        </Button>
        <Button
          variant="ghost"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="w-7 px-0 text-base"
          onClick={redo}
          disabled={!canRedo}
        >
          ↷
        </Button>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5 2xl:gap-3">
        <div className="flex shrink-0 items-center gap-1">
          <ProjectTitle />
          <SaveStatusBadge />
        </div>
        <div className="shrink-0">
          <ProjectMenu />
        </div>
        <Divider className="max-2xl:hidden" />
        <div className="flex shrink-0 items-center gap-1.5 max-xl:hidden">
          <span className="caption max-2xl:hidden">Master</span>
          <Meter
            read={() => engine.readMeter(MASTER_ID)}
            title="Master level"
            className="h-2.5 w-12 rounded-xs 2xl:w-24"
          />
        </div>
      </div>
    </header>
  );
}

/** Select, step through and create patterns. Pattern mode plays the selected one. */
function PatternPicker() {
  const patterns = useProjectStore((s) => s.project.patterns);
  const patternId = useUiStore((s) => s.patternId);
  const color = patterns.find((pattern) => pattern.id === patternId)?.color;

  return (
    <div className={groupClass}>
      <span className="caption max-2xl:hidden">Pattern</span>
      <Button
        variant="ghost"
        aria-label="Previous pattern"
        title="Previous pattern ([)"
        className="w-6 px-0"
        onClick={() => stepPattern(-1)}
      >
        ‹
      </Button>
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-xs max-xl:hidden"
        style={{ background: color }}
      />
      <Select
        aria-label="Pattern"
        value={patternId}
        onChange={(event) => selectPattern(event.target.value)}
        className="max-w-24 2xl:max-w-40"
      >
        {patterns.map((pattern) => (
          <option key={pattern.id} value={pattern.id}>
            {pattern.name}
          </option>
        ))}
      </Select>
      <Button
        variant="ghost"
        aria-label="Next pattern"
        title="Next pattern (])"
        className="w-6 px-0"
        onClick={() => stepPattern(1)}
      >
        ›
      </Button>
      <Button
        variant="ghost"
        aria-label="New pattern"
        title="New pattern"
        className="w-7 px-0"
        onClick={() => selectPattern(edit((p) => addPattern(p)))}
      >
        +
      </Button>
    </div>
  );
}
