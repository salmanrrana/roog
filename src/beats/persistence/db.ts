/**
 * The IndexedDB database behind Beats ("roog-beats"). Everything lives on this
 * machine: no server, no account. Rows are read back through parseProject, so
 * the stored shape can evolve with the schema's migrations.
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Project } from "@/core/schema";
import type { SampleMeta } from "./samples";

/** One row of the project list: enough to show it without loading the project. */
export interface ProjectMeta {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A user sample: its list entry plus the original file bytes. */
export interface StoredSample extends SampleMeta {
  readonly blob: Blob;
}

interface BeatsDB extends DBSchema {
  projects: { key: string; value: Project };
  projectMeta: { key: string; value: ProjectMeta };
  samples: { key: string; value: StoredSample };
  /** Small app settings, e.g. "lastProjectId". */
  kv: { key: string; value: string };
}

export type BeatsDatabase = IDBPDatabase<BeatsDB>;

let opening: Promise<BeatsDatabase> | undefined;

/** The shared connection, opened on first use. Rejects when IndexedDB is unavailable. */
export function db(): Promise<BeatsDatabase> {
  opening ??= openDB<BeatsDB>("roog-beats", 1, {
    upgrade(database) {
      database.createObjectStore("projects", { keyPath: "id" });
      database.createObjectStore("projectMeta", { keyPath: "id" });
      database.createObjectStore("samples", { keyPath: "id" });
      database.createObjectStore("kv");
    },
  });
  // Let a later call retry instead of caching a failure forever.
  opening.catch(() => (opening = undefined));
  return opening;
}

let persistAsked = false;

/**
 * Ask the browser not to evict our data under storage pressure. Called after the
 * first explicit save/import/export, when the user has shown the work matters.
 */
export function requestPersistentStorage(): void {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}
