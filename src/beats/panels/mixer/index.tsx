import { type RefObject, useEffect, useRef, useState } from "react";
import { addInsert, findMixerTrack, toggleInsertSolo } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import type { Channel } from "@/core/schema";
import { edit, useProjectStore } from "@/state/project-store";
import { Button } from "@/ui/Button";
import { FxRack } from "./FxRack";
import { Strip } from "./Strip";
import { selectTrack, useMixerView } from "./store";

type Route = Pick<Channel, "id" | "name" | "color">;

/**
 * The mixer console: master strip, one strip per insert, and the selected
 * track's effects on the right. Click a strip to select it; right-click for
 * rename/mute/solo/remove. While one insert is soloed the header shows a chip
 * that clears it.
 */
export function Mixer() {
  const inserts = useProjectStore((s) => s.project.mixer.inserts);
  const channels = useProjectStore((s) => s.project.channels);
  const trackId = useMixerView((s) => s.trackId);
  const selected = useProjectStore(
    (s) => findMixerTrack(s.project, trackId) ?? s.project.mixer.master,
  );
  const row = useRef<HTMLDivElement>(null);
  const clipped = useOverflowRight(row);

  const routes = new Map<string, Route[]>();
  for (const channel of channels) {
    const list = routes.get(channel.mixerTrackId) ?? [];
    list.push(channel);
    routes.set(channel.mixerTrackId, list);
  }
  const solo = inserts.find((track) => track.solo);

  function add() {
    const id = edit((p) => addInsert(p));
    selectTrack(id);
  }

  return (
    <div className="flex h-full min-h-0 bg-well">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-panel px-3 py-1.5">
          <h2 className="panel-title">Mixer</h2>
          <span className="caption">
            {inserts.length} insert{inserts.length === 1 ? "" : "s"}
          </span>
          {solo && (
            <button
              type="button"
              aria-label="Clear solo"
              title="Clear solo: every insert plays again"
              onClick={() => edit((p) => toggleInsertSolo(p, solo.id))}
              className="h-6 rounded-sm border border-amber bg-amber/15 px-2 font-mono text-2xs font-bold tracking-wider text-amber uppercase hover:bg-amber/25"
            >
              Solo: {solo.name} ✕
            </button>
          )}
          <Button size="sm" aria-label="Add insert" onClick={add} className="ml-auto">
            + Insert
          </Button>
        </div>
        <div
          ref={row}
          className="flex min-h-0 flex-1 gap-1 overflow-x-auto p-2"
          style={
            clipped
              ? { maskImage: "linear-gradient(to right, black calc(100% - 48px), transparent)" }
              : undefined
          }
        >
          <Strip
            trackId={MASTER_ID}
            selected={selected.id === MASTER_ID}
            soloed={false}
            silenced={false}
            routed={routes.get(MASTER_ID) ?? []}
          />
          <div aria-hidden="true" className="mx-1 w-px shrink-0 bg-line" />
          {inserts.map((track, index) => (
            <Strip
              key={track.id}
              trackId={track.id}
              index={index + 1}
              selected={selected.id === track.id}
              soloed={track.id === solo?.id}
              silenced={solo !== undefined && track.id !== solo.id}
              routed={routes.get(track.id) ?? []}
            />
          ))}
        </div>
      </div>
      <FxRack track={selected} />
    </div>
  );
}

/** True while a horizontal scroller has content hidden past its right edge. */
function useOverflowRight(ref: RefObject<HTMLElement | null>): boolean {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const check = () => setClipped(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    const mutations = new MutationObserver(check);
    mutations.observe(node, { childList: true });
    node.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      node.removeEventListener("scroll", check);
    };
  }, [ref]);
  return clipped;
}
