import { removeClips } from "@/core/commands";
import { edit, useProjectStore } from "@/state/project-store";
import { useUiStore } from "@/state/ui-store";
import { useHotkeys } from "@/ui/hotkeys";
import { Segmented } from "@/ui/Segmented";
import { clipsSpan, pasteClips } from "./clips";
import { PatternList } from "./PatternList";
import { Timeline } from "./Timeline";
import { TOOLS, type Tool, clipboard, setSelection, setTool, usePlaylistView } from "./view-store";

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

/** One-line help for the active tool; `pattern` is the brush's name. */
function toolHint(tool: Tool, pattern: string): string {
  switch (tool) {
    case "draw":
      return `Click to place ${pattern} · drag to position · Alt = no snap · right-click deletes`;
    case "paint":
      return `Drag across a track to fill it with ${pattern}`;
    case "delete":
      return "Click or drag over clips to delete";
    case "select":
      return "Drag a box · Shift-click adds · Ctrl+C / Ctrl+V / Ctrl+D copy, paste, duplicate";
  }
}

const TOOL_OPTIONS = TOOLS.map((item) => ({
  value: item.id,
  title: item.title,
  label: (
    <>
      {item.label}
      <kbd className="ml-1.5 font-mono text-2xs font-normal opacity-60">
        {item.key.toUpperCase()}
      </kbd>
    </>
  ),
}));

/**
 * Playlist view: pattern list on the left, tool bar and the song timeline on the right.
 * The header owns play mode; the toolbar only reads it back.
 */
export function Playlist() {
  const tool = usePlaylistView((s) => s.tool);
  const songMode = useUiStore((s) => s.playMode === "song");
  const patternId = useUiStore((s) => s.patternId);
  const patternName = useProjectStore(
    (s) => s.project.patterns.find((p) => p.id === patternId)?.name ?? "the pattern",
  );

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
          className="flex items-center gap-2 border-b border-line bg-panel px-2 py-1"
        >
          <span className="caption">Tool</span>
          <Segmented
            label="Tool"
            size="sm"
            options={TOOL_OPTIONS}
            value={tool}
            onChange={setTool}
          />
          <span className="ml-2 hidden min-w-0 text-2xs leading-tight text-ink-dim lg:inline">
            {toolHint(tool, patternName)}
          </span>
          <span className="ml-auto flex shrink-0 items-center max-xl:hidden gap-1.5 text-2xs whitespace-nowrap text-ink-dim">
            {songMode ? (
              <>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-hot" />
                Song mode
              </>
            ) : (
              "Pattern mode · L switches"
            )}
          </span>
        </div>
        <Timeline />
      </div>
    </div>
  );
}
