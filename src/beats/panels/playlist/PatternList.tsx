import { useState } from "react";
import {
  addPattern,
  clonePattern,
  removePattern,
  uniqueName,
  updatePattern,
} from "@/core/commands";
import { SWATCHES } from "@/core/defaults";
import { patternLength } from "@/core/schedule";
import { BAR_TICKS } from "@/core/timing";
import { edit, useProjectStore } from "@/state/project-store";
import { selectPattern, useUiStore } from "@/state/ui-store";
import { Button } from "@/ui/Button";
import { openMenu } from "@/ui/menu";
import { RenameField } from "@/ui/RenameField";
import { toastWithUndo } from "@/ui/toast";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Pattern picker. The selected pattern is both what the rack/piano roll edit
 * and the playlist brush (what a click on the timeline places). Right-click for
 * rename / clone / color / delete; deleting also removes its clips, with Undo.
 */
export function PatternList() {
  const patterns = useProjectStore((s) => s.project.patterns);
  const selectedId = useUiStore((s) => s.patternId);
  const [renaming, setRenaming] = useState<string | null>(null);

  function add() {
    selectPattern(edit((p) => addPattern(p)));
  }

  function openPatternMenu(at: { x: number; y: number }, patternId: string) {
    const { project } = useProjectStore.getState();
    const pattern = project.patterns.find((p) => p.id === patternId);
    if (!pattern) return;
    const clipCount = project.playlist.clips.filter((c) => c.patternId === patternId).length;
    openMenu(at, [
      { label: "Rename", onSelect: () => setRenaming(patternId) },
      {
        label: "Clone",
        onSelect: () => {
          const id = edit((p) => clonePattern(p, patternId));
          if (id) selectPattern(id);
        },
      },
      {
        label: "Color…",
        onSelect: () =>
          openMenu(
            at,
            SWATCHES.map(({ name, color }) => ({
              label: name,
              checked: color === pattern.color,
              onSelect: () => edit((p) => updatePattern(p, patternId, { color })),
            })),
          ),
      },
      "separator",
      {
        label: clipCount > 0 ? `Delete (${plural(clipCount, "clip")})` : "Delete",
        danger: true,
        disabled: patterns.length <= 1,
        ...(patterns.length <= 1 && { hint: "A project needs at least one pattern" }),
        onSelect: () => {
          edit((p) => removePattern(p, patternId));
          const clips = clipCount > 0 ? ` and its ${plural(clipCount, "clip")}` : "";
          toastWithUndo(`Deleted ${pattern.name}${clips}`);
        },
      },
    ]);
  }

  return (
    <div className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <span className="panel-title">Patterns</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={add}
          aria-label="Add pattern"
          title="Add pattern"
          className="font-mono text-sm"
        >
          +
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {patterns.map((pattern) => {
          const active = pattern.id === selectedId;
          return (
            <li key={pattern.id} className="px-1">
              {renaming === pattern.id ? (
                <div className="py-0.5">
                  <RenameField
                    label="Pattern name"
                    value={pattern.name}
                    onRename={(name) =>
                      edit((p) =>
                        updatePattern(p, pattern.id, {
                          // Keep names unique so the picker, rack header and hints stay unambiguous.
                          name: uniqueName(
                            name,
                            p.patterns.filter((x) => x.id !== pattern.id).map((x) => x.name),
                          ),
                        }),
                      )
                    }
                    onDone={() => setRenaming(null)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={pattern.name}
                  aria-pressed={active}
                  onClick={() => selectPattern(pattern.id)}
                  onDoubleClick={() => setRenaming(pattern.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openPatternMenu({ x: event.clientX, y: event.clientY }, pattern.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "F2") setRenaming(pattern.id);
                  }}
                  title="Double-click or F2 to rename · right-click for more"
                  className={`flex w-full items-center gap-2 rounded-sm border px-1.5 py-1 text-left text-xs text-ink ${active ? "border-ink bg-panel-2" : "border-transparent hover:bg-panel-2"}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-3 shrink-0 rounded-[2px]"
                    style={{ background: pattern.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{pattern.name}</span>
                  <span className="shrink-0 font-mono text-2xs text-ink-dim">
                    {plural(patternLength(pattern) / BAR_TICKS, "bar")}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
