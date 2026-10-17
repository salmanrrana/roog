import { useState } from "react";
import { addPlaylistTrack, removePlaylistTrack, updatePlaylistTrack } from "@/core/commands";
import { edit, useProjectStore } from "@/state/project-store";
import { LedButton } from "@/ui/LedButton";
import { openMenu } from "@/ui/menu";
import { RenameField } from "./RenameField";
import { ROW_HEIGHT, RULER_HEIGHT, usePlaylistView } from "./view-store";

/** Track name + mute column, scrolled in step with the timeline canvas. */
export function TrackHeaders() {
  const tracks = useProjectStore((s) => s.project.playlist.tracks);
  const scrollY = usePlaylistView((s) => s.scrollY);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="relative min-h-0 overflow-hidden border-r border-line bg-panel">
      <div style={{ transform: `translateY(${RULER_HEIGHT - scrollY}px)` }}>
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="flex items-center gap-1.5 border-b border-line px-1.5"
            style={{ height: ROW_HEIGHT }}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu({ x: event.clientX, y: event.clientY }, [
                { label: "Rename", onSelect: () => setRenaming(track.id) },
                {
                  label: track.muted ? "Unmute" : "Mute",
                  onSelect: () =>
                    edit((p) => updatePlaylistTrack(p, track.id, { muted: !track.muted })),
                },
                "separator",
                {
                  label: "Delete track",
                  danger: true,
                  disabled: tracks.length <= 1,
                  onSelect: () => edit((p) => removePlaylistTrack(p, track.id)),
                },
              ]);
            }}
          >
            <span className="w-4 shrink-0 text-right font-mono text-[10px] text-ink-dim">
              {index + 1}
            </span>
            {renaming === track.id ? (
              <RenameField
                label="Track name"
                value={track.name}
                onRename={(name) => edit((p) => updatePlaylistTrack(p, track.id, { name }))}
                onDone={() => setRenaming(null)}
              />
            ) : (
              <button
                type="button"
                title="Double-click to rename"
                onDoubleClick={() => setRenaming(track.id)}
                className={`min-w-0 flex-1 truncate text-left text-xs font-bold tracking-wide uppercase ${track.muted ? "text-ink-dim line-through" : "text-ink"}`}
              >
                {track.name}
              </button>
            )}
            <LedButton
              active={!track.muted}
              aria-label={`${track.name} on`}
              title={track.muted ? "Unmute track" : "Mute track"}
              className="px-1.5"
              onClick={() => edit((p) => updatePlaylistTrack(p, track.id, { muted: !track.muted }))}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => edit((p) => addPlaylistTrack(p))}
          className="m-1.5 w-[calc(100%-0.75rem)] rounded-sm border border-dashed border-line py-1 text-xs font-bold tracking-wider text-ink-dim uppercase hover:border-ink-dim hover:text-ink"
        >
          + Track
        </button>
      </div>
      <div
        className="absolute inset-x-0 top-0 border-b border-line bg-panel-2 px-2 font-mono text-[10px] leading-[22px] text-ink-dim uppercase"
        style={{ height: RULER_HEIGHT }}
      >
        Tracks
      </div>
    </div>
  );
}
