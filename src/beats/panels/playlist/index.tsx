import { removeClips } from "@/core/commands";
import { edit, useProjectStore } from "@/state/project-store";
import { setPlayMode, useUiStore } from "@/state/ui-store";
import { useHotkeys } from "@/ui/hotkeys";
import { LedButton } from "@/ui/LedButton";
import { clipsSpan, pasteClips } from "./clips";
import { PatternList } from "./PatternList";
import { Timeline } from "./Timeline";
import { TOOLS, clipboard, setSelection, setTool, usePlaylistView } from "./view-store";

function selectedClips() {
  const { selected } = usePlaylistView.getState();
  return useProjectStore.getState().project.playlist.clips.filter((clip) => selected.has(clip.id));
}

/** Copy the selection; the first paste lands right after it. */
function copySelection() {
  const clips = selectedClips();
  if (clips.length === 0) return;
  clipboard.clips = clips;
  clipboard.offset = clipsSpan(clips);
}

/** Paste the clipboard; repeated pastes keep stacking to the right. */
function paste() {
  if (clipboard.clips.length === 0) return;
  const { clips, offset } = clipboard;
  setSelection(new Set(edit((p) => pasteClips(p, clips, offset))));
  clipboard.offset += clipsSpan(clips);
}

function duplicateSelection() {
  const clips = selectedClips();
  if (clips.length > 0) setSelection(new Set(edit((p) => pasteClips(p, clips, clipsSpan(clips)))));
}

function deleteSelection() {
  const { selected } = usePlaylistView.getState();
  if (selected.size === 0) return;
  edit((p) => removeClips(p, selected));
  setSelection(new Set());
}

/** Playlist view: pattern list on the left, tool bar and the song timeline on the right. */
export function Playlist() {
  const tool = usePlaylistView((s) => s.tool);
  const songMode = useUiStore((s) => s.playMode === "song");

  useHotkeys({
    p: () => setTool("draw"),
    b: () => setTool("paint"),
    d: () => setTool("delete"),
    e: () => setTool("select"),
    delete: deleteSelection,
    backspace: deleteSelection,
    escape: () => setSelection(new Set()),
    "mod+a": () =>
      setSelection(new Set(useProjectStore.getState().project.playlist.clips.map((c) => c.id))),
    "mod+c": copySelection,
    "mod+v": paste,
    "mod+d": duplicateSelection,
  });

  return (
    <div className="grid h-full min-h-0 grid-cols-[11rem_minmax(0,1fr)]">
      <PatternList />
      <div className="flex min-h-0 min-w-0 flex-col">
        <div
          role="toolbar"
          aria-label="Playlist tools"
          className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1"
        >
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              className="rounded-sm border border-line bg-panel-2 px-2 py-0.5 text-xs font-bold tracking-wider text-ink-dim uppercase hover:text-ink aria-pressed:border-amber aria-pressed:text-amber"
            >
              {item.label}
              <kbd className="ml-1 font-mono text-[10px] font-normal opacity-70">
                {item.key.toUpperCase()}
              </kbd>
            </button>
          ))}
          <span className="ml-3 hidden font-mono text-[10px] text-ink-dim uppercase md:inline">
            Alt: no snap · Right-click: delete · Ctrl+drag: select
          </span>
          <LedButton
            active={songMode}
            tone="hot"
            className="ml-auto"
            title="Play the song instead of the selected pattern (L)"
            onClick={() => setPlayMode(songMode ? "pattern" : "song")}
          >
            Song
          </LedButton>
        </div>
        <Timeline />
      </div>
    </div>
  );
}
