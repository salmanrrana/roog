/**
 * Decoded sample cache shared by the live engine and WAV export. Factory sounds
 * render through an OfflineAudioContext; user samples decode from their stored
 * blob. Loads start on sync (preload), and `getBuffer` stays synchronous for the
 * instruments. AudioBuffers aren't tied to a context, so one cache serves both.
 */
import { sampleSource } from "@/core/samples";
import type { Project } from "@/core/schema";
// Direct import (not the barrel): persistence/projects.ts imports the engine.
import { getSampleBlob } from "@/persistence/samples";
import { getFactorySound } from "@/sounds/factory";

const RENDER_RATE = 48000;

const ready = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | undefined>>();

/** The decoded buffer for a sample id, or undefined while it loads (or if it can't). */
export function getBuffer(sampleId: string): AudioBuffer | undefined {
  return ready.get(sampleId);
}

/** Load (once) and cache a sample. Resolves undefined for unknown or broken samples. */
export function loadBuffer(sampleId: string): Promise<AudioBuffer | undefined> {
  let promise = loading.get(sampleId);
  if (!promise) {
    promise = decode(sampleId).then(
      (buffer) => {
        if (buffer) ready.set(sampleId, buffer);
        return buffer;
      },
      (error: unknown) => {
        console.warn(`Could not load sample ${sampleId}`, error);
        return undefined;
      },
    );
    loading.set(sampleId, promise);
  }
  return promise;
}

/** Start loading every sample the project's channels use; resolves when all are settled. */
export function preloadProject(project: Project): Promise<unknown> {
  const pending: Promise<unknown>[] = [];
  for (const channel of project.channels) {
    if (channel.sampleId && !ready.has(channel.sampleId))
      pending.push(loadBuffer(channel.sampleId));
  }
  return Promise.all(pending);
}

async function decode(sampleId: string): Promise<AudioBuffer | undefined> {
  const source = sampleSource(sampleId);
  if (source === "factory") {
    const sound = getFactorySound(sampleId);
    if (!sound) return undefined;
    const ctx = new OfflineAudioContext(2, Math.ceil(sound.seconds * RENDER_RATE), RENDER_RATE);
    sound.render(ctx);
    return ctx.startRendering();
  }
  if (source === "user") {
    const blob = await getSampleBlob(sampleId);
    if (!blob) return undefined;
    const ctx = new OfflineAudioContext(2, 1, RENDER_RATE);
    return ctx.decodeAudioData(await blob.arrayBuffer());
  }
  return undefined;
}
