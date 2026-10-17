/**
 * The audio graph for one project, usable with any BaseAudioContext (live or
 * offline). `sync` reconciles it from the project by id and skips any object whose
 * reference didn't change, so an edit only touches what it changed.
 *
 *   channel: instrument → gain (volume, mute) → pan → its mixer track
 *   track:   input → enabled effects → volume (mute) → pan → analyser → master
 *   master:  same chain → compressor → soft clipper → destination
 */
import type { Effect, Instrument, InstrumentDef, NoteTrigger } from "@/core/contracts";
import { type ParamSpecs, normalizeParams } from "@/core/params";
import type { Channel, EffectSlot, MixerTrack, Project } from "@/core/schema";
import { getEffect } from "@/effects";
import { getInstrument } from "@/instruments";

/** Time constant for param ramps: fast enough to feel instant, slow enough not to click. */
const RAMP = 0.01;

/** Output ceiling (about -0.2 dBFS). Nothing leaves the master louder than this. */
const CEILING = 0.98;
/** Below this level the clipper is perfectly linear. */
const KNEE = 0.8;

/**
 * Soft-clip curve for the end of the master chain. The compressor alone lets fast
 * transients overshoot 0 dBFS; this eases anything above KNEE into CEILING. The
 * shaper is fed at half gain, so the curve covers inputs up to +6 dB before the
 * Web Audio shaper's own hard limit.
 */
export function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(4097);
  const room = CEILING - KNEE;
  for (let i = 0; i < curve.length; i += 1) {
    const x = ((i / (curve.length - 1)) * 2 - 1) * 2;
    const level = Math.abs(x);
    const shaped = level <= KNEE ? level : KNEE + room * Math.tanh((level - KNEE) / room);
    curve[i] = Math.sign(x) * shaped;
  }
  return curve;
}

export interface MixerGraph {
  sync(project: Project): void;
  /** Play a note on a channel (no-op for unknown channels). */
  trigger(channelId: string, note: NoteTrigger): void;
  /** Silence every channel's voices from `time`. */
  stopAll(time: number): void;
  /** Current peak (linear) of a mixer track's output; 0 for unknown tracks. */
  readPeak(trackId: string): number;
  /** Master bus input, for sounds that play outside any channel (sample preview). */
  readonly masterInput: AudioNode;
}

interface SlotNode {
  data: EffectSlot;
  readonly kind: string;
  readonly effect: Effect<ParamSpecs>;
}

interface TrackNode {
  data: MixerTrack;
  readonly input: GainNode;
  readonly volume: GainNode;
  readonly pan: StereoPannerNode;
  readonly analyser: AnalyserNode;
  readonly samples: Float32Array<ArrayBuffer>;
  readonly slots: Map<string, SlotNode>;
  /** Enabled effect ids + kinds in order; a change means the chain is rewired. */
  chainKey: string | null;
  /** Connections made for the current effect chain, undone on rewire. */
  links: [AudioNode, AudioNode][];
  /** Current target of `volume` (0 when muted or silenced by another insert's solo). */
  level: number;
}

interface ChannelNode {
  data: Channel;
  def: InstrumentDef;
  instrument: Instrument<ParamSpecs>;
  params: Record<string, number>;
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  target: AudioNode | null;
  /** Current target of `gain` (0 when muted or silenced by another channel's solo). */
  level: number;
}

