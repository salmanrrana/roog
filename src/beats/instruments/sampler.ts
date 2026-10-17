import { defineInstrument } from "@/core/contracts";

interface Voice {
  readonly source: AudioBufferSourceNode;
  readonly amp: GainNode;
}

/** Fade time constant for chokes and stops: fast, but long enough not to click. */
const FADE = 0.004;

/**
 * Plays the channel's sample. Pitch 60 is the original speed; other pitches
 * resample (so an 808 on the piano roll just works). One-shot plays the whole
 * sample; Gate stops at the note end plus release. Mono chokes the previous hit
 * (open hat cut by the next hit, 808 slides that don't smear).
 */
export const sampler = defineInstrument({
  name: "Sampler",
  usesSample: true,
  params: {
    tune: { label: "Tune", min: -24, max: 24, default: 0, step: 1, unit: "st" },
    fine: { label: "Fine", min: -100, max: 100, default: 0, step: 1, unit: "ct" },
    attack: { label: "Attack", min: 0.001, max: 2, default: 0.001, curve: "exp", unit: "s" },
    release: { label: "Release", min: 0.005, max: 4, default: 0.08, curve: "exp", unit: "s" },
    mode: { label: "Mode", min: 0, max: 1, default: 0, options: ["One-shot", "Gate"] },
    voices: { label: "Voices", min: 0, max: 1, default: 0, options: ["Poly", "Mono"] },
  },
  create({ ctx, output, getBuffer }) {
    const playing = new Set<Voice>();

    function silence(voice: Voice, time: number) {
      const at = Math.max(time, ctx.currentTime);
      voice.amp.gain.cancelScheduledValues(at);
      voice.amp.gain.setTargetAtTime(0, at, FADE);
      voice.source.stop(at + FADE * 10);
    }

    return {
      trigger(note, { params, sampleId }) {
        const buffer = sampleId ? getBuffer(sampleId) : undefined;
        if (!buffer) return;
        if (params.voices === 1) for (const voice of playing) silence(voice, note.time);

        const source = ctx.createBufferSource();
        const amp = ctx.createGain();
        const voice = { source, amp };
        // Squared velocity feels natural: 0.5 is about -12 dB, like most drum machines.
        const peak = note.velocity * note.velocity;
        source.buffer = buffer;
        source.playbackRate.value = 2 ** ((note.pitch - 60 + params.tune + params.fine / 100) / 12);
        amp.gain.setValueAtTime(0, note.time);
        amp.gain.linearRampToValueAtTime(peak, note.time + params.attack);
        if (params.mode === 1) {
          // Release starts at the note end, or once the attack finishes for very short notes.
          const end = note.time + Math.max(note.duration, params.attack);
          amp.gain.setTargetAtTime(0, end, params.release / 5);
          source.stop(end + params.release * 1.5);
        }
        source.connect(amp).connect(output);
        source.onended = () => {
          amp.disconnect();
          playing.delete(voice);
        };
        source.start(note.time);
        playing.add(voice);
      },
      stopAll(time) {
        for (const voice of playing) silence(voice, time);
      },
      dispose() {
        for (const voice of playing) silence(voice, ctx.currentTime);
        playing.clear();
      },
    };
  },
});
