import { addInsert, findMixerTrack } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import type { Channel } from "@/core/schema";
import { edit, useProjectStore } from "@/state/project-store";
import { FxRack } from "./FxRack";
import { Strip } from "./Strip";
import { selectTrack, useMixerView } from "./store";

type Route = Pick<Channel, "id" | "name" | "color">;

/**
 * The mixer console: master strip, one strip per insert, and the selected
 * track's insert FX on the right. Click a strip to select it; right-click for
 * rename/mute/solo/remove.
 */
export function Mixer() {
  const inserts = useProjectStore((s) => s.project.mixer.inserts);
  const channels = useProjectStore((s) => s.project.channels);
  const trackId = useMixerView((s) => s.trackId);
  const selected = useProjectStore(
    (s) => findMixerTrack(s.project, trackId) ?? s.project.mixer.master,
  );

  const routes = new Map<string, Route[]>();
  for (const channel of channels) {
    const list = routes.get(channel.mixerTrackId) ?? [];
    list.push(channel);
    routes.set(channel.mixerTrackId, list);
  }
  const unmuted = inserts.filter((track) => !track.muted);
  const soloId = inserts.length > 1 && unmuted.length === 1 ? unmuted[0]?.id : undefined;

  function add() {
    const id = edit((p) => addInsert(p));
    selectTrack(id);
  }

  return (
    <div className="flex h-full min-h-0 bg-well">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-panel px-3 py-1.5">
          <h2 className="font-display text-base tracking-wide text-ink uppercase">Mixer</h2>
          <span className="font-mono text-[11px] text-ink-dim">
            {inserts.length} insert{inserts.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={add}
            className="ml-auto rounded-sm border border-line bg-panel-2 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-ink uppercase hover:border-ink-dim"
          >
            + Insert
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-1 overflow-x-auto p-2">
          <Strip
            trackId={MASTER_ID}
            label="M"
            selected={selected.id === MASTER_ID}
            soloed={false}
            routed={routes.get(MASTER_ID) ?? []}
          />
          <div aria-hidden="true" className="mx-1 w-px shrink-0 bg-line" />
          {inserts.map((track, index) => (
            <Strip
              key={track.id}
              trackId={track.id}
              label={String(index + 1)}
              selected={selected.id === track.id}
              soloed={track.id === soloId}
              routed={routes.get(track.id) ?? []}
            />
          ))}
          <button
            type="button"
            onClick={add}
            aria-label="Add insert"
            className="grid w-10 shrink-0 place-items-center rounded-sm border border-dashed border-line font-mono text-lg text-ink-dim hover:border-ink-dim hover:text-ink"
          >
            +
          </button>
        </div>
      </div>
      <FxRack track={selected} />
    </div>
  );
}
