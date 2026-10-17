/**
 * The plug-in contracts between the domain, the audio engine and the sound
 * modules. Instruments and effects implement these; the engine consumes them.
 * Registries: instruments/index.ts and effects/index.ts.
 */
import type { ParamSpecs, ParamValues } from "./params";
import type { PlaybackScope } from "./schedule";

// ---------------------------------------------------------------- instruments

/** What the engine hands an instrument when it builds one for a channel. */
export interface InstrumentEnv {
  readonly ctx: BaseAudioContext;
  /** The channel strip input. Connect everything the instrument plays to this. */
  readonly output: AudioNode;
  /** Decoded sample by id, or undefined while it is still loading. */
  readonly getBuffer: (sampleId: string) => AudioBuffer | undefined;
}

/** One note to play, already converted to audio-clock seconds. */
export interface NoteTrigger {
  /** Start time in context seconds (may be slightly in the past for auditions). */
  readonly time: number;
  /** Gate length in seconds. One step is a 16th note. */
  readonly duration: number;
  /** MIDI note number. 60 (C5 in FL naming) plays a sample at its original pitch. */
  readonly pitch: number;
  /** 0..1 */
  readonly velocity: number;
}

/** The channel's current settings, passed with every trigger so instruments stay stateless. */
export interface InstrumentState<P extends ParamSpecs> {
  readonly params: ParamValues<P>;
  readonly sampleId: string | null;
}

/** A live instrument for one channel. Created and disposed by the engine. */
export interface Instrument<P extends ParamSpecs> {
  trigger(note: NoteTrigger, state: InstrumentState<P>): void;
  /** Silence every sounding or scheduled voice from `time` (stop button, panic). */
  stopAll(time: number): void;
  dispose(): void;
}

export interface InstrumentDef<P extends ParamSpecs = ParamSpecs> {
  readonly name: string;
  readonly params: P;
  /** True when the channel plays a sample: the rack shows a sample picker. */
  readonly usesSample: boolean;
  create(env: InstrumentEnv): Instrument<P>;
}

/** Typed helper for writing an instrument: infers param names for `create`. */
export function defineInstrument<const P extends ParamSpecs>(
  def: InstrumentDef<P>,
): InstrumentDef<P> {
  return def;
}

// ---------------------------------------------------------------- effects

/** A live insert effect on a mixer track. The engine wires input → … → output. */
export interface Effect<P extends ParamSpecs> {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Apply param values. Called once after create and again on every change; ramp to avoid zipper noise. */
  update(params: ParamValues<P>): void;
  dispose(): void;
}

export interface EffectDef<P extends ParamSpecs = ParamSpecs> {
  readonly name: string;
  readonly params: P;
  create(ctx: BaseAudioContext): Effect<P>;
}

/** Typed helper for writing an effect: infers param names for `create`. */
export function defineEffect<const P extends ParamSpecs>(def: EffectDef<P>): EffectDef<P> {
  return def;
}

// ---------------------------------------------------------------- factory sounds

/** A built-in sound synthesized once into an AudioBuffer (no sample files to ship or license). */
export interface FactorySound {
  /** Always starts with FACTORY_PREFIX, e.g. "factory:kick". Never rename: projects store it. */
  readonly id: string;
  readonly name: string;
  readonly group: "drums" | "bass" | "fx";
  /** Render length in seconds. */
  readonly seconds: number;
  /** Schedule the sound at time 0 into `ctx.destination` (mono or stereo). */
  render(ctx: OfflineAudioContext): void;
}

// ---------------------------------------------------------------- engine

/** Where playback is right now. */
export interface Playhead {
  /** Position inside the playing scope's loop, in ticks. */
  readonly tick: number;
  readonly scope: PlaybackScope;
}

/**
 * The audio engine as the rest of the app sees it (singleton in engine/index.ts).
 * Transport state that buttons show (`playing`, `playMode`) lives in the UI store;
 * the engine writes `playing` and reads `playMode` + the selected pattern.
 */
export interface BeatsEngine {
  /** Play the current scope from the top. Unlocks audio, so call it from a user gesture. */
  play(): void;
  stop(): void;
  togglePlay(): void;
  /** Audible playback position (accounts for output latency); null when stopped. Cheap: call every frame. */
  getPlayhead(): Playhead | null;
  /** Peak level (linear, 0..1+) of a mixer track since the last call. Call once per frame per meter. */
  readMeter(mixerTrackId: string): number;
  /** Play one note now on a channel (step paint, piano-roll keys, note placement). */
  audition(channelId: string, pitch?: number, velocity?: number): void;
  /** Play a sample from the browser, outside any channel. */
  previewSample(sampleId: string): void;
  /** Render offline through the same scheduler and mixer, encoded as 16-bit stereo WAV. */
  renderWav(scope: PlaybackScope, onProgress?: (fraction: number) => void): Promise<Blob>;
}
