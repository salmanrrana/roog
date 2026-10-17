import { type MouseEvent, useState } from "react";
import { findMixerTrack, removeInsert, toggleInsertSolo, updateMixerTrack } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import type { Channel, EffectSlot } from "@/core/schema";
import { engine } from "@/engine";
import { edit, useProjectStore } from "@/state/project-store";
import { Knob } from "@/ui/Knob";
import { Meter } from "@/ui/Meter";
import { openMenu } from "@/ui/menu";
import { MIXER_VOLUME_SPEC, PAN_SPEC, formatPan } from "@/ui/specs";
import { Fader, formatDb } from "./Fader";
import { selectTrack } from "./store";

interface StripProps {
  readonly trackId: string;
  /** "M" for the master, the insert number otherwise. */
  readonly label: string;
  readonly selected: boolean;
  /** This insert is the only unmuted one (FL-style solo). */
  readonly soloed: boolean;
  /** Channels feeding this track. */
  readonly routed: readonly Pick<Channel, "id" | "name" | "color">[];
}

const SHOWN_ROUTES = 3;

/** One console strip: name, pan, meter + fader, mute/solo, FX lights, routed channels. */
export function Strip({ trackId, label, selected, soloed, routed }: StripProps) {
  const track = useProjectStore((s) => findMixerTrack(s.project, trackId));
  const [renaming, setRenaming] = useState(false);
  if (!track) return null;
  const isMaster = trackId === MASTER_ID;

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    selectTrack(trackId);
    openMenu({ x: event.clientX, y: event.clientY }, [
      { label: "Rename", onSelect: () => setRenaming(true), disabled: isMaster },
      {
        label: track.muted ? "Unmute" : "Mute",
        onSelect: () => edit((p) => updateMixerTrack(p, trackId, { muted: !track.muted })),
      },
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

  const rename = (name: string) => {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== track.name)
      edit((p) => updateMixerTrack(p, trackId, { name: trimmed }));
  };

  return (
    <div
      role="group"
      aria-label={`${track.name} strip`}
      onPointerDown={() => selectTrack(trackId)}
      onContextMenu={onContextMenu}
      className={`relative flex shrink-0 flex-col items-center gap-1.5 rounded-sm border bg-panel px-1 pt-2 pb-1.5 ${isMaster ? "w-24" : "w-[78px]"} ${selected ? "border-amber" : "border-line"}`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-amber" />}
      <div className="flex w-full items-center justify-between px-0.5 font-mono text-[10px] leading-none text-ink-dim">
        <span>{label}</span>
        <FxLights effects={track.effects} />
      </div>

      {renaming ? (
        <input
          autoFocus
          defaultValue={track.name}
          aria-label="Track name"
          className="w-full rounded-[2px] border border-amber bg-well px-1 text-center font-mono text-[11px] text-ink outline-none"
          onBlur={(event) => rename(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") rename(event.currentTarget.value);
            else if (event.key === "Escape") {
              // Reset first so the blur that follows the unmount commits nothing.
              event.currentTarget.value = track.name;
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          title={isMaster ? track.name : `${track.name} (double-click to rename)`}
          onDoubleClick={() => !isMaster && setRenaming(true)}
          className={`w-full truncate px-0.5 text-center font-display text-sm leading-tight tracking-wide uppercase ${track.muted ? "text-ink-dim line-through" : "text-ink"}`}
        >
          {track.name}
        </button>
      )}

      <Knob
        spec={PAN_SPEC}
        value={track.pan}
        format={formatPan}
        size={30}
        onChange={(pan, gesture) => edit((p) => updateMixerTrack(p, trackId, { pan }), gesture)}
      />

      <div className="flex min-h-28 w-full flex-1 justify-center gap-1.5">
        <Meter read={() => engine.readMeter(trackId)} className="h-full w-2 rounded-[1px]" />
        <Fader
          spec={MIXER_VOLUME_SPEC}
          value={track.volume}
          label={`${track.name} volume`}
          onChange={(volume, gesture) =>
            edit((p) => updateMixerTrack(p, trackId, { volume }), gesture)
          }
        />
      </div>
      <span className="font-mono text-[10px] leading-none text-ink tabular-nums">
        {formatDb(track.volume)}
      </span>

      <div className="flex w-full gap-1">
        <StateButton
          label="M"
          title={track.muted ? "Unmute" : "Mute"}
          active={track.muted}
          activeClass="border-rec bg-rec text-well"
          onClick={() => edit((p) => updateMixerTrack(p, trackId, { muted: !track.muted }))}
        />
        {!isMaster && (
          <StateButton
            label="S"
            title={soloed ? "Unsolo" : "Solo"}
            active={soloed}
            activeClass="border-amber bg-amber text-well"
            onClick={() => edit((p) => toggleInsertSolo(p, trackId))}
          />
        )}
      </div>

      <ul className="flex h-10 w-full flex-col gap-px overflow-hidden" aria-label="Routed channels">
        {routed.slice(0, SHOWN_ROUTES).map((channel) => (
          <li
            key={channel.id}
            className="flex items-center gap-1 truncate font-mono text-[9px] leading-[11px] text-ink-dim"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: channel.color }}
            />
            <span className="truncate">{channel.name}</span>
          </li>
        ))}
        {routed.length > SHOWN_ROUTES && (
          <li className="font-mono text-[9px] leading-[11px] text-ink-dim">
            +{routed.length - SHOWN_ROUTES} more
          </li>
        )}
      </ul>
    </div>
  );
}

/** One light per FX slot: lit when the effect runs, dark when bypassed. */
function FxLights({
  effects,
}: {
  readonly effects: readonly Pick<EffectSlot, "id" | "enabled">[];
}) {
  if (effects.length === 0) return null;
  return (
    <span className="flex gap-0.5" title={`${effects.length} effect(s)`}>
      {effects.map((slot) => (
        <span
          key={slot.id}
          className={`size-1.5 rounded-full ${slot.enabled ? "bg-acid" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

interface StateButtonProps {
  readonly label: string;
  readonly title: string;
  readonly active: boolean;
  readonly activeClass: string;
  readonly onClick: () => void;
}

/** Mute/solo key: flat when off, solid signal color when on. */
function StateButton({ label, title, active, activeClass, onClick }: StateButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`h-5 flex-1 rounded-[2px] border font-mono text-[11px] font-bold ${active ? activeClass : "border-line bg-panel-2 text-ink-dim hover:text-ink"}`}
    >
      {label}
    </button>
  );
}
