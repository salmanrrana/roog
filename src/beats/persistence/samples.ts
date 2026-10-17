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
  const bytes = await file.arrayBuffer();
  const id = await sampleIdOf(bytes);
  const existing = useSampleLibrary.getState().samples.find((sample) => sample.id === id);
  if (existing) return existing;

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
  return withoutBlob(stored);
}

const AUDIO_FILE = /\.(wav|mp3|ogg|oga|flac|aiff?|m4a|aac|opus|webm)$/i;

/**
 * Import picked or dropped files into the library, in order. Non-audio files and
 * failures are skipped with an error toast each; returns what was imported.
 */
export async function importAudioFiles(files: readonly File[]): Promise<SampleMeta[]> {
  const imported: SampleMeta[] = [];
  for (const file of files) {
    if (!file.type.startsWith("audio/") && !AUDIO_FILE.test(file.name)) {
      toast(`${file.name} isn't an audio file`, "error");
      continue;
    }
    try {
      imported.push(await importSample(file));
    } catch (error) {
      toast(error instanceof Error ? error.message : `Couldn't import ${file.name}`, "error");
    }
  }
  return imported;
}

/** The stored file for a user sample id (the engine decodes it). */
export async function getSampleBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get("samples", id))?.blob;
}

/** Remove a sample from the library. Channels that still use it go silent. */
export async function deleteSample(id: string): Promise<void> {
  await (await db()).delete("samples", id);
  useSampleLibrary.setState((state) => ({
    samples: state.samples.filter((sample) => sample.id !== id),
  }));
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
