import { useEffect, useRef, useState } from "react";
import { renameProject } from "@/core/commands";
import { createId } from "@/core/ids";
import {
  type ProjectMeta,
  deleteProject,
  duplicateProject,
  errorMessage,
  listProjects,
  openProject,
} from "@/persistence";
import { edit, useProjectStore } from "@/state/project-store";
import { toast } from "@/ui/toast";

const rowButton =
  "rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] uppercase hover:border-ink-dim disabled:opacity-40";

interface ProjectsDialogProps {
  /** Focus the name field on open (the menu's "Rename…"). */
  readonly focusName: boolean;
  readonly onClose: () => void;
}

/** Modal list of saved projects: rename the open one; open, duplicate or delete the rest. */
export function ProjectsDialog({ focusName, onClose }: ProjectsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const currentId = useProjectStore((s) => s.project.id);
  const currentName = useProjectStore((s) => s.project.name);
  const [rows, setRows] = useState<readonly ProjectMeta[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Typing a new name is one undo step.
  const [renameGesture] = useState(createId);

  function refresh() {
    listProjects().then(setRows, (error: unknown) =>
      toast(`Couldn't list projects: ${errorMessage(error)}`, "error"),
    );
  }

  useEffect(() => {
    dialog.current?.showModal();
    refresh();
  }, []);

  async function act(action: () => Promise<void>, failure: string, close = false) {
    try {
      await action();
      if (close) dialog.current?.close();
      else refresh();
    } catch (error) {
      toast(`${failure}: ${errorMessage(error)}`, "error");
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-sm border-2 border-hot bg-panel p-0 text-ink shadow-2xl shadow-black/70 backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-xl tracking-wide uppercase">Projects</h2>
          <span className="font-mono text-[10px] text-ink-dim uppercase">
            Saved on this machine
          </span>
        </header>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-ink-dim uppercase">Open project name</span>
          <input
            key={currentId}
            defaultValue={currentName}
            autoFocus={focusName}
            onFocus={(event) => focusName && event.currentTarget.select()}
            onChange={(event) => {
              const name = event.currentTarget.value;
              edit((p) => renameProject(p, name), renameGesture);
            }}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            className="rounded-sm border border-line bg-well px-2 py-1 text-sm outline-none focus:border-focus"
          />
        </label>

        <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-sm border border-line bg-well">
          {rows === null && <li className="px-3 py-2 text-sm text-ink-dim">Loading…</li>}
          {rows?.map((row) => {
            const isOpen = row.id === currentId;
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {isOpen ? currentName : row.name}
                    {isOpen && (
                      <span className="ml-2 font-mono text-[10px] text-acid uppercase">open</span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-ink-dim">
                    Edited {new Date(row.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isOpen}
                  className={rowButton}
                  onClick={() => void act(() => openProject(row.id), "Couldn't open it", true)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={rowButton}
                  onClick={() => void act(() => duplicateProject(row.id), "Couldn't duplicate it")}
                >
                  Duplicate
                </button>
                {confirmDelete === row.id ? (
                  <button
                    type="button"
                    autoFocus
                    onBlur={() => setConfirmDelete(null)}
                    className={`${rowButton} border-rec bg-rec text-well`}
                    onClick={() => void act(() => deleteProject(row.id), "Couldn't delete it")}
                  >
                    Sure?
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isOpen}
                    title={isOpen ? "Open another project to delete this one" : undefined}
                    className={`${rowButton} text-rec`}
                    onClick={() => setConfirmDelete(row.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end">
          <button type="button" className={rowButton} onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
