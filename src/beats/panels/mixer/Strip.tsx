import { type MouseEvent, useEffect, useRef, useState } from "react";
import { findMixerTrack, removeInsert, toggleInsertSolo, updateMixerTrack } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import type { Channel } from "@/core/schema";
import { getEffect } from "@/effects";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { Button } from "@/ui/Button";
import { Knob } from "@/ui/Knob";
import { Meter } from "@/ui/Meter";
import { MuteLed } from "@/ui/MuteLed";
import { RenameField } from "@/ui/RenameField";
import { openMenu } from "@/ui/menu";
import { MIXER_VOLUME_SPEC, PAN_SPEC, formatPan } from "@/ui/specs";
import { Fader, formatDb } from "./Fader";
import { selectSlot, selectTrack } from "./store";

interface StripProps {
  readonly trackId: string;
  /** The insert number; omitted for the master. */
  readonly index?: number;
  readonly selected: boolean;
  /** This insert is soloed (its solo flag is set). */
  readonly soloed: boolean;
  /** Another insert is the solo, so this one is silenced by it: drawn dimmed. */
  readonly silenced: boolean;
  /** Channels feeding this track. */
  readonly routed: readonly Pick<Channel, "id" | "name" | "color">[];
}

const SHOWN_ROUTES = 3;

/**
 * One console strip: number + FX chip, name, pan, meter + fader, dB readout,
 * mute LED + solo, routed channels. Click anywhere to select; double-click the
 * name to rename; right-click for more.
 */
export function Strip({ trackId, index, selected, soloed, silenced, routed }: StripProps) {
  const track = useProjectStore((s) => findMixerTrack(s.project, trackId));
  const [renaming, setRenaming] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Keep the selected strip visible in the scrolling row.
  useEffect(() => {
    if (selected) root.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selected]);

  if (!track) return null;
  const isMaster = trackId === MASTER_ID;
  const toggleMute = () => edit((p) => updateMixerTrack(p, trackId, { muted: !track.muted }));

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    selectTrack(trackId);
    openMenu({ x: event.clientX, y: event.clientY }, [
      { label: "Rename", onSelect: () => setRenaming(true), disabled: isMaster },
      { label: track.muted ? "Unmute" : "Mute", onSelect: toggleMute },
      ...(isMaster
        ? []
        : [
            {
              label: soloed ? "Unsolo" : "Solo",
              onSelect: () => edit((p) => toggleInsertSolo(p, trackId)),
            },
            "separator" as const,
            {
              label: "Remove insert",
              danger: true,
              onSelect: () => edit((p) => removeInsert(p, trackId)),
            },
          ]),
    ]);
  };

  const fxTitle = track.effects
    .map(
      (slot) => `${getEffect(slot.kind)?.name ?? slot.kind} (${slot.enabled ? "on" : "bypassed"})`,
    )
    .join(", ");
  const firstSlot = track.effects[0];

  return (
    <div
      ref={root}
      role="group"
      aria-label={`${track.name} strip`}
      onPointerDown={() => selectTrack(trackId)}
      onContextMenu={onContextMenu}
      className={`relative flex shrink-0 flex-col items-center gap-1.5 rounded-sm border border-line px-1 pt-2 pb-1.5 ${isMaster ? "w-28 bg-panel-2" : "w-[84px] bg-panel"} ${selected ? "ring-2 ring-ink" : ""} ${silenced ? "opacity-60" : ""}`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-ink" />}
      <div className="flex h-6 w-full items-center justify-between px-0.5">
        {index !== undefined && <span className="caption leading-none">{index}</span>}
        {firstSlot && (
          <Button
            size="sm"
            title={fxTitle}
            className="ml-auto h-5 px-1.5"
            onClick={() => {
              selectTrack(trackId);
              selectSlot(firstSlot.id);
            }}
          >
            FX {track.effects.length}
          </Button>
        )}
      </div>

      {renaming ? (
        <RenameField
          value={track.name}
          label="Track name"
          className="text-center"
          onRename={(name) => edit((p) => updateMixerTrack(p, trackId, { name }))}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          title={isMaster ? track.name : `${track.name} (double-click to rename)`}
          onDoubleClick={() => !isMaster && setRenaming(true)}
          className="w-full truncate px-0.5 text-center font-display text-sm leading-tight tracking-wide text-ink uppercase"
        >
          {track.name}
        </button>
      )}

      <Knob
        spec={PAN_SPEC}
        value={track.pan}
        format={formatPan}
        size={28}
        layout="stack"
        label="Pan"
        name={`${track.name} pan`}
        onChange={(pan, gesture) => edit((p) => updateMixerTrack(p, trackId, { pan }), gesture)}
      />

      <div className="flex min-h-28 w-full flex-1 justify-center gap-1">
        <Meter
          read={() => engine.readMeter(trackId)}
          title={`${track.name} level`}
          className="h-full w-2 rounded-[1px]"
        />
        <Fader
          spec={MIXER_VOLUME_SPEC}
          value={track.volume}
          label={`${track.name} volume`}
          onChange={(volume, gesture) =>
            edit((p) => updateMixerTrack(p, trackId, { volume }), gesture)
          }
        />
      </div>
      <span className="font-mono text-2xs leading-none text-ink tabular-nums">
        {formatDb(track.volume)} <span className="text-ink-dim">dB</span>
      </span>

      <div className="flex w-full items-center justify-center gap-1.5">
        <MuteLed muted={track.muted} name={track.name} onToggle={toggleMute} />
        {!isMaster && (
          <button
            type="button"
            title={soloed ? "Unsolo" : "Solo"}
            aria-label={`Solo ${track.name}`}
            aria-pressed={soloed}
            onClick={() => edit((p) => toggleInsertSolo(p, trackId))}
            className={`h-5 w-7 rounded-sm border font-mono text-2xs font-bold ${soloed ? "border-amber bg-amber text-well" : "border-line bg-panel-2 text-ink-dim hover:text-ink"}`}
          >
            S
          </button>
        )}
      </div>

      <ul className="flex h-11 w-full flex-col overflow-hidden" aria-label="Routed channels">
        {routed.slice(0, SHOWN_ROUTES).map((channel) => (
          <li
            key={channel.id}
            className="flex items-center gap-1 truncate text-2xs leading-[14px] text-ink-dim"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: channel.color }}
            />
            <span className="truncate">{channel.name}</span>
          </li>
        ))}
        {routed.length > SHOWN_ROUTES && (
          <li className="text-2xs leading-[14px] text-ink-dim">
            +{routed.length - SHOWN_ROUTES} more
          </li>
        )}
      </ul>
    </div>
  );
}
