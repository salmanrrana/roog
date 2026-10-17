import { useRef, useState } from "react";
import { findPattern } from "@/core/commands";
import {
  FILE_EXTENSION,
  errorMessage,
  exportProjectFile,
  exportWav,
  importProjectFile,
  newProject,
  saveNow,
} from "@/persistence";
import { useProjectStore } from "@/state/project-store";
import { currentScope, useUiStore } from "@/state/ui-store";
import { openMenu } from "@/ui/menu";
import { toast } from "@/ui/toast";
import { ProjectsDialog } from "./ProjectsDialog";

/** Run a menu action; report failures as an error toast. */
async function attempt(action: () => Promise<unknown>, failure: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    toast(`${failure}: ${errorMessage(error)}`, "error");
  }
}

/** The transport bar's Project dropdown: new, open/manage, rename, save, files and WAV export. */
export function ProjectMenu() {
  const [dialog, setDialog] = useState<"closed" | "open" | "rename">("closed");
  // Long jobs (WAV render, export) show their status on the button.
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(label: string, job: () => Promise<boolean>, done: string, failure: string) {
    setBusy(label);
    await attempt(async () => {
      if (await job()) toast(done);
    }, failure);
    setBusy(null);
  }

  function renderWav(kind: "song" | "pattern") {
    const ui = useUiStore.getState();
    const scope = currentScope({ ...ui, playMode: kind });
    const label =
      kind === "song"
        ? "song"
        : (findPattern(useProjectStore.getState().project, ui.patternId)?.name ?? "pattern");
    let shown = -1;
    void run(
      "Rendering…",
      () =>
        exportWav(scope, label, (fraction) => {
          // Re-render only when the whole percent changes.
          const percent = Math.floor(fraction * 100);
          if (percent !== shown) setBusy(`Rendering ${(shown = percent)}%`);
        }),
      "WAV exported",
      "WAV export failed",
    );
  }

  function open(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    openMenu({ x: rect.left, y: rect.bottom + 4 }, [
      {
        label: "New project",
        onSelect: () => void attempt(newProject, "Couldn't start a project"),
      },
      { label: "Open / manage…", onSelect: () => setDialog("open") },
      { label: "Rename…", onSelect: () => setDialog("rename") },
      { label: "Save", shortcut: "Ctrl+S", onSelect: () => void saveNow() },
      "separator",
      { label: `Import ${FILE_EXTENSION}…`, onSelect: () => fileInput.current?.click() },
      {
        label: `Export ${FILE_EXTENSION}…`,
        onSelect: () =>
          void run("Exporting…", exportProjectFile, "Project exported", "Export failed"),
      },
      "separator",
      { label: "Export WAV: song", onSelect: () => renderWav("song") },
      { label: "Export WAV: current pattern", onSelect: () => renderWav("pattern") },
    ]);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy !== null}
        aria-haspopup="menu"
        onClick={(event) => open(event.currentTarget)}
        className="rounded-sm border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-ink uppercase tabular-nums hover:border-ink-dim disabled:text-amber"
      >
        {busy ?? "Project ▾"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={`${FILE_EXTENSION},application/json`}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file)
            void attempt(async () => {
              await importProjectFile(file);
              toast(`Imported "${file.name}"`);
            }, "Import failed");
        }}
      />
      {dialog !== "closed" && (
        <ProjectsDialog focusName={dialog === "rename"} onClose={() => setDialog("closed")} />
      )}
    </>
  );
}
