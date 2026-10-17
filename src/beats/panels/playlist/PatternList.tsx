import { useState } from "react";
import { addPattern, clonePattern, removePattern, updatePattern } from "@/core/commands";
import { PALETTE } from "@/core/defaults";
import { patternLength } from "@/core/schedule";
import { BAR_TICKS } from "@/core/timing";
import { edit, useProjectStore } from "@/state/project-store";
import { selectPattern, useUiStore } from "@/state/ui-store";
import { openMenu } from "@/ui/menu";
import { RenameField } from "./RenameField";

const COLOR_NAMES = ["Orange", "Amber", "Lime", "Mint", "Sky", "Indigo", "Violet", "Pink"];

/**
 * Pattern picker. The selected pattern is both what the rack/piano roll edit
 * and the playlist brush (what a click on the timeline places).
 */
export function PatternList() {
  const patterns = useProjectStore((s) => s.project.patterns);
  const selectedId = useUiStore((s) => s.patternId);
  const [renaming, setRenaming] = useState<string | null>(null);

  function add() {
    selectPattern(edit((p) => addPattern(p)));
  }

  function openPatternMenu(at: { x: number; y: number }, patternId: string) {
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
            PALETTE.map((color, index) => ({
              label: COLOR_NAMES[index] ?? color,
              onSelect: () => edit((p) => updatePattern(p, patternId, { color })),
            })),
          ),
      },
      "separator",
      {
        label: "Delete",
        danger: true,
        disabled: patterns.length <= 1,
        onSelect: () => edit((p) => removePattern(p, patternId)),
      },
    ]);
  }

  return (
    <div className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <span className="font-display text-sm tracking-wider text-ink uppercase">Patterns</span>
        <button
          type="button"
          onClick={add}
          aria-label="Add pattern"
          title="Add pattern"
          className="rounded-sm border border-line bg-panel-2 px-2 font-mono text-sm font-bold text-acid hover:border-acid"
        >
          +
        </button>
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
                    onRename={(name) => edit((p) => updatePattern(p, pattern.id, { name }))}
                    onDone={() => setRenaming(null)}
                  />
                </div>
              ) : (
                <button
                  type="button"
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
                  className={`flex w-full items-center gap-2 rounded-sm border px-1.5 py-1 text-left text-xs font-bold uppercase ${active ? "border-amber bg-panel-2 text-ink" : "border-transparent text-ink-dim hover:bg-panel-2 hover:text-ink"}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-2 shrink-0 rounded-[1px]"
                    style={{ background: pattern.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{pattern.name}</span>
                  <span className="font-mono text-[10px] font-normal text-ink-dim">
                    {patternLength(pattern) / BAR_TICKS}
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
