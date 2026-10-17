import { type DragEvent, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  findChannel,
  findPattern,
  toggleChannelSolo,
  updateChannel,
  updatePattern,
} from "@/core/commands";
import { patternLength } from "@/core/schedule";
import { BAR_TICKS, STEP_TICKS } from "@/core/timing";
import { edit, useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { Button } from "@/ui/Button";
import { SAMPLE_MIME, carriesSamples } from "@/ui/dnd";
import { type Hotkeys, useHotkeys } from "@/ui/hotkeys";
import { Segmented } from "@/ui/Segmented";
import {
  addSampleChannel,
  cloneAndSelect,
  deleteChannel,
  dropFiles,
  dropOnChannel,
  nudgeChannel,
  openAddMenu,
  soloedChannelId,
} from "./actions";
import { ChannelRow } from "./ChannelRow";
import { ChannelSettings } from "./ChannelSettings";
import { HEADER_H, ROW_H, RULER_H, STEP_OPTIONS, isStepsOnly, rowAt } from "./grid";
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

const STEP_TITLES: Readonly<Record<(typeof STEP_OPTIONS)[number], string>> = {
  16: "16 steps · 1 bar",
  32: "32 steps · 2 bars",
  64: "64 steps · 4 bars",
};

/** Column captions above the row controls; sticky under the header, level with the step ruler. */
function ColumnCaptions() {
  return (
    <div
      style={{ height: RULER_H, top: HEADER_H }}
      className="caption sticky z-10 flex items-center gap-1.5 border-b border-line bg-panel pr-1 pl-2 leading-none"
    >
      <span className="w-5 text-center" title="Lit = sound on. Keys 1–0 mute, Shift+1–0 solo">
        On
      </span>
      <span className="w-5 text-center">Pan</span>
      <span className="w-5 text-center">Vol</span>
      <span
        className="w-20 text-center"
        title="Where the channel's sound goes: a mixer insert or Master"
      >
        Out
      </span>
      <span>Channel</span>
    </div>
  );
}

/** Amber tag when step notes sit past the pattern's step count; click to show them. */
function HiddenNotesTag({ patternId }: { readonly patternId: string }) {
  const steps = useProjectStore((s) => findPattern(s.project, patternId)?.steps ?? 16);
  const hidden = useProjectStore((s) => {
    const pattern = findPattern(s.project, patternId);
    if (!pattern) return 0;
    let count = 0;
    for (const notes of Object.values(pattern.notes))
      if (isStepsOnly(notes))
        count += notes.filter((note) => note.tick >= pattern.steps * STEP_TICKS).length;
    return count;
  });
  const length = useProjectStore((s) => {
    const pattern = findPattern(s.project, patternId);
    return pattern ? patternLength(pattern) : 0;
  });
  if (hidden === 0) return null;
  const bars = length / BAR_TICKS;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-amber! normal-case!"
      title={`These notes still play: the pattern is ${bars} bar${bars === 1 ? "" : "s"} long. Click to show them.`}
      onClick={() => {
        const fit = STEP_OPTIONS.find((option) => option * STEP_TICKS >= length) ?? 64;
        edit((p) => updatePattern(p, patternId, { steps: fit }));
      }}
    >
      +{hidden} past step {steps}
    </Button>
  );
}

/**
 * The channel rack: a sticky header (with sticky column captions and beat ruler under it), DOM rows on the left, one step canvas for all
 * of them on the right, a permanent "+ Add channel" row, and settings for the
 * expanded channel underneath. Drop a browser sound or an audio file on a row to
 * replace its sound (with an Undo toast); anywhere else adds a channel.
 */
