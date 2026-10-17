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
import { edit } from "@/state/project-store";
import { Knob } from "@/ui/Knob";
import { type MenuEntry, openMenu } from "@/ui/menu";
import { selectSlot, useMixerView } from "./store";

/** The selected track's insert chain: slot list on top, the selected slot's knobs below. */
export function FxRack({ track }: { readonly track: MixerTrack }) {
  const slotId = useMixerView((s) => s.slotId);
  const selected = track.effects.find((slot) => slot.id === slotId) ?? track.effects[0];

  function openAddMenu(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(
      { x: rect.left, y: rect.bottom },
      Object.entries(effects).map(([kind, def]) => ({
        label: def.name,
        onSelect: () => {
          const id = edit((p) => addEffect(p, track.id, kind));
          if (id) selectSlot(id);
        },
      })),
    );
  }

  return (
    <aside
      aria-label="Insert effects"
      className="flex w-72 shrink-0 flex-col border-l border-line bg-panel"
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="font-display text-base tracking-wide text-ink uppercase">Insert FX</h2>
        <span className="truncate font-mono text-[11px] text-amber uppercase">{track.name}</span>
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
          <button
            type="button"
            onClick={openAddMenu}
            className="w-full px-3 py-1.5 text-left font-mono text-[11px] font-bold tracking-wider text-ink-dim uppercase hover:bg-panel-2 hover:text-ink"
          >
            + Add effect
          </button>
        </li>
      </ol>

      {selected ? (
        <SlotParams slot={selected} trackId={track.id} />
      ) : (
        <p className="p-3 font-mono text-[11px] text-ink-dim">
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

  const tool =
    "grid size-6 place-items-center font-mono text-[11px] text-ink-dim hover:text-ink disabled:opacity-30";
  return (
    <li
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1.5 pr-1 pl-2 ${selected ? "bg-panel-2 shadow-[inset_2px_0_0_var(--color-amber)]" : "bg-panel"}`}
    >
      <span className="w-3 font-mono text-[10px] text-ink-dim">{index + 1}</span>
      <button
        type="button"
        aria-pressed={slot.enabled}
        aria-label={`${name} ${slot.enabled ? "on" : "bypassed"}`}
        title={slot.enabled ? "Bypass" : "Enable"}
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
        className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm font-bold ${slot.enabled ? "text-ink" : "text-ink-dim line-through"}`}
      >
        {name}
      </button>
      <button
        type="button"
        aria-label="Move up"
        disabled={index === 0}
        onClick={() => move(-1)}
        className={tool}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={last}
        onClick={() => move(1)}
        className={tool}
      >
        ▼
      </button>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={remove}
        className={`${tool} hover:text-rec`}
      >
        ✕
      </button>
    </li>
  );
}

function SlotParams({ slot, trackId }: { readonly slot: EffectSlot; readonly trackId: string }) {
  const def = getEffect(slot.kind);
  if (!def) {
    return (
      <p className="p-3 font-mono text-[11px] text-ink-dim">
        This build doesn't know the "{slot.kind}" effect. It passes audio through untouched.
      </p>
    );
  }
  return (
    <section aria-label={`${def.name} settings`} className="p-3">
      <h3 className="mb-2 font-mono text-[11px] font-bold tracking-wider text-ink-dim uppercase">
        {def.name}
      </h3>
      <div className={`grid grid-cols-4 gap-x-2 gap-y-3 ${slot.enabled ? "" : "opacity-50"}`}>
        {Object.entries(def.params).map(([key, spec]) => (
          <Knob
            key={key}
            spec={spec}
            value={slot.params[key] ?? spec.default}
            onChange={(value, gesture) =>
              edit((p) => setEffectParam(p, trackId, slot.id, key, value), gesture)
            }
          />
        ))}
      </div>
    </section>
  );
}
