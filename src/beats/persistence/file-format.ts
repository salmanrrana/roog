/**
 * The .roogbeats file: one JSON document holding the project and every user
 * sample it plays (base64), so a file opens the same on any machine.
 * Pure: no IndexedDB or DOM, so it is easy to test.
 */
import * as z from "zod/mini";
import { parseProject } from "@/core/migrate";
import { USER_PREFIX } from "@/core/samples";
import type { Project } from "@/core/schema";

export const FILE_EXTENSION = ".roogbeats";
const FORMAT = "roog-beats";
const FORMAT_VERSION = 1;

const fileSchema = z.object({
  format: z.literal(FORMAT),
  formatVersion: z.literal(FORMAT_VERSION),
  /** Checked separately by parseProject (it migrates old versions). */
  project: z.unknown(),
  samples: z.array(
    z.object({
      id: z.string().check(z.startsWith(USER_PREFIX)),
      name: z.string(),
      type: z.string(),
      data: z.string(),
    }),
  ),
});

type ProjectFile = z.infer<typeof fileSchema>;

/** A sample as it goes into or comes out of a file. */
export interface FileSample {
  readonly id: string;
  readonly name: string;
  readonly blob: Blob;
}

export type DecodeResult =
  | { readonly ok: true; readonly project: Project; readonly samples: readonly FileSample[] }
  | { readonly ok: false; readonly error: string };

/** Serialize a project and its user samples into .roogbeats text. */
export async function encodeProjectFile(
  project: Project,
  samples: readonly FileSample[],
): Promise<string> {
  const file: ProjectFile = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    project,
    samples: await Promise.all(
      samples.map(async ({ id, name, blob }) => ({
        id,
        name,
        type: blob.type,
        data: toBase64(new Uint8Array(await blob.arrayBuffer())),
      })),
    ),
  };
  return JSON.stringify(file);
}

/** Read .roogbeats text back. Never throws: junk gives `{ ok: false }` with a reason. */
export function decodeProjectFile(text: string): DecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This isn't a ROOG Beats project file." };
  }
  const file = fileSchema.safeParse(json);
  if (!file.success) return { ok: false, error: "This isn't a ROOG Beats project file." };

  const parsed = parseProject(file.data.project);
  if (!parsed.ok) return parsed;

  try {
    const samples = file.data.samples.map(({ id, name, type, data }) => ({
      id,
      name,
      blob: new Blob([fromBase64(data)], { type }),
    }));
    return { ok: true, project: parsed.project, samples };
  } catch {
    return { ok: false, error: "A sample in this file is damaged." };
  }
}

/** The user sample ids a project plays (factory sounds are built in, so they're skipped). */
export function userSampleIds(project: Project): string[] {
  const ids = project.channels.flatMap((channel) =>
    channel.sampleId?.startsWith(USER_PREFIX) ? [channel.sampleId] : [],
  );
  return [...new Set(ids)];
}

function toBase64(bytes: Uint8Array): string {
  // Chunked so big samples don't overflow the argument limit of fromCharCode.
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
