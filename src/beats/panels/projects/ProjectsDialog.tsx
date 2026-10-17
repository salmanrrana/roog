import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { renameProject } from "@/core/commands";
import {
  type ProjectMeta,
  deleteProject,
  duplicateProject,
  errorMessage,
  listProjects,
  openProject,
} from "@/persistence";
import { uniqueProjectName } from "@/persistence/projects";
import { edit, useProjectStore } from "@/state/project-store";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { toast } from "@/ui/toast";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", then a short date after a week. */
function editedAgo(time: number, now = Date.now()): string {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return relative.format(-days, "day");
  return shortDate.format(time);
}

/** Escape handled here, not by the dialog (which would close). */
function onEscape(event: KeyboardEvent, run: () => void): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  run();
}

// Fixed widths so swapping a row into its confirm state moves nothing.
const ROW_BUTTON = "w-20";

interface ProjectsDialogProps {
  /** Focus and select the name field on open (the menu's "Rename…"). */
  readonly focusName: boolean;
  readonly onClose: () => void;
}

/** Modal list of saved projects: rename the open one; open, duplicate or delete the rest. */
export function ProjectsDialog({ focusName, onClose }: ProjectsDialogProps) {
  const currentId = useProjectStore((s) => s.project.id);
  const currentName = useProjectStore((s) => s.project.name);
  const [rows, setRows] = useState<readonly ProjectMeta[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draft, setDraft] = useState(currentName);
  const nameField = useRef<HTMLInputElement>(null);
  // Bumped after each list load so relative times read against a fresh "now".
  const [now, setNow] = useState(Date.now);

  function refresh() {
    listProjects().then(
      (list) => {
        setNow(Date.now());
        setRows(list);
      },
      (error: unknown) => toast(`Couldn't list projects: ${errorMessage(error)}`, "error"),
    );
  }

  useEffect(refresh, []);

  // Undo, or opening another project, changes the name under us: reset the draft.
  const [draftFor, setDraftFor] = useState(currentName);
  if (draftFor !== currentName) {
    setDraftFor(currentName);
    setDraft(currentName);
  }

  useEffect(() => {
    if (!focusName) return;
    // After the Dialog's showModal(), which moves focus to the first control.
    const frame = requestAnimationFrame(() => nameField.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [focusName]);

  /** Apply the draft as one undo step, made unique ("Beat 2") if another project has it. An empty or unchanged draft reverts. */
  async function commitName() {
    const name = draft.trim();
    if (!name || name === currentName) return setDraft(currentName);
    try {
      const unique = await uniqueProjectName(name, currentId);
      edit((p) => renameProject(p, unique));
      setDraft(unique);
      refresh();
    } catch (error) {
      toast(`Couldn't rename it: ${errorMessage(error)}`, "error");
    }
  }

  async function act(action: () => Promise<void>, failure: string, close = false) {
    try {
      await action();
      if (close) onClose();
      else refresh();
    } catch (error) {
      toast(`${failure}: ${errorMessage(error)}`, "error");
    }
  }

  // The open project first, then the rest most recently edited first (listProjects' order).
  const ordered = rows && [
    ...rows.filter((row) => row.id === currentId),
    ...rows.filter((row) => row.id !== currentId),
  ];

  return (
    <Dialog
      title="Projects"
      onClose={onClose}
      aside={<span className="caption ml-auto">Saved in this browser</span>}
    >
      <label className="flex flex-col gap-1">
        <span className="caption">Project name</span>
        <input
          ref={nameField}
          aria-label="Project name"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => void commitName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void commitName();
            // First Escape reverts an edited draft; with nothing to revert it closes the dialog.
            if (draft !== currentName) onEscape(event, () => setDraft(currentName));
          }}
          className="h-8 rounded-sm border border-line bg-well px-2 text-sm text-ink outline-none focus:border-focus"
        />
      </label>

      <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-sm border border-line bg-well">
        {ordered === null && <li className="px-3 py-2 text-sm text-ink-dim">Loading…</li>}
        {ordered?.map((row) => {
          const isOpen = row.id === currentId;
          const name = isOpen ? currentName : row.name;
          const confirming = confirmDelete === row.id;
          return (
            <li
              key={row.id}
              onKeyDown={(event) => confirming && onEscape(event, () => setConfirmDelete(null))}
              className={`flex h-12 items-center gap-2 border-b border-l-[3px] border-b-line pr-2 pl-3 last:border-b-0 ${isOpen ? "border-l-acid" : "border-l-transparent"} ${confirming ? "bg-rec/10" : ""}`}
            >
              {/* Keyed so the confirm buttons mount fresh (autoFocus only works on mount). */}
              {confirming ? (
                <Fragment key="confirm">
                  {/* Only the name truncates, so the warning always shows. */}
                  <p className="flex min-w-0 flex-1 text-sm whitespace-pre text-ink">
                    <span className="shrink-0">Delete “</span>
                    <span className="truncate">{name}</span>
                    <span className="shrink-0">”?</span>
                    <span className="shrink-0 text-ink-dim"> Can't be undone.</span>
                  </p>
                  <Button
                    size="sm"
                    autoFocus
                    className={`${ROW_BUTTON} border-rec! bg-rec! text-well!`}
                    onClick={() => void act(() => deleteProject(row.id), "Couldn't delete it")}
                  >
                    Delete
                  </Button>
                  <Button size="sm" className={ROW_BUTTON} onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </Button>
                </Fragment>
              ) : (
                <Fragment key="row">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className={`truncate ${isOpen ? "font-bold" : ""}`}>{name}</span>
                      {isOpen && <span className="caption shrink-0 text-acid!">Open now</span>}
                    </p>
                    {!isOpen && (
                      <p className="font-mono text-2xs text-ink-dim">
                        Edited {editedAgo(row.updatedAt, now)}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={isOpen}
                    aria-label={`Open ${name}`}
                    className={ROW_BUTTON}
                    onClick={() => void act(() => openProject(row.id), "Couldn't open it", true)}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Duplicate ${name}`}
                    className={ROW_BUTTON}
                    onClick={() =>
                      void act(() => duplicateProject(row.id), "Couldn't duplicate it")
                    }
                  >
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isOpen}
                    aria-label={`Delete ${name}`}
                    title={isOpen ? "Open another project to delete this one" : undefined}
                    className={ROW_BUTTON}
                    onClick={() => setConfirmDelete(row.id)}
                  >
                    Delete
                  </Button>
                </Fragment>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
