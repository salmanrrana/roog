import { type KeyboardEvent, type MouseEvent } from "react";
import { type ChannelPatch, findChannel, updateChannel } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, selectChannel, useUiStore } from "@/state/ui-store";
import { Knob } from "@/ui/Knob";
import { PAN_SPEC, VOLUME_SPEC, formatPan } from "@/ui/specs";
import { menuPoint, openChannelMenu, openRouteMenu } from "./actions";
import { ROW_H } from "./grid";
import { setRenaming, toggleExpanded, useRackStore } from "./rack-store";

/**
 * One rack row's DOM controls: mute LED, pan + volume knobs, mixer route, and the
 * name button (click selects, double-click opens the piano roll, right-click or
 * the menu key opens the channel menu, F2 renames). Its steps live on the shared
 * StepGrid canvas, so painting never re-renders rows.
 */
export function ChannelRow({ channelId }: { readonly channelId: string }) {
  const channel = useProjectStore((s) => findChannel(s.project, channelId));
  const route = useProjectStore((s) => {
    const trackId = findChannel(s.project, channelId)?.mixerTrackId;
    const index = s.project.mixer.inserts.findIndex((insert) => insert.id === trackId);
    return trackId === MASTER_ID || index < 0 ? "M" : String(index + 1);
  });
  const selected = useUiStore((s) => s.channelId === channelId);
  const renaming = useRackStore((s) => s.renamingId === channelId);
  const expanded = useRackStore((s) => s.expandedId === channelId);
  if (!channel) return null;

  const change = (patch: ChannelPatch, gesture?: string) =>
    edit((p) => updateChannel(p, channelId, patch), gesture);

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
      className="flex items-center gap-1.5 border-b border-line pr-1 pl-2 data-drop:bg-acid/15 data-drop:outline-2 data-drop:outline-acid"
    >
      <button
        type="button"
        aria-pressed={channel.muted}
        aria-label={`Mute ${channel.name}`}
        title="Mute (1–0, Shift = solo)"
        onClick={() => change({ muted: !channel.muted })}
        className="grid size-5 shrink-0 place-items-center rounded-sm border border-line bg-well hover:border-ink-dim"
      >
        <span
          className={`size-2.5 rounded-full ${channel.muted ? "bg-line" : "bg-acid shadow-[0_0_6px_var(--color-acid)]"}`}
        />
      </button>
      <Knob
        spec={PAN_SPEC}
        value={channel.pan}
        size={20}
        compact
        format={formatPan}
        color="var(--color-amber)"
        onChange={(pan, gesture) => change({ pan }, gesture)}
      />
      <Knob
        spec={VOLUME_SPEC}
        value={channel.volume}
        size={20}
        compact
        onChange={(volume, gesture) => change({ volume }, gesture)}
      />
      <button
        type="button"
        title="Mixer insert (click to route)"
        aria-label={`${channel.name} mixer route: ${route === "M" ? "master" : `insert ${route}`}`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openRouteMenu({ x: rect.left, y: rect.bottom }, channelId);
        }}
        className="h-5 w-6 shrink-0 rounded-sm border border-line bg-well font-mono text-[10px] text-ink-dim hover:border-ink-dim hover:text-ink"
      >
        {route}
      </button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={channel.name}
          aria-label="Channel name"
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim();
            if (name && name !== channel.name) change({ name });
            setRenaming(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = channel.name;
              event.currentTarget.blur();
            }
          }}
          className="h-6 w-32 min-w-0 rounded-sm border border-amber bg-well px-1.5 text-xs font-bold text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          aria-pressed={selected}
          title="Click: select · Double-click: piano roll · Right-click: menu"
          onClick={() => selectChannel(channelId)}
          onDoubleClick={() => openPianoRoll(channelId)}
          onContextMenu={onMenu}
          onKeyDown={onNameKey}
          style={{ borderLeftColor: channel.color }}
          className={`h-6 w-32 min-w-0 truncate rounded-sm border border-l-4 bg-panel-2 px-1.5 text-left text-xs font-bold tracking-wide uppercase hover:bg-line ${
            selected ? "border-amber text-ink" : "border-line text-ink-dim"
          } ${channel.muted ? "opacity-50" : ""}`}
        >
          {channel.name}
        </button>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${channel.name} settings`}
        title="Channel settings"
        onClick={() => toggleExpanded(channelId)}
        className={`h-6 w-4 shrink-0 text-xs hover:text-ink ${expanded ? "text-amber" : "text-ink-dim"}`}
      >
        {expanded ? "▴" : "▾"}
      </button>
    </div>
  );
}
