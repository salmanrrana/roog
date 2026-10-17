/**
 * Project-level actions for the project menu: list, new, open, duplicate,
 * delete, and .roogbeats / WAV files. Every action that leaves the current
 * project saves it first, so switching never drops edits. New, duplicated and
 * imported projects always get a name no other saved project uses.
 */
import { uniqueName } from "@/core/commands";
import { DEFAULT_PROJECT_NAME, createProject } from "@/core/defaults";
import { createId } from "@/core/ids";
import { parseProject } from "@/core/migrate";
import type { PlaybackScope } from "@/core/schedule";
import type { Project } from "@/core/schema";
import { engine } from "@/engine";
import { loadProject, useProjectStore } from "@/state/project-store";
import { flushSave, markSaved, writeProject } from "./autosave";
import { type ProjectMeta, db, requestPersistentStorage } from "./db";
import { FILE_EXTENSION, decodeProjectFile, encodeProjectFile, userSampleIds } from "./file-format";
import { getSampleBlob, sampleIdOf, storeSample, useSampleLibrary } from "./samples";

export const LAST_PROJECT_KEY = "lastProjectId";

/** Every saved project, most recently edited first. */
export async function listProjects(): Promise<ProjectMeta[]> {
  await flushSave();
  const rows = await (await db()).getAll("projectMeta");
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** `base`, or `base 2`, `base 3`… if a saved project already uses it. `ignoreId` skips that project's own name (renaming). */
export async function uniqueProjectName(base: string, ignoreId?: string): Promise<string> {
  const rows = await listProjects();
  return uniqueName(
    base,
    rows.filter((row) => row.id !== ignoreId).map((row) => row.name),
  );
}

/** Read and validate a stored project. Rejects with a readable message. */
export async function readProject(id: string): Promise<Project> {
  const row = await (await db()).get("projects", id);
  if (!row) throw new Error("That project is gone.");
  const parsed = parseProject(row);
  if (!parsed.ok) throw new Error(`That project can't be opened: ${parsed.error}`);
  return parsed.project;
}

/** Make `project` the open project. `stored` = it is already on disk as-is. */
export async function switchTo(project: Project, stored: boolean): Promise<void> {
  await flushSave();
  if (!stored) await writeProject(project);
  await (await db()).put("kv", project.id, LAST_PROJECT_KEY);
  engine.stop();
  markSaved(project);
  loadProject(project);
}

/** Start and open a new project: "blank" = the kit with no notes, "demo" = the starter groove. */
export async function newProject(kind: "blank" | "demo" = "blank"): Promise<void> {
  const name = await uniqueProjectName(DEFAULT_PROJECT_NAME);
  await switchTo(createProject(name, Date.now(), kind), false);
}

/** Open a saved project by id. */
export async function openProject(id: string): Promise<void> {
  await switchTo(await readProject(id), true);
}

/** Save a copy of a project as "<name> copy" (then "copy 2"…). Does not open it. */
export async function duplicateProject(id: string): Promise<void> {
  const source = await readProject(id);
  const name = await uniqueProjectName(`${source.name} copy`);
  const now = Date.now();
  await writeProject({
    ...source,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
  });
}

/** Delete a saved project. The open project can't be deleted. */
export async function deleteProject(id: string): Promise<void> {
  if (id === useProjectStore.getState().project.id)
    throw new Error("Can't delete the open project.");
  const tx = (await db()).transaction(["projects", "projectMeta"], "readwrite");
  await Promise.all([
    tx.objectStore("projects").delete(id),
    tx.objectStore("projectMeta").delete(id),
    tx.done,
  ]);
}

/**
 * Import a .roogbeats file: store its samples, then open it as a new project
 * (a fresh id and a unique name, so importing never overwrites or shadows an
 * existing project). Returns the opened project's name.
 */
export async function importProjectFile(file: File): Promise<string> {
  const decoded = decodeProjectFile(await file.text());
  if (!decoded.ok) throw new Error(decoded.error);

  const known = new Set(useSampleLibrary.getState().samples.map((sample) => sample.id));
  for (const sample of decoded.samples) {
    if (known.has(sample.id)) continue;
    const bytes = await sample.blob.arrayBuffer();
    if ((await sampleIdOf(bytes)) !== sample.id)
      throw new Error(`The sample "${sample.name}" in this file is damaged.`);
    await storeSample({
      id: sample.id,
      name: sample.name,
      size: bytes.byteLength,
      createdAt: Date.now(),
      blob: sample.blob,
    });
  }

  const name = await uniqueProjectName(decoded.project.name);
  await switchTo({ ...decoded.project, id: createId(), name }, false);
  requestPersistentStorage();
  return name;
}

/**
 * Export the open project with its user samples as a .roogbeats file.
 * Returns the file name, or null if the user cancelled.
 */
export async function exportProjectFile(): Promise<string | null> {
  const { project } = useProjectStore.getState();
  const saved = await saveFile(
    `${safeFileName(project.name)}${FILE_EXTENSION}`,
    { description: "ROOG Beats project", accept: { "application/json": [FILE_EXTENSION] } },
    async () => {
      const library = new Map(useSampleLibrary.getState().samples.map((s) => [s.id, s.name]));
      const samples = await Promise.all(
        userSampleIds(project).map(async (id) => {
          const blob = await getSampleBlob(id);
          return blob ? [{ id, name: library.get(id) ?? id, blob }] : [];
        }),
      );
      const text = await encodeProjectFile(project, samples.flat());
      return new Blob([text], { type: "application/json" });
    },
  );
  if (saved !== null) requestPersistentStorage();
  return saved;
}

/**
 * Render a scope to WAV and save it. `label` names the file, e.g. "song".
 * Returns the file name, or null if the user cancelled.
 */
export async function exportWav(
  scope: PlaybackScope,
  label: string,
  onProgress: (fraction: number) => void,
): Promise<string | null> {
  const { name } = useProjectStore.getState().project;
  const saved = await saveFile(
    `${safeFileName(`${name} - ${label}`)}.wav`,
    { description: "WAV audio", accept: { "audio/wav": [".wav"] } },
    () => engine.renderWav(scope, onProgress),
  );
  if (saved !== null) requestPersistentStorage();
  return saved;
}

/** Strip characters that file systems reject. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "beat";
}

interface SaveFileType {
  readonly description: string;
  readonly accept: Record<string, readonly string[]>;
}

// File System Access isn't in TypeScript's DOM lib yet (Chromium only).
interface SaveFilePicker {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: readonly SaveFileType[];
  }): Promise<FileSystemFileHandle>;
}

/**
 * Save a blob with the native "Save as" dialog where supported, else as a download.
 * The dialog opens before `produce` runs, while the click still counts as a user
 * gesture. Returns the saved file name (the picker's, which the user may have
 * changed), or null if the user cancelled.
 */
async function saveFile(
  name: string,
  type: SaveFileType,
  produce: () => Promise<Blob>,
): Promise<string | null> {
  if ("showSaveFilePicker" in window) {
    let handle: FileSystemFileHandle;
    try {
      // I/O boundary: the feature check above guarantees the method exists.
      handle = await (window as unknown as SaveFilePicker).showSaveFilePicker({
        suggestedName: name,
        types: [type],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      throw error;
    }
    const blob = await produce();
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return handle.name;
  }

  const url = URL.createObjectURL(await produce());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
