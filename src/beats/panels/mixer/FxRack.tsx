import type { MouseEvent } from "react";
import {
  addEffect,
  moveEffect,
  removeEffect,
  setEffectEnabled,
  setEffectParam,
} from "@/core/commands";
import type { EffectSlot, MixerTrack } from "@/core/schema";
import { effects, getEffect } from "@/effects";
import { edit, useProjectStore } from "@/state/project-store";
import { Button } from "@/ui/Button";
import { ParamControl } from "@/ui/ParamControl";
import { type MenuEntry, openMenu } from "@/ui/menu";
import { selectSlot, useMixerView } from "./store";

/** One-line hints in the Add effect menu, keyed by the registry's display name. */
const HINTS: Record<string, string> = {
  Filter: "Cut lows or highs",
  EQ: "Shape bass, mids and highs",
  Delay: "Echoes",
  Reverb: "Room and space",
  Drive: "Grit and saturation",
  Compressor: "Even out the level",
};

/**
 * The selected track's effects: a header naming the track (top edge in its first
 * routed channel's color), the slot list, then the selected slot's controls.
 */
export function FxRack({ track }: { readonly track: MixerTrack }) {
  const slotId = useMixerView((s) => s.slotId);
  const edgeColor = useProjectStore(
    (s) => s.project.channels.find((channel) => channel.mixerTrackId === track.id)?.color,
  );
  const selected = track.effects.find((slot) => slot.id === slotId) ?? track.effects[0];

  function openAddMenu(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(
      { x: rect.left, y: rect.bottom },
      Object.entries(effects).map(([kind, def]) => ({
        label: def.name,
        ...(HINTS[def.name] === undefined ? {} : { hint: HINTS[def.name] }),
        onSelect: () => {
          const id = edit((p) => addEffect(p, track.id, kind));
          if (id) selectSlot(id);
        },
      })),
    );
  }

  return (
    <aside
      aria-label="Effects"
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-t-[3px] border-l border-line bg-panel"
      style={{ borderTopColor: edgeColor ?? "var(--color-line)" }}
    >
      <header className="flex items-baseline gap-2 border-b border-line px-3 py-2">
        <h2 className="panel-title">Effects</h2>
        <span className="truncate text-sm text-ink">{track.name}</span>
      </header>

      <ol className="flex flex-col gap-px border-b border-line bg-line">
        {track.effects.map((slot, index) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            index={index}
            last={index === track.effects.length - 1}
            trackId={track.id}
            selected={slot.id === selected?.id}
          />
        ))}
        <li className="bg-panel">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Add effect"
            onClick={openAddMenu}
            className="w-full justify-start rounded-none px-3"
          >
            + Add effect
          </Button>
        </li>
      </ol>

      {selected ? (
        <SlotParams slot={selected} trackId={track.id} />
      ) : (
        <p className="p-3 font-mono text-2xs text-ink-dim">
          No effects on this track. Add one to shape its sound.
        </p>
      )}
    </aside>
  );
}

interface SlotRowProps {
  readonly slot: EffectSlot;
  readonly index: number;
  readonly last: boolean;
  readonly trackId: string;
  readonly selected: boolean;
}

function SlotRow({ slot, index, last, trackId, selected }: SlotRowProps) {
  const name = getEffect(slot.kind)?.name ?? `${slot.kind} (missing)`;
  const toggle = () => edit((p) => setEffectEnabled(p, trackId, slot.id, !slot.enabled));
  const move = (delta: number) => edit((p) => moveEffect(p, trackId, slot.id, delta));
  const remove = () => edit((p) => removeEffect(p, trackId, slot.id));

  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
    const entries: MenuEntry[] = [
      { label: slot.enabled ? "Bypass" : "Enable", onSelect: toggle },
      { label: "Move up", onSelect: () => move(-1), disabled: index === 0 },
      { label: "Move down", onSelect: () => move(1), disabled: last },
      "separator",
      { label: "Remove", danger: true, onSelect: remove },
    ];
    openMenu({ x: event.clientX, y: event.clientY }, entries);
  }

  const tool = "size-6 px-0";
  return (
    <li
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1.5 pr-1 pl-2 ${selected ? "bg-panel-2 shadow-[inset_2px_0_0_var(--color-ink)]" : "bg-panel"}`}
    >
      <span className="w-3 font-mono text-2xs text-ink-mute">{index + 1}</span>
      <button
        type="button"
        aria-pressed={slot.enabled}
        aria-label={`${slot.enabled ? "Bypass" : "Enable"} ${name}`}
        title={`${slot.enabled ? "Bypass" : "Enable"} ${name} · lit = on`}
        onClick={toggle}
        className="grid size-5 place-items-center"
      >
        <span
          className={`size-2 rounded-full ${slot.enabled ? "bg-acid shadow-[0_0_6px_var(--color-acid)]" : "bg-line"}`}
        />
      </button>
      <button
        type="button"
        onClick={() => selectSlot(slot.id)}
        className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm font-bold ${slot.enabled ? "text-ink" : "text-ink-mute line-through"}`}
      >
        {name}
      </button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Move up"
        disabled={index === 0}
        onClick={() => move(-1)}
        className={tool}
      >
        ▲
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Move down"
        disabled={last}
        onClick={() => move(1)}
        className={tool}
      >
        ▼
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${name}`}
        onClick={remove}
        className={`${tool} enabled:hover:text-rec`}
      >
        ✕
      </Button>
    </li>
  );
}

function SlotParams({ slot, trackId }: { readonly slot: EffectSlot; readonly trackId: string }) {
  const def = getEffect(slot.kind);
  if (!def) {
    return (
      <p className="p-3 font-mono text-2xs text-ink-dim">
        This build doesn't know the "{slot.kind}" effect. It passes audio through untouched.
      </p>
    );
  }
  return (
    <section aria-label={`${def.name} settings`} className="p-3">
      <h3 className="caption mb-2">{def.name}</h3>
      <div
        className={`grid grid-cols-3 items-start justify-items-center gap-x-2 gap-y-3 ${slot.enabled ? "" : "opacity-50"}`}
      >
        {Object.entries(def.params).map(([key, spec]) => (
          // Choice params (segmented buttons) take a full row; knobs take one cell.
          <div key={key} className={spec.options ? "col-span-3 justify-self-start" : ""}>
            <ParamControl
              spec={spec}
              value={slot.params[key] ?? spec.default}
              onChange={(value, gesture) =>
                edit((p) => setEffectParam(p, trackId, slot.id, key, value), gesture)
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
