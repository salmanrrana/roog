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
import { flushSave } from "@/persistence/autosave";
import { useProjectStore } from "@/state/project-store";
import { currentScope, useUiStore } from "@/state/ui-store";
import { Button } from "@/ui/Button";
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

/** Leave Beats for another ROOG app in this tab. The project autosaves first. */
async function goTo(page: string): Promise<void> {
  await flushSave();
  window.location.assign(page);
}

/** The transport bar's Project dropdown: new, open/manage, rename, save, files, WAV export and links. */
export function ProjectMenu() {
  const [dialog, setDialog] = useState<"closed" | "open" | "rename">("closed");
  // Long jobs (WAV render, export) show their status on the button.
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Run a file-saving job with busy text on the button; toast the saved file's name. */
  async function run(label: string, job: () => Promise<string | null>, failure: string) {
    setBusy(label);
    await attempt(async () => {
      const file = await job();
      if (file !== null) toast(`Saved “${file}”`);
    }, failure);
    setBusy(null);
  }

  function renderWav(kind: "song" | "pattern", label: string) {
    const scope = currentScope({ ...useUiStore.getState(), playMode: kind });
    let shown = -1;
    void run(
      "Rendering…",
      () =>
        exportWav(scope, label, (fraction) => {
          // Re-render only when the whole percent changes.
          const percent = Math.floor(fraction * 100);
          if (percent !== shown) setBusy(`Rendering ${(shown = percent)}%`);
        }),
      "WAV export failed",
    );
  }

  function open(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const patternName =
      findPattern(useProjectStore.getState().project, useUiStore.getState().patternId)?.name ??
      "pattern";
    const otherApp = "Your beat is saved";
    openMenu({ x: rect.left, y: rect.bottom + 4 }, [
      { heading: "Project" },
      {
        label: "New project",
        hint: "Same sounds, empty pattern",
        onSelect: () => void attempt(() => newProject("blank"), "Couldn't start a project"),
      },
      {
        label: "New from demo beat",
        hint: "Starts with a groove",
        onSelect: () => void attempt(() => newProject("demo"), "Couldn't start a project"),
      },
      { label: "Open / manage…", onSelect: () => setDialog("open") },
      { label: "Rename…", onSelect: () => setDialog("rename") },
      "separator",
      { label: "Save", shortcut: "Ctrl+S", onSelect: () => void saveNow() },
      { heading: "Files" },
      { label: `Import ${FILE_EXTENSION}…`, onSelect: () => fileInput.current?.click() },
      {
        label: `Export ${FILE_EXTENSION}…`,
        hint: "Project plus your samples",
        onSelect: () => void run("Exporting…", exportProjectFile, "Export failed"),
      },
      { heading: "Audio" },
      {
        label: "Export WAV: whole song",
        hint: "Renders the playlist",
        onSelect: () => renderWav("song", "song"),
      },
      {
        label: "Export WAV: current pattern",
        hint: patternName,
        onSelect: () => renderWav("pattern", patternName),
      },
      { heading: "Other ROOG apps" },
      {
        label: "Eurorack ↗",
        hint: otherApp,
        onSelect: () => void attempt(() => goTo("./index.html"), "Couldn't save"),
      },
      {
        label: "Studio ↗",
        hint: otherApp,
        onSelect: () => void attempt(() => goTo("./studio.html"), "Couldn't save"),
      },
    ]);
  }

  return (
    <>
      {/* Fixed width (just fits "Rendering 100%") so busy text does not shift the header. */}
      <Button
        disabled={busy !== null}
        aria-label="Project menu"
        aria-haspopup="menu"
        onClick={(event) => open(event.currentTarget)}
        className="w-28 tabular-nums disabled:text-amber!"
      >
        {busy ?? "Project ▾"}
      </Button>
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
              toast(`Opened “${await importProjectFile(file)}”`);
            }, "Import failed");
        }}
      />
      {dialog !== "closed" && (
        <ProjectsDialog focusName={dialog === "rename"} onClose={() => setDialog("closed")} />
      )}
    </>
  );
}
