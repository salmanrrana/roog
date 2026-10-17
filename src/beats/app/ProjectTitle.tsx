import { useRef, useState } from "react";
import { renameProject } from "@/core/commands";
import { useSaveStatus } from "@/persistence";
import { uniqueProjectName } from "@/persistence/projects";
import { edit, useProjectStore } from "@/state/project-store";
import { RenameField } from "@/ui/RenameField";

/**
 * The project name as a button; click to rename in place (the name is made unique among saved
 * projects). Focus returns to it afterwards.
 */
export function ProjectTitle() {
  const name = useProjectStore((s) => s.project.name);
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  if (editing)
    return (
      <RenameField
        value={name}
        label="Project name"
        className="w-48 text-sm"
        onRename={(next) => {
          const id = useProjectStore.getState().project.id;
          void uniqueProjectName(next, id).then((unique) => edit((p) => renameProject(p, unique)));
        }}
        onDone={() => {
          setEditing(false);
          requestAnimationFrame(() => button.current?.focus());
        }}
      />
    );

  return (
    <button
      ref={button}
      type="button"
      aria-label="Rename project"
      title={`${name} · click to rename`}
      onClick={() => setEditing(true)}
      className="group flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5 hover:bg-panel-2"
    >
      <span className="max-w-24 truncate text-sm xl:max-w-32 2xl:max-w-48 font-semibold text-ink">
        {name}
      </span>
      <span
        aria-hidden="true"
        className="hidden text-xs text-ink-dim group-hover:inline group-focus-visible:inline"
      >
        ✎
      </span>
    </button>
  );
}

const SAVE_LOOK = {
  saved: { dot: "bg-acid", text: "Saved" },
  saving: { dot: "bg-amber", text: "Saving…" },
  error: { dot: "bg-rec", text: "Not saved" },
} as const;

/** Autosave state next to the project name: Saved / Saving… / Not saved (error in the tooltip). */
export function SaveStatusBadge() {
  const status = useSaveStatus();
  const look = SAVE_LOOK[status.state];
  const title = status.state === "error" ? status.message : look.text;
  return (
    <span
      role="status"
      aria-label="Save status"
      title={title}
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${look.dot}`} />
      <span className="caption">{look.text}</span>
    </span>
  );
}
