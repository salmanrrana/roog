// Per-sample DSP that stock Web Audio nodes can't do. Loaded once on power-up
// via audioWorklet.addModule; modules opt in with `worklet: WORKLET_URL`.

const C4_HZ = 261.6256;
const MAX_DELAY = 8192;

// Karplus-Strong string with a damped loop filter. Plucks arrive as timed
// messages; anything patched into the input also excites the string, so
// drums or noise turn it into a pitched resonator.
//
// High notes pass through the loop many more times per second than low ones,
// so both the feedback and the damping are scaled by the period: every note
// rings for roughly the same DECAY time instead of high notes dying instantly.
class StringProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "pitch", defaultValue: 0, automationRate: "a-rate" },
      { name: "tune", defaultValue: 0, automationRate: "k-rate" },
      {
        name: "bright",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "decay",
        defaultValue: 0.7,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "body",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.buffer = new Float32Array(MAX_DELAY);
    this.write = 0;
    this.loop = 0;
    this.excite = 0;
    this.burst = 0;
    this.burstLevel = 0;
    this.plucks = [];
    this.dcIn = 0;
    this.dcOut = 0;
    this.apIn = 0;
    this.apOut = 0;
    this.port.onmessage = (event) => this.plucks.push(event.data);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0][0];
    const input = inputs[0]?.[0];
    const pitch = parameters.pitch;
    const tune = parameters.tune[0];
    const damping = 0.92 - parameters.bright[0] * 0.9;
    const ringSeconds = 0.3 * 40 ** parameters.decay[0];
    const body = 0.05 + parameters.body[0] * 0.9;

    this.plucks.sort((a, b) => a.time - b.time);

    for (let index = 0; index < output.length; index += 1) {
      const now = currentTime + index / sampleRate;

      while (this.plucks.length > 0 && this.plucks[0].time <= now) {
        const pluck = this.plucks.shift();

        this.burst = Math.round(
          sampleRate /
            (C4_HZ *
              2 ** ((pitch.length > 1 ? pitch[index] : pitch[0]) + tune)),
        );
        this.burstLevel = pluck.velocity;
      }

      const volts = (pitch.length > 1 ? pitch[index] : pitch[0]) + tune;
      const period = Math.min(
        MAX_DELAY - 4,
        Math.max(4, sampleRate / (C4_HZ * 2 ** volts)),
      );

      // Loop gain for a -60 dB decay over ringSeconds, and damping eased off for short periods.
      const feedback = 10 ** ((-3 * period) / (ringSeconds * sampleRate));
      const bright = 1 - damping * Math.min(1, period / 400);

      // The damping filter delays the loop by about (1 - bright) / bright samples; take that
      // off the delay line so the string stays in tune. The fractional rest goes through a
      // first-order allpass, which (unlike linear interpolation) loses no energy per pass.
      const delay = period - (1 - bright) / bright;
      const whole = Math.floor(delay - 0.5);
      const frac = delay - whole;
      const coefficient = (1 - frac) / (1 + frac);
      const tap = this.buffer[(this.write - whole + MAX_DELAY) % MAX_DELAY];
      const delayed = coefficient * tap + this.apIn - coefficient * this.apOut;

      this.apIn = tap;
      this.apOut = delayed;
      this.loop += bright * (delayed - this.loop);

      let excitation = input ? input[index] * 0.5 : 0;

      if (this.burst > 0) {
        this.excite += body * (Math.random() * 2 - 1 - this.excite);
        excitation += this.excite * this.burstLevel;
        this.burst -= 1;
      }

      const sample = excitation + this.loop * feedback;

      this.buffer[this.write] = Math.max(-1.5, Math.min(1.5, sample));
      this.write = (this.write + 1) % MAX_DELAY;

      // DC blocker: noise bursts leave an offset that would eat headroom downstream.
      this.dcOut = sample - this.dcIn + 0.995 * this.dcOut;
      this.dcIn = sample;
      output[index] = this.dcOut;
    }

    return true;
  }
}

// Bit depth + sample-rate reduction. `rate` is how many samples each held
// value lasts; `bits` is the amplitude resolution.
class CrushProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "bits",
        defaultValue: 16,
        minValue: 1,
        maxValue: 16,
        automationRate: "k-rate",
      },
      {
        name: "rate",
        defaultValue: 1,
        minValue: 1,
        maxValue: 64,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.held = 0;
    this.counter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0][0];
    const levels = 2 ** (parameters.bits[0] - 1);
    const hold = Math.max(1, Math.round(parameters.rate[0]));

    for (let index = 0; index < output.length; index += 1) {
      if (this.counter <= 0) {
        this.held = Math.round((input ? input[index] : 0) * levels) / levels;
        this.counter = hold;
      }

      this.counter -= 1;
      output[index] = this.held;
    }

    return true;
  }
}

registerProcessor("roog-string", StringProcessor);
registerProcessor("roog-crush", CrushProcessor);
