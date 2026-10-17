import { findPattern } from "@/core/commands";
import { patternLength } from "@/core/schedule";
import type { Note } from "@/core/schema";
import { BAR_TICKS } from "@/core/timing";
import { useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { useHotkeys } from "@/ui/hotkeys";
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  paste,
  quantize,
  selectAll,
} from "./actions";
import { Keyboard } from "./Keyboard";
import { NoteGrid } from "./NoteGrid";
import { Ruler } from "./Ruler";
import { Toolbar } from "./Toolbar";
import { VelocityLane } from "./VelocityLane";
import { NO_SELECTION, type Tool, setSelection, usePianoRoll } from "./store";

const EMPTY: readonly Note[] = [];
const setTool = (tool: Tool) => () => usePianoRoll.setState({ tool });

/**
 * FL-style piano roll for the selected pattern + channel: keyboard, note grid with
 * draw/paint/delete/select tools, ghost-note outlines, velocity lane and playhead.
 */
export function PianoRoll() {
  const patternId = useUiStore((s) => s.patternId);
  const channelId = useUiStore((s) => s.channelId);
  const channels = useProjectStore((s) => s.project.channels);
  const pattern = useProjectStore((s) => findPattern(s.project, patternId));
  const notes = (channelId !== null && pattern?.notes[channelId]) || EMPTY;
  const color = channels.find((c) => c.id === channelId)?.color ?? "#fff";

  useHotkeys({
    p: setTool("draw"),
    b: setTool("paint"),
    d: setTool("delete"),
    e: setTool("select"),
    delete: deleteSelection,
    backspace: deleteSelection,
    escape: () => setSelection(NO_SELECTION),
    "mod+a": selectAll,
    "mod+c": copySelection,
    "mod+x": cutSelection,
    "mod+v": paste,
    "mod+d": duplicateSelection,
    "mod+q": quantize,
    arrowup: () => nudgeSelection(0, 1),
    arrowdown: () => nudgeSelection(0, -1),
    "mod+arrowup": () => nudgeSelection(0, 12),
    "mod+arrowdown": () => nudgeSelection(0, -12),
    arrowleft: () => nudgeSelection(-1, 0),
    arrowright: () => nudgeSelection(1, 0),
  });

  return (
    <section aria-label="Piano roll" className="flex h-full min-h-0 flex-col bg-well">
      <Toolbar
        channels={channels}
        channelId={channelId}
        patternName={pattern?.name ?? ""}
        bars={pattern ? Math.ceil(patternLength(pattern) / BAR_TICKS) : 0}
        noteCount={notes.length}
      />
      {channelId === null ? (
        <p className="grid flex-1 place-items-center font-mono text-xs text-ink-dim uppercase">
          Add a channel to start writing notes
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[64px_1fr] grid-rows-[20px_1fr_84px]">
          <div className="border-r border-b border-line bg-panel" />
          <Ruler loopEnd={pattern ? patternLength(pattern) : 0} />
          <Keyboard channelId={channelId} color={color} />
          <NoteGrid patternId={patternId} channelId={channelId} />
          <div className="grid place-items-center border-t border-r border-line bg-panel caption">
            Velocity
          </div>
          <div className="border-t border-line">
            <VelocityLane patternId={patternId} channelId={channelId} notes={notes} color={color} />
          </div>
        </div>
      )}
    </section>
  );
}
