import { create } from "zustand";
import { USER_PREFIX } from "@/core/samples";
import { toast } from "@/ui/toast";
import { type StoredSample, db } from "./db";

/** An imported sample, shared by all projects. The file bytes live in IndexedDB. */
export interface SampleMeta {
  /** USER_PREFIX + SHA-256 of the file bytes. */
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly createdAt: number;
}

/** Reactive list of imported samples for the browser panel (oldest first). */
export const useSampleLibrary = create<{ readonly samples: readonly SampleMeta[] }>()(() => ({
  samples: [],
}));

/** The content-hash id a file gets. The same bytes always give the same id. */
export async function sampleIdOf(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return (
    USER_PREFIX +
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Store an audio file and list it. The same file twice gives the same id.
 * Rejects (with a readable message) when the file isn't audio the browser can decode.
 */
export async function importSample(file: File): Promise<SampleMeta> {
  return (await addSample(file)).sample;
}

/** importSample, plus whether the file was new (`added`) or already in the library. */
async function addSample(file: File): Promise<{ sample: SampleMeta; added: boolean }> {
  const bytes = await file.arrayBuffer();
  const id = await sampleIdOf(bytes);
  const existing = useSampleLibrary.getState().samples.find((sample) => sample.id === id);
  if (existing) return { sample: existing, added: false };

  // A one-sample offline context only decodes; it never touches the audio device.
  // decodeAudioData detaches its input, so give it a copy.
  try {
    await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error(`"${file.name}" isn't an audio file this browser can play.`);
  }

  const stored: StoredSample = {
    id,
    name: file.name.replace(/\.[^.]+$/, "") || file.name,
    size: file.size,
    createdAt: Date.now(),
    blob: new Blob([bytes], { type: file.type }),
  };
  await storeSample(stored);
  return { sample: withoutBlob(stored), added: true };
}

const AUDIO_FILE = /\.(wav|mp3|ogg|oga|flac|aiff?|m4a|aac|opus|webm)$/i;

/**
 * Import picked or dropped files into the library, in order, and report it: one toast
 * for the new ones ("Imported 2 samples"), one for files already in the library, and
 * an error toast per file that isn't audio or fails. Returns every sample that is now
 * in the library (new and already known), in input order.
 */
export async function importAudioFiles(files: readonly File[]): Promise<SampleMeta[]> {
  const imported: SampleMeta[] = [];
  const known: SampleMeta[] = [];
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith("audio/") && !AUDIO_FILE.test(file.name)) {
      toast(`${file.name} isn't an audio file`, "error");
      continue;
    }
    try {
      const result = await addSample(file);
      imported.push(result.sample);
      if (result.added) added += 1;
      else known.push(result.sample);
    } catch (error) {
      toast(error instanceof Error ? error.message : `Couldn't import ${file.name}`, "error");
    }
  }
  if (added > 0) toast(`Imported ${added} sample${added === 1 ? "" : "s"}`);
  const [only] = known;
  if (known.length === 1 && only) toast(`“${only.name}” is already in My samples`);
  else if (known.length > 1) toast(`${known.length} files are already in My samples`);
  return imported;
}

/** The stored file for a user sample id (the engine decodes it). */
export async function getSampleBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get("samples", id))?.blob;
}

/**
 * Remove a sample from the library. Channels that still use it go silent. Returns a
 * function that puts it back (file included), for an Undo toast.
 */
export async function deleteSample(id: string): Promise<() => Promise<void>> {
  const database = await db();
  const row = await database.get("samples", id);
  await database.delete("samples", id);
  useSampleLibrary.setState((state) => ({
    samples: state.samples.filter((sample) => sample.id !== id),
  }));
  return async () => {
    if (row) await storeSample(row);
  };
}

/** Write a sample row and list it (used by import and by .roogbeats files). */
export async function storeSample(sample: StoredSample): Promise<void> {
  await (await db()).put("samples", sample);
  useSampleLibrary.setState((state) => ({
    samples: [...state.samples.filter((item) => item.id !== sample.id), withoutBlob(sample)],
  }));
}

/** Fill the library list from IndexedDB. Called once at boot. */
export async function loadSampleLibrary(): Promise<void> {
  const rows = await (await db()).getAll("samples");
  useSampleLibrary.setState({
    samples: rows.map(withoutBlob).sort((a, b) => a.createdAt - b.createdAt),
  });
}

function withoutBlob({ id, name, size, createdAt }: StoredSample): SampleMeta {
  return { id, name, size, createdAt };
}
