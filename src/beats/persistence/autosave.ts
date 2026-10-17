/**
 * Autosave: every project change is written to IndexedDB about 0.6 s after the
 * last edit, and never more than ~1 s after the first unsaved one, so a killed
 * tab loses at most about a second. The write runs in idle time so painting
 * steps or dragging notes never stutters, and hiding or closing the tab writes
 * right away.
 */
import type { Project } from "@/core/schema";
import { useProjectStore } from "@/state/project-store";
import { toast } from "@/ui/toast";
import { type ProjectMeta, db } from "./db";

const DEBOUNCE_MS = 600;
const MAX_WAIT_MS = 850;
const IDLE_TIMEOUT_MS = 150;

/** The project object last written (or loaded). Equal reference = nothing to save. */
let saved: Project | null = null;
let dirtySince: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let idle: (() => void) | undefined;
let failing = false;
/** The latest write, so a flush that finds nothing new still waits for it. */
let writing: Promise<void> = Promise.resolve();

/** Write a project row and its list entry, stamping `updatedAt` on the stored copy. */
export async function writeProject(project: Project): Promise<void> {
  const stamped: Project = { ...project, updatedAt: Date.now() };
  const meta: ProjectMeta = {
    id: stamped.id,
    name: stamped.name,
    createdAt: stamped.createdAt,
    updatedAt: stamped.updatedAt,
  };
  const tx = (await db()).transaction(["projects", "projectMeta"], "readwrite");
  await Promise.all([
    tx.objectStore("projects").put(stamped),
    tx.objectStore("projectMeta").put(meta),
    tx.done,
  ]);
}

/** Tell autosave this exact project object is already on disk (call before loadProject). */
export function markSaved(project: Project): void {
  saved = project;
}

/** Write the current project now if it has unsaved changes. Rejects if the write fails. */
export async function flushSave(): Promise<void> {
  clearTimeout(timer);
  idle?.();
  timer = undefined;
  idle = undefined;
  dirtySince = null;

  const { project } = useProjectStore.getState();
  if (project === saved) return writing;
  saved = project;
  writing = writeProject(project);
  try {
    await writing;
    failing = false;
  } catch (error) {
    // Unsaved again: the next edit or flush retries.
    if (saved === project) saved = null;
    throw error;
  }
}

/** Start watching the project store. Call once, after the boot project is loaded. */
export function startAutosave(): void {
  useProjectStore.subscribe(({ project }, previous) => {
    if (project !== previous.project && project !== saved) schedule();
  });
  window.addEventListener("pagehide", flushQuietly);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushQuietly();
  });
}

function schedule(): void {
  const now = performance.now();
  dirtySince ??= now;
  clearTimeout(timer);
  timer = setTimeout(whenIdle, Math.max(0, Math.min(DEBOUNCE_MS, dirtySince + MAX_WAIT_MS - now)));
}

function whenIdle(): void {
  timer = undefined;
  if ("requestIdleCallback" in window) {
    const handle = requestIdleCallback(flushQuietly, { timeout: IDLE_TIMEOUT_MS });
    idle = () => cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(flushQuietly, 0);
    idle = () => clearTimeout(handle);
  }
}

function flushQuietly(): void {
  flushSave().catch((error: unknown) => {
    // One toast per failure streak, not one per edit.
    if (failing) return;
    failing = true;
    toast(`Autosave failed: ${errorMessage(error)}`, "error");
  });
}

/** A readable message from anything thrown. */
export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "this browser is out of storage space.";
  return error instanceof Error ? error.message : String(error);
}
