import { type KeyboardEvent, type MouseEvent } from "react";
import { type ChannelPatch, findChannel, updateChannel } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { getInstrument } from "@/instruments";
import { useSampleLibrary } from "@/persistence";
import { getFactorySound } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, selectChannel, useUiStore } from "@/state/ui-store";
import { Button } from "@/ui/Button";
import { Knob } from "@/ui/Knob";
import { MuteLed } from "@/ui/MuteLed";
import { RenameField } from "@/ui/RenameField";
import { PAN_SPEC, VOLUME_SPEC, formatPan } from "@/ui/specs";
import { menuPoint, openChannelMenu, openRouteMenu, soloedChannelId } from "./actions";
import { ROW_H } from "./grid";
import { setRenaming, toggleExpanded, useRackStore } from "./rack-store";

/** Give focus back to a channel's name button (after a rename ends). */
function focusName(channelId: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-channel-name="${channelId}"]`)?.focus(),
  );
}

/**
 * One rack row's DOM controls: mute LED, pan + volume knobs, Out (mixer route),
 * the name button (click selects, double-click or F2 renames, right-click or the
 * menu key opens the channel menu), settings and piano-roll buttons. Its steps
 * live on the shared StepGrid canvas, so painting never re-renders rows.
 */
export function ChannelRow({
  channelId,
  index,
}: {
  readonly channelId: string;
  readonly index: number;
}) {
  const channel = useProjectStore((s) => findChannel(s.project, channelId));
  const insertNumber = useProjectStore((s) => {
    const trackId = findChannel(s.project, channelId)?.mixerTrackId;
    return trackId === MASTER_ID
      ? 0
      : s.project.mixer.inserts.findIndex((i) => i.id === trackId) + 1;
  });
  const insertName = useProjectStore((s) => {
    const trackId = findChannel(s.project, channelId)?.mixerTrackId;
    return s.project.mixer.inserts.find((insert) => insert.id === trackId)?.name ?? "";
  });
  const soloed = useProjectStore((s) => soloedChannelId(s.project) === channelId);
  const inLibrary = useSampleLibrary((s) =>
    s.samples.some((sample) => sample.id === channel?.sampleId),
  );
  const selected = useUiStore((s) => s.channelId === channelId);
  const renaming = useRackStore((s) => s.renamingId === channelId);
  const expanded = useRackStore((s) => s.expandedId === channelId);
  if (!channel) return null;

  const change = (patch: ChannelPatch, gesture?: string) =>
    edit((p) => updateChannel(p, channelId, patch), gesture);
  const usesSample = getInstrument(channel.instrument).usesSample;
  const missing =
    usesSample && channel.sampleId !== null && !getFactorySound(channel.sampleId) && !inLibrary;
  const out = insertNumber > 0 ? `Insert ${insertNumber} · ${insertName}` : "Master";

  function onNameKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "F2") return;
    event.preventDefault();
    setRenaming(channelId);
  }

  function onMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    selectChannel(channelId);
    openChannelMenu(menuPoint(event), channelId);
  }

  return (
    <div
      data-channel-row=""
      style={{ height: ROW_H }}
      className="relative flex items-center gap-1.5 border-b border-line pr-1 pl-2 data-[drop=replace]:bg-amber/10 data-[drop=replace]:outline-2 data-[drop=replace]:-outline-offset-2 data-[drop=replace]:outline-amber"
    >
      <MuteLed
        muted={channel.muted}
        name={channel.name}
        onToggle={() => change({ muted: !channel.muted })}
        {...(index < 10 ? { shortcut: String((index + 1) % 10) } : {})}
      />
      <Knob
        spec={PAN_SPEC}
        value={channel.pan}
        size={20}
        layout="bare"
        label="Pan"
        name={`${channel.name} pan`}
        format={formatPan}
        onChange={(pan, gesture) => change({ pan }, gesture)}
      />
      <Knob
        spec={VOLUME_SPEC}
        value={channel.volume}
        size={20}
        layout="bare"
        label="Vol"
        name={`${channel.name} volume`}
        onChange={(volume, gesture) => change({ volume }, gesture)}
      />
      <button
        type="button"
        title={`Out: ${out} — click to change`}
        aria-label={`${channel.name} output`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openRouteMenu({ x: rect.left, y: rect.bottom }, channelId);
        }}
        className="h-5 w-20 shrink-0 truncate rounded-sm border border-line bg-well px-1 text-2xs text-ink-dim hover:border-ink-dim hover:text-ink"
      >
        {insertNumber > 0 ? `Insert ${insertNumber}` : "Master"}
      </button>
      {renaming ? (
        <RenameField
          value={channel.name}
          label="Channel name"
          onRename={(name) => change({ name })}
          onDone={() => {
            setRenaming(null);
            focusName(channelId);
          }}
          className="h-6 w-32! font-bold"
        />
      ) : (
        <button
          type="button"
          data-channel-name={channelId}
          aria-pressed={selected}
          title="Click: select · Double-click or F2: rename · Right-click: more"
          onClick={() => selectChannel(channelId)}
          onDoubleClick={() => setRenaming(channelId)}
          onContextMenu={onMenu}
          onKeyDown={onNameKey}
          style={{ borderLeftColor: channel.color }}
          className={`flex h-6 w-32 min-w-0 shrink-0 items-center gap-1 rounded-sm border border-l-4 px-1.5 text-left text-xs tracking-wide uppercase hover:bg-line ${
            selected ? "border-ink bg-panel-2 font-bold" : "border-line bg-panel"
          } ${channel.muted ? "text-ink-mute line-through" : "text-ink"}`}
        >
          <span className="truncate">{channel.name}</span>
          {missing && (
            <span
              className="shrink-0 text-amber no-underline"
              title="Sample missing: it was deleted from My samples"
            >
              ⚠
            </span>
          )}
          {usesSample && channel.sampleId === null && (
            <span className="shrink-0 font-mono text-2xs font-normal text-ink-mute normal-case">
              empty
            </span>
          )}
          {soloed && (
            <span
              title="Soloed"
              className="ml-auto shrink-0 rounded-sm bg-amber px-1 font-mono text-2xs font-bold text-well"
            >
              S
            </span>
          )}
        </button>
      )}
      <Button
        variant="ghost"
        aria-expanded={expanded}
        aria-label={`${channel.name} settings`}
        title="Channel settings"
        onClick={() => toggleExpanded(channelId)}
        className={`size-5! shrink-0 px-0! text-sm ${expanded ? "text-ink!" : ""}`}
      >
        ⚙
      </Button>
      <Button
        variant="ghost"
        aria-label={`Open ${channel.name} in piano roll`}
        title="Open in piano roll (F7)"
        onClick={() => openPianoRoll(channelId)}
        className="size-5! shrink-0 px-0!"
      >
        <svg aria-hidden="true" viewBox="0 0 12 10" className="size-3">
          <rect x="0.5" y="0.5" width="11" height="9" fill="none" stroke="currentColor" />
          <path d="M3.5 1v8M6 1v8M8.5 1v8" stroke="currentColor" />
          <path d="M2.5 1h2v5h-2zM7.5 1h2v5h-2z" fill="currentColor" />
        </svg>
      </Button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1 hidden rounded-sm bg-amber px-1 font-mono text-2xs font-bold text-well uppercase [[data-drop=replace]>&]:block"
      >
        Replace sound
      </span>
    </div>
  );
}
