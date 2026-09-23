// Small Web Audio building blocks shared by module definitions.

/** A running ConstantSourceNode: the studio's way to output a voltage. */
export function voltage(audio, value = 0) {
  const source = audio.createConstantSource();

  source.offset.value = value;
  source.start();
  return source;
}

/** A gain node used as a patch point that scales whatever is plugged into it. */
export function scaler(audio, gain, target) {
  const node = audio.createGain();

  node.gain.value = gain;

  if (target) {
    node.connect(target);
  }

  return node;
}

/** Build a WaveShaper curve from a function over -1..1. */
export function curve(shape, samples = 4096) {
  const table = new Float32Array(samples);

  for (let index = 0; index < samples; index += 1) {
    table[index] = shape((index * 2) / (samples - 1) - 1);
  }

  return table;
}

export function shaper(audio, shape, samples) {
  const node = audio.createWaveShaper();

  node.curve = curve(shape, samples);
  node.oversample = "2x";
  return node;
}

const noiseBuffers = new WeakMap();

/** Two seconds of shared white noise per AudioContext. */
export function noiseBuffer(audio) {
  if (!noiseBuffers.has(audio)) {
    const buffer = audio.createBuffer(
      1,
      audio.sampleRate * 2,
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    noiseBuffers.set(audio, buffer);
  }

  return noiseBuffers.get(audio);
}

/** Fire-and-forget noise source that stops itself. */
export function noiseBurst(audio, time, duration) {
  const source = audio.createBufferSource();

  source.buffer = noiseBuffer(audio);
  source.start(time, Math.random() * 1.5);
  source.stop(time + duration);
  return source;
}

/** Percussive decay: jump to `peak` at `time`, fall exponentially over `decay` seconds. */
export function strike(param, time, peak, decay, floor = 0) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(peak, time);
  param.setTargetAtTime(floor, time + 0.001, Math.max(0.002, decay / 4));
}

/** Smooth a knob change so it doesn't zipper or click. */
export function glide(param, value, audio, seconds = 0.02) {
  param.setTargetAtTime(Number(value), audio.currentTime, seconds);
}

/** Disconnect every node passed in, ignoring ones that are already gone. */
export function disconnectAll(...nodes) {
  nodes.forEach((node) => {
    try {
      node.stop?.();
    } catch {
      // not started or already stopped
    }

    node.disconnect();
  });
}

export const waveShapes = ["sine", "triangle", "sawtooth", "square"];
