/**
 * The audio engine singleton behind the BeatsEngine contract (core/contracts.ts).
 *
 * Nothing audio happens at import: the AudioContext, graph and clock are created on
 * the first play/audition (a user gesture). From then on the graph follows the
 * project store, and while playing a Worker clock wakes the scheduler every 25 ms
 * to queue the next ~100 ms of notes on the audio clock (see transport.ts).
 */
import type { BeatsEngine, NoteTrigger } from "@/core/contracts";
import { collectEvents, type PlaybackScope, scopeLength } from "@/core/schedule";
import type { Project } from "@/core/schema";
import { ticksToSeconds } from "@/core/timing";
import { useProjectStore } from "@/state/project-store";
import { currentScope, useUiStore } from "@/state/ui-store";
import { getBuffer, loadBuffer, preloadProject } from "./buffers";
import { type Clock, createClock } from "./clock";
import { type MixerGraph, createMixerGraph } from "./graph";
import { type Transport, playheadAt, scheduleUntil, startTransport } from "./transport";
import { encodeWav } from "./wav";

const CLOCK_MS = 25;
const LOOKAHEAD = 0.1;
/** Gap between pressing play and the first downbeat, so the first notes aren't late. */
const START_DELAY = 0.05;
/** Notes later than this (e.g. after the tab was frozen) are dropped instead of piling up. */
const MAX_LATE = 0.05;
const AUDITION_SECONDS = 0.3;
const EXPORT_RATE = 44100;
const EXPORT_TAIL = 2;

interface Live {
  readonly ctx: AudioContext;
  readonly graph: MixerGraph;
  readonly clock: Clock;
}

let live: Live | null = null;
let transport: Transport | null = null;
/** Bumped by every play/stop so a play waiting on samples can tell it was cancelled. */
let playToken = 0;
let preview: AudioBufferSourceNode | null = null;

/** Create the audio context, graph and clock once, and resume audio (call from a gesture). */
function ensureLive(): Live {
  if (!live) {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const graph = createMixerGraph(ctx, getBuffer);
    const project = useProjectStore.getState().project;
    graph.sync(project);
    void preloadProject(project);
    useProjectStore.subscribe(({ project: next }) => {
      graph.sync(next);
      void preloadProject(next);
    });
    live = { ctx, graph, clock: createClock(CLOCK_MS, pump) };
  }
  if (live.ctx.state !== "running") void live.ctx.resume();
  return live;
}

/** Clock tick: queue every note that starts before now + lookahead. */
function pump(): void {
  if (!live || !transport) return;
  const { ctx, graph } = live;
  const { project } = useProjectStore.getState();
  const notes = scheduleUntil(transport, project, currentScope(), ctx.currentTime + LOOKAHEAD);
  const tooLate = ctx.currentTime - MAX_LATE;
  for (const note of notes) if (note.time >= tooLate) graph.trigger(note.channelId, note);
}

function play(): void {
  const { ctx, graph, clock } = ensureLive();
  halt(ctx, graph, clock);
  const token = playToken;
  useUiStore.setState({ playing: true });
  // Wait for samples so the first downbeat isn't silent; usually a few ms.
  void preloadProject(useProjectStore.getState().project).then(() => {
    if (token !== playToken) return;
    const { project } = useProjectStore.getState();
    transport = startTransport(ctx.currentTime + START_DELAY, project.bpm, currentScope());
    pump();
    clock.start();
  });
}

/** Stop the clock and silence every voice. */
function halt(ctx: AudioContext, graph: MixerGraph, clock: Clock): void {
  playToken += 1;
  clock.stop();
  transport = null;
  graph.stopAll(ctx.currentTime);
}

function stop(): void {
  if (live) halt(live.ctx, live.graph, live.clock);
  useUiStore.setState({ playing: false });
}

/** Total output delay, so the drawn playhead matches what is heard. */
function outputLatency(ctx: AudioContext): number {
  // outputLatency is missing in some browsers despite the DOM types.
  const output = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
  return ctx.baseLatency + output;
}

function audition(channelId: string, pitch = 60, velocity = 0.8): void {
  const { ctx, graph } = ensureLive();
  const { project } = useProjectStore.getState();
  const sampleId = project.channels.find((channel) => channel.id === channelId)?.sampleId;
  const fire = () => {
    const note: NoteTrigger = {
      time: ctx.currentTime,
      duration: AUDITION_SECONDS,
      pitch,
      velocity,
    };
    graph.trigger(channelId, note);
  };
  if (!sampleId || getBuffer(sampleId)) fire();
  else void loadBuffer(sampleId).then(fire);
}

function previewSample(sampleId: string): void {
  const { ctx, graph } = ensureLive();
  void loadBuffer(sampleId).then((buffer) => {
    if (!buffer) return;
    preview?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(graph.masterInput);
    source.start();
    preview = source;
  });
}

/** Render a scope once (plus a tail) through a fresh graph in an OfflineAudioContext. */
async function renderWav(
  scope: PlaybackScope,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const { project } = useProjectStore.getState();
  await preloadProject(project);
  const length = scopeLength(project, scope);
  const seconds = ticksToSeconds(length, project.bpm) + EXPORT_TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * EXPORT_RATE), EXPORT_RATE);
  const graph = createMixerGraph(ctx, getBuffer);
  graph.sync(project);
  scheduleAll(graph, project, scope, length);

  if (onProgress) {
    onProgress(0);
    trackProgress(ctx, seconds, onProgress);
  }
  const rendered = await ctx.startRendering();
  onProgress?.(1);
  return new Blob([encodeWav(rendered)], { type: "audio/wav" });
}

function scheduleAll(graph: MixerGraph, project: Project, scope: PlaybackScope, length: number) {
  for (const event of collectEvents(project, scope, 0, length)) {
    graph.trigger(event.channelId, {
      time: ticksToSeconds(event.tick, project.bpm),
      duration: ticksToSeconds(event.length, project.bpm),
      pitch: event.pitch,
      velocity: event.velocity,
    });
  }
}

/** Report render progress by pausing the offline render at a few points (where supported). */
function trackProgress(ctx: OfflineAudioContext, seconds: number, onProgress: (n: number) => void) {
  const steps = 10;
  try {
    for (let i = 1; i < steps; i += 1) {
      const at = (seconds * i) / steps;
      ctx
        .suspend(at)
        .then(() => {
          onProgress(i / steps);
          return ctx.resume();
        })
        .catch(() => undefined);
    }
  } catch {
    // Offline suspend isn't supported here: progress jumps from 0 to 1.
  }
}

export const engine: BeatsEngine = {
  play,
  stop,
  togglePlay: () => (useUiStore.getState().playing ? stop() : play()),
  getPlayhead() {
    if (!live || !transport) return null;
    const time = live.ctx.currentTime - outputLatency(live.ctx);
    return playheadAt(transport, useProjectStore.getState().project, time);
  },
  readMeter: (mixerTrackId) => live?.graph.readPeak(mixerTrackId) ?? 0,
  audition,
  previewSample,
  renderWav,
};
