import { type DragEvent, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { findPattern, toggleChannelSolo, updateChannel, updatePattern } from "@/core/commands";
import { edit, useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { SAMPLE_MIME, carriesSamples } from "@/ui/dnd";
import { type Hotkeys, useHotkeys } from "@/ui/hotkeys";
import {
  addSampleChannel,
  cloneAndSelect,
  deleteChannel,
  dropFiles,
  nudgeChannel,
  openAddMenu,
  setChannelSample,
} from "./actions";
import { ChannelRow } from "./ChannelRow";
import { ChannelSettings } from "./ChannelSettings";
import { STEP_OPTIONS, rowAt } from "./grid";
import { useRackStore } from "./rack-store";
import { StepGrid } from "./StepGrid";

function toggleMuteAt(index: number) {
  edit((p) => {
    const channel = p.channels[index];
    if (channel) updateChannel(p, channel.id, { muted: !channel.muted });
  });
}

function soloAt(index: number) {
  edit((p) => {
    const channel = p.channels[index];
    if (channel) toggleChannelSolo(p, channel.id);
  });
}

/**
 * RACK shortcuts from the architecture doc's map. Number keys address channels
 * 1–10. Solo is Shift+number: browsers keep Ctrl/Cmd/Alt+number for switching tabs.
 */
function rackHotkeys(): Hotkeys {
  const bindings: Record<string, () => void> = {};
  for (let index = 0; index < 10; index += 1) {
    const key = String((index + 1) % 10);
    bindings[key] = () => toggleMuteAt(index);
    bindings[`shift+${key}`] = () => soloAt(index);
  }
  const withSelected = (run: (channelId: string) => void) => () => {
    const { channelId } = useUiStore.getState();
    if (channelId) run(channelId);
  };
  return {
    ...bindings,
    "alt+arrowup": withSelected((id) => nudgeChannel(id, -1)),
    "alt+arrowdown": withSelected((id) => nudgeChannel(id, 1)),
    "alt+c": withSelected(cloneAndSelect),
    "alt+delete": withSelected(deleteChannel),
  };
}

/**
 * The channel rack: DOM rows on the left, one step canvas for all of them on the
 * right, settings for the expanded channel underneath. Drop a browser sound or
 * an audio file on a row to replace its sample, anywhere else to add a channel.
 */
export function ChannelRack() {
  const patternId = useUiStore((s) => s.patternId);
  const patternName = useProjectStore((s) => findPattern(s.project, patternId)?.name);
  const steps = useProjectStore((s) => findPattern(s.project, patternId)?.steps);
  const channelIds = useProjectStore(useShallow((s) => s.project.channels.map((c) => c.id)));
  const expandedId = useRackStore((s) => s.expandedId);
  const rowsRef = useRef<HTMLDivElement>(null);
  const markedRow = useRef<Element | null>(null);

  useHotkeys(rackHotkeys());

  /** Highlight the drop target row straight on the DOM (no re-render while dragging). */
  function markRow(row: number) {
    const next = row >= 0 ? (rowsRef.current?.children[row] ?? null) : null;
    if (next === markedRow.current) return;
    markedRow.current?.removeAttribute("data-drop");
    next?.setAttribute("data-drop", "");
    markedRow.current = next;
  }

  function rowFrom(event: DragEvent) {
    const rect = rowsRef.current?.getBoundingClientRect();
    return rect ? rowAt(event.clientY - rect.top, channelIds.length) : -1;
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesSamples(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    markRow(rowFrom(event));
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (!(to instanceof Node) || !event.currentTarget.contains(to)) markRow(-1);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!carriesSamples(event.dataTransfer)) return;
    event.preventDefault();
    markRow(-1);
    const channelId = channelIds[rowFrom(event)];
    const sampleId = event.dataTransfer.getData(SAMPLE_MIME);
    if (sampleId) {
      if (channelId) setChannelSample(channelId, sampleId);
      else addSampleChannel(sampleId);
    } else {
      void dropFiles([...event.dataTransfer.files], channelId);
    }
  }

  return (
    <div
      className="flex min-h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-panel px-2 py-1.5">
        <h2 className="font-display text-base leading-none tracking-wider uppercase">
          Channel rack
        </h2>
        <span className="truncate font-mono text-[11px] text-amber uppercase">{patternName}</span>
        <div
          role="group"
          aria-label="Pattern steps"
          className="ml-auto flex overflow-hidden rounded-sm border border-line"
        >
          {STEP_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={steps === option}
              onClick={() => edit((p) => updatePattern(p, patternId, { steps: option }))}
              className="border-l border-line px-2 py-0.5 font-mono text-[11px] text-ink-dim first:border-l-0 hover:text-ink aria-pressed:bg-amber aria-pressed:font-bold aria-pressed:text-well"
            >
              {option}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openAddMenu({ x: rect.left, y: rect.bottom });
          }}
          className="rounded-sm border border-hot bg-hot/15 px-2 py-0.5 text-xs font-bold tracking-wider text-ink uppercase hover:bg-hot/30"
        >
          + Add
        </button>
      </header>

      <div className="flex">
        <div ref={rowsRef} className="shrink-0 border-r border-line bg-panel">
          {channelIds.map((id) => (
            <ChannelRow key={id} channelId={id} />
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto bg-panel">
          <StepGrid patternId={patternId} />
        </div>
      </div>

      {channelIds.length === 0 && (
        <p className="p-4 text-center font-mono text-xs text-ink-dim uppercase">
          Empty rack. Drop a sound here or hit + Add.
        </p>
      )}

      {expandedId && <ChannelSettings channelId={expandedId} />}
    </div>
  );
}