/** Build an empty graph on `ctx`; call `sync` to fill it from a project. */
export function createMixerGraph(
  ctx: BaseAudioContext,
  getBuffer: (sampleId: string) => AudioBuffer | undefined,
): MixerGraph {
  const tracks = new Map<string, TrackNode>();
  const channels = new Map<string, ChannelNode>();
  let lastProject: Project | null = null;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const trim = ctx.createGain();
  trim.gain.value = 0.5;
  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve();
  limiter.connect(trim).connect(clipper).connect(ctx.destination);

  const ramp = (param: AudioParam, value: number) =>
    param.setTargetAtTime(value, ctx.currentTime, RAMP);

  // ------------------------------------------------------------ tracks

  /** Gain for a track or channel: silent when muted, or when something else is soloed. */
  const levelOf = (data: Channel | MixerTrack, anySolo: boolean) =>
    data.muted || (anySolo && !data.solo) ? 0 : data.volume;

  function createTrack(data: MixerTrack, output: AudioNode, level: number): TrackNode {
    const input = ctx.createGain();
    const volume = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    volume.gain.value = level;
    pan.pan.value = data.pan;
    volume.connect(pan).connect(analyser).connect(output);
    const node: TrackNode = {
      data,
      input,
      volume,
      pan,
      analyser,
      samples: new Float32Array(analyser.fftSize),
      slots: new Map(),
      chainKey: null,
      links: [],
      level,
    };
    syncEffects(node, data.effects);
    return node;
  }

  function syncTrack(node: TrackNode, data: MixerTrack, level: number): void {
    if (node.level !== level) ramp(node.volume.gain, (node.level = level));
    const prev = node.data;
    if (prev === data) return;
    node.data = data;
    if (prev.pan !== data.pan) ramp(node.pan.pan, data.pan);
    if (prev.effects !== data.effects) syncEffects(node, data.effects);
  }

  function syncEffects(node: TrackNode, slots: readonly EffectSlot[]): void {
    const enabled = slots.filter((slot) => slot.enabled && getEffect(slot.kind));
    const chainKey = enabled.map((slot) => `${slot.id}:${slot.kind}`).join("|");
    const rewire = chainKey !== node.chainKey;
    if (rewire) {
      for (const [from, to] of node.links) from.disconnect(to);
      node.links = [];
    }

    // Drop effects whose slot is gone or changed kind (only ever unwired ones).
    for (const [id, slotNode] of node.slots) {
      const slot = slots.find((candidate) => candidate.id === id);
      if (!slot || slot.kind !== slotNode.kind) {
        slotNode.effect.dispose();
        node.slots.delete(id);
      }
    }

    // Keep disabled effects alive so bypass toggles are instant and keep their state.
    for (const slot of slots) {
      const def = getEffect(slot.kind);
      if (!def) continue;
      const existing = node.slots.get(slot.id);
      if (!existing) {
        const effect = def.create(ctx);
        effect.update(normalizeParams(def.params, slot.params));
        node.slots.set(slot.id, { data: slot, kind: slot.kind, effect });
      } else if (existing.data !== slot) {
        if (existing.data.params !== slot.params) {
          existing.effect.update(normalizeParams(def.params, slot.params));
        }
        existing.data = slot;
      }
    }

    if (!rewire) return;
    node.chainKey = chainKey;
    let from: AudioNode = node.input;
    for (const slot of enabled) {
      const effect = node.slots.get(slot.id)?.effect;
      if (!effect) continue;
      from.connect(effect.input);
      node.links.push([from, effect.input]);
      from = effect.output;
    }
    from.connect(node.volume);
    node.links.push([from, node.volume]);
  }

  function removeTrack(node: TrackNode): void {
    for (const [from, to] of node.links) from.disconnect(to);
    for (const slot of node.slots.values()) slot.effect.dispose();
    node.analyser.disconnect();
  }

  // ------------------------------------------------------------ channels

  function createChannel(data: Channel, level: number): ChannelNode {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.gain.value = level;
    pan.pan.value = data.pan;
    gain.connect(pan);
    const def = getInstrument(data.instrument);
    return {
      data,
      def,
      instrument: def.create({ ctx, output: gain, getBuffer }),
      params: normalizeParams(def.params, data.params),
      gain,
      pan,
      target: null,
      level,
    };
  }

  function syncChannel(node: ChannelNode, data: Channel, level: number): void {
    if (node.level !== level) ramp(node.gain.gain, (node.level = level));
    const prev = node.data;
    if (prev === data) return;
    node.data = data;
    const def = getInstrument(data.instrument);
    if (def !== node.def) {
      node.instrument.stopAll(ctx.currentTime);
      node.instrument.dispose();
      node.def = def;
      node.instrument = def.create({ ctx, output: node.gain, getBuffer });
      node.params = normalizeParams(def.params, data.params);
    } else if (prev.params !== data.params) {
      node.params = normalizeParams(def.params, data.params);
    }
    if (prev.pan !== data.pan) ramp(node.pan.pan, data.pan);
  }

  function removeChannel(node: ChannelNode): void {
    node.instrument.stopAll(ctx.currentTime);
    node.instrument.dispose();
    node.pan.disconnect();
  }

  // ------------------------------------------------------------ sync

  const master = createTrack(
    { id: "master", name: "Master", volume: 1, pan: 0, muted: false, solo: false, effects: [] },
    limiter,
    1,
  );

  function sync(project: Project): void {
    if (project === lastProject) return;
    lastProject = project;
    const { mixer } = project;

    syncTrack(master, mixer.master, levelOf(mixer.master, false));
    const insertSolo = mixer.inserts.some((track) => track.solo);
    const insertIds = new Set<string>();
    for (const insert of mixer.inserts) {
      insertIds.add(insert.id);
      const node = tracks.get(insert.id);
      const level = levelOf(insert, insertSolo);
      if (node) syncTrack(node, insert, level);
      else tracks.set(insert.id, createTrack(insert, master.input, level));
    }
    for (const [id, node] of tracks) {
      if (insertIds.has(id)) continue;
      removeTrack(node);
      tracks.delete(id);
    }

    const channelSolo = project.channels.some((channel) => channel.solo);
    const channelIds = new Set<string>();
    for (const channel of project.channels) {
      channelIds.add(channel.id);
      let node = channels.get(channel.id);
      const level = levelOf(channel, channelSolo);
      if (node) syncChannel(node, channel, level);
      else channels.set(channel.id, (node = createChannel(channel, level)));
      // Unknown or deleted tracks fall back to master.
      const target = (tracks.get(channel.mixerTrackId) ?? master).input;
      if (node.target !== target) {
        if (node.target) node.pan.disconnect(node.target);
        node.pan.connect(target);
        node.target = target;
      }
    }
    for (const [id, node] of channels) {
      if (channelIds.has(id)) continue;
      removeChannel(node);
      channels.delete(id);
    }
  }

  return {
    sync,
    trigger(channelId, note) {
      const node = channels.get(channelId);
      node?.instrument.trigger(note, { params: node.params, sampleId: node.data.sampleId });
    },
    stopAll(time) {
      for (const node of channels.values()) node.instrument.stopAll(time);
    },
    readPeak(trackId) {
      const node = trackId === master.data.id ? master : tracks.get(trackId);
      if (!node) return 0;
      node.analyser.getFloatTimeDomainData(node.samples);
      let peak = 0;
      for (const sample of node.samples) peak = Math.max(peak, Math.abs(sample));
      return peak;
    },
    masterInput: master.input,
  };
}
