/**
 * Local persistence: projects and samples in IndexedDB, autosave, and
 * .roogbeats / WAV files. Work is saved on this machine only.
 */
import { parseProject } from "@/core/migrate";
import { loadProject, useProjectStore } from "@/state/project-store";
import { toast } from "@/ui/toast";
import { errorMessage, flushSave, markSaved, startAutosave, writeProject } from "./autosave";
import { db, requestPersistentStorage } from "./db";
import { LAST_PROJECT_KEY } from "./projects";
import { loadSampleLibrary } from "./samples";

export type { ProjectMeta } from "./db";
export {
  deleteProject,
  duplicateProject,
  exportProjectFile,
  exportWav,
  importProjectFile,
  listProjects,
  newProject,
  openProject,
} from "./projects";
export {
  deleteSample,
  getSampleBlob,
  importAudioFiles,
  importSample,
  type SampleMeta,
  useSampleLibrary,
} from "./samples";
export { FILE_EXTENSION } from "./file-format";
export { errorMessage } from "./autosave";

/**
 * Open the last project (or save the starter project on a first visit) and start
 * autosaving. main.tsx awaits this once before the first render. Never rejects:
 * if storage is unavailable the app still runs, and the user is told.
 */
export async function bootPersistence(): Promise<void> {
  try {
    const database = await db();
    await loadSampleLibrary();

    // The last open project, else the most recently edited one.
    const lastId = await database.get("kv", LAST_PROJECT_KEY);
    const newestId = (await database.getAll("projectMeta")).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )[0]?.id;
    const row =
      (lastId === undefined ? undefined : await database.get("projects", lastId)) ??
      (newestId === undefined ? undefined : await database.get("projects", newestId));
    const parsed = row === undefined ? undefined : parseProject(row);

    if (parsed?.ok) {
      markSaved(parsed.project);
      loadProject(parsed.project);
    } else {
      // First visit, or the last project is unreadable: keep the starter project
      // (it has its own id, so a broken row is left untouched for later).
      if (parsed) toast(`Couldn't open your last project: ${parsed.error}`, "error");
      const { project } = useProjectStore.getState();
      await writeProject(project);
      await database.put("kv", project.id, LAST_PROJECT_KEY);
      markSaved(project);
    }
    startAutosave();
  } catch (error) {
    toast(`Saving is off: this browser blocked local storage (${errorMessage(error)})`, "error");
  }
}

/** Write the current project right now (Ctrl+S). Shows a toast either way. */
export async function saveNow(): Promise<void> {
  try {
    await flushSave();
    requestPersistentStorage();
    toast("Saved");
  } catch (error) {
    toast(`Couldn't save: ${errorMessage(error)}`, "error");
  }
}