export function ChannelRack() {
  const patternId = useUiStore((s) => s.patternId);
  const patternName = useProjectStore((s) => findPattern(s.project, patternId)?.name);
  const patternColor = useProjectStore((s) => findPattern(s.project, patternId)?.color);
  const steps = useProjectStore((s) => findPattern(s.project, patternId)?.steps);
  const channelIds = useProjectStore(useShallow((s) => s.project.channels.map((c) => c.id)));
  const soloId = useProjectStore((s) => soloedChannelId(s.project));
  const soloName = useProjectStore((s) => (soloId ? findChannel(s.project, soloId)?.name : null));
  const expandedId = useRackStore((s) => s.expandedId);
  const rowsRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const marked = useRef<Element | null>(null);
  const count = useRef(channelIds.length);

  useHotkeys(rackHotkeys());

  // A new channel scrolls into view (the rack is capped at 45vh by the app).
  useEffect(() => {
    const grew = channelIds.length > count.current;
    count.current = channelIds.length;
    if (!grew) return;
    const { channelId } = useUiStore.getState();
    const index = channelId ? channelIds.indexOf(channelId) : -1;
    const row = rowsRef.current?.children[index >= 0 ? index : channelIds.length - 1];
    row?.scrollIntoView({ block: "nearest" });
    addRef.current?.scrollIntoView({ block: "nearest" });
  }, [channelIds]);

  /** Highlight the drop target straight on the DOM (no re-render while dragging). */
  function mark(next: Element | null, kind: "replace" | "add") {
    if (next === marked.current && next?.getAttribute("data-drop") === kind) return;
    marked.current?.removeAttribute("data-drop");
    next?.setAttribute("data-drop", kind);
    marked.current = next;
  }

  function rowFrom(event: DragEvent) {
    const rect = rowsRef.current?.getBoundingClientRect();
    return rect ? rowAt(event.clientY - rect.top, channelIds.length) : -1;
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesSamples(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const row = rowFrom(event);
    if (row >= 0) mark(rowsRef.current?.children[row] ?? null, "replace");
    else mark(addRef.current, "add");
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (!(to instanceof Node) || !event.currentTarget.contains(to)) mark(null, "add");
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!carriesSamples(event.dataTransfer)) return;
    event.preventDefault();
    mark(null, "add");
    const channelId = channelIds[rowFrom(event)];
    const sampleId = event.dataTransfer.getData(SAMPLE_MIME);
    if (sampleId) {
      if (channelId) dropOnChannel(channelId, sampleId);
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
      <header
        style={{ height: HEADER_H }}
        className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-panel px-2"
      >
        <h2 className="panel-title">Channel rack</h2>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink" title="Pattern">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-xs"
            style={{ background: patternColor }}
          />
          <span className="truncate">{patternName}</span>
        </span>
        {soloId && soloName && (
          <Button
            size="sm"
            aria-label="Clear solo"
            title="Clear solo: every channel plays again (mutes stay)"
            className="border-amber! bg-amber! text-well! normal-case!"
            onClick={() => edit((p) => toggleChannelSolo(p, soloId))}
          >
            Solo: {soloName} ✕
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <HiddenNotesTag patternId={patternId} />
          <span className="caption">Steps</span>
          <Segmented
            label="Pattern length"
            size="sm"
            options={STEP_OPTIONS.map((option) => ({
              value: option,
              label: option,
              title: STEP_TITLES[option],
            }))}
            value={steps ?? 16}
            onChange={(option) => edit((p) => updatePattern(p, patternId, { steps: option }))}
          />
        </div>
      </header>

      <div className="flex">
        <div className="shrink-0 border-r border-line bg-panel">
          <ColumnCaptions />
          <div ref={rowsRef}>
            {channelIds.map((id, index) => (
              <ChannelRow key={id} channelId={id} index={index} />
            ))}
          </div>
        </div>
        <StepGrid patternId={patternId} />
      </div>

      <button
        ref={addRef}
        type="button"
        aria-label="Add channel"
        style={{ height: ROW_H }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openAddMenu({ x: rect.left, y: rect.bottom });
        }}
        className="group mx-1 my-1 shrink-0 rounded-sm border border-dashed border-line text-xs text-ink-dim hover:text-ink data-[drop=add]:border-acid data-[drop=add]:bg-acid/10 data-[drop=add]:text-acid"
      >
        <span className="group-data-[drop=add]:hidden">+ Add channel — or drop a sound here</span>
        <span className="hidden group-data-[drop=add]:inline">Drop to add a channel</span>
      </button>

      {expandedId && <ChannelSettings channelId={expandedId} />}
    </div>
  );
}
