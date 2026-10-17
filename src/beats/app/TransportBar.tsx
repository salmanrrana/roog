import { useState } from "react";
import { addPattern, setBpm, setSwing } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { MAX_BPM, MIN_BPM } from "@/core/timing";
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
import { Knob } from "@/ui/Knob";
import { LedButton } from "@/ui/LedButton";
import { Meter } from "@/ui/Meter";
import { SWING_SPEC } from "@/ui/specs";

const groupClass = "flex items-center gap-1.5";
const smallButton =
  "grid h-7 min-w-7 place-items-center rounded-sm border border-line bg-panel-2 px-1.5 font-mono text-xs text-ink hover:border-ink-dim disabled:opacity-40";

/** Top bar: transport, tempo, swing, pattern picker, history, project menu, master meter. */
export function TransportBar() {
  const playing = useUiStore((s) => s.playing);
  const playMode = useUiStore((s) => s.playMode);
  const swing = useProjectStore((s) => s.project.swing);
  const projectName = useProjectStore((s) => s.project.name);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-hot bg-panel px-3 py-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl leading-none tracking-wide">ROOG</span>
        <span className="font-display text-lg leading-none text-hot">BEATS</span>
      </div>

      <div className={groupClass}>
        <LedButton
          active={playing}
          tone="hot"
          onClick={() => engine.togglePlay()}
          title="Play / stop (Space)"
        >
          {playing ? "Stop" : "Play"}
        </LedButton>
        <div role="radiogroup" aria-label="Play mode (L)" className="flex">
          {(["pattern", "song"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={playMode === mode}
              onClick={() => setPlayMode(mode)}
              title="Pattern or song mode (L)"
              className="border border-line px-2 py-1 font-mono text-xs uppercase first:rounded-l-sm last:rounded-r-sm aria-checked:border-amber aria-checked:bg-amber aria-checked:text-well"
            >
              {mode === "pattern" ? "Pat" : "Song"}
            </button>
          ))}
        </div>
      </div>

      <div className={groupClass}>
        <BpmField />
        <Knob
          spec={SWING_SPEC}
          value={swing}
          size={28}
          onChange={(value, gesture) => edit((p) => setSwing(p, value), gesture)}
        />
      </div>

      <PatternPicker />

      <div className={groupClass}>
        <button
          type="button"
          className={smallButton}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className={smallButton}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="max-w-48 truncate text-sm font-semibold text-ink-dim">{projectName}</span>
        <ProjectMenu />
        <Meter read={() => engine.readMeter(MASTER_ID)} className="h-3 w-24 rounded-xs" />
        <nav className="flex gap-2 font-mono text-[11px] text-ink-dim uppercase">
          <a className="hover:text-ink" href="./index.html">
            Rack
          </a>
          <a className="hover:text-ink" href="./studio.html">
            Studio
          </a>
        </nav>
      </div>
    </header>
  );
}

/** Tempo readout. Type and press Enter, or use the arrow keys (Shift = 10). */
function BpmField() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft !== null) edit((p) => setBpm(p, Number(draft)));
    setDraft(null);
  }

  return (
    <label className="flex items-center gap-1.5 rounded-sm border border-line bg-well px-2 py-0.5">
      <span className="font-mono text-[10px] text-ink-dim uppercase">BPM</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Tempo, ${MIN_BPM} to ${MAX_BPM} BPM`}
        className="w-12 bg-transparent font-mono text-sm text-acid outline-none"
        value={draft ?? String(bpm)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          const nudge = { ArrowUp: 1, ArrowDown: -1 }[event.key];
          if (nudge !== undefined) {
            event.preventDefault();
            edit(
              (p) => setBpm(p, Math.round(bpm) + nudge * (event.shiftKey ? 10 : 1)),
              "bpm-nudge",
            );
          } else if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** Select, step through and create patterns. Pattern mode plays the selected one. */
function PatternPicker() {
  const patterns = useProjectStore((s) => s.project.patterns);
  const patternId = useUiStore((s) => s.patternId);

  return (
    <div className={groupClass}>
      <button
        type="button"
        className={smallButton}
        onClick={() => stepPattern(-1)}
        title="Previous pattern ([)"
      >
        ‹
      </button>
      <select
        aria-label="Pattern"
        value={patternId}
        onChange={(event) => selectPattern(event.target.value)}
        className="h-7 max-w-40 rounded-sm border border-line bg-panel-2 px-1 text-sm"
      >
        {patterns.map((pattern) => (
          <option key={pattern.id} value={pattern.id}>
            {pattern.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={smallButton}
        onClick={() => stepPattern(1)}
        title="Next pattern (])"
      >
        ›
      </button>
      <button
        type="button"
        className={smallButton}
        title="New pattern"
        onClick={() => selectPattern(edit((p) => addPattern(p)))}
      >
        +
      </button>
    </div>
  );
}
