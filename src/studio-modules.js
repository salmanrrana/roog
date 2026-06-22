import { portDirections, signalTypes } from "./module-framework.js";

export const studioRackConfig = {
  totalHp: 124,
  railHeight: "3U",
  powerRails: ["+12V", "GND", "-12V"]
};

const SEMITONE_BASE = 220;

function semitonesToHz(semitone) {
  return SEMITONE_BASE * 2 ** (Number(semitone) / 12);
}

/* ---------- 8-step sequencer: the self-playing heart of the studio ---------- */

const DEFAULT_STEPS = [0, 3, 7, 10, 12, 7, 3, 0];

function createSequencerNodes(audioContext) {
  const cv = audioContext.createConstantSource();
  const env = audioContext.createConstantSource();

  cv.offset.value = 0;
  env.offset.value = 0;
  cv.start();
  env.start();

  const state = {
    steps: DEFAULT_STEPS.map(semitonesToHz),
    tempo: 120,
    gate: 0.55,
    index: 0,
    running: false,
    timer: null
  };

  function scheduleStep() {
    const now = audioContext.currentTime;
    const stepDuration = 60 / state.tempo / 2;
    const frequency = state.steps[state.index];

    cv.offset.cancelScheduledValues(now);
    cv.offset.setValueAtTime(frequency, now);

    env.offset.cancelScheduledValues(now);
    env.offset.setValueAtTime(0, now);
    env.offset.linearRampToValueAtTime(1, now + 0.008);
    env.offset.linearRampToValueAtTime(0, now + Math.max(0.03, stepDuration * state.gate));

    state.index = (state.index + 1) % state.steps.length;

    if (state.running) {
      state.timer = setTimeout(scheduleStep, stepDuration * 1000);
    }
  }

  return {
    cv,
    env,
    output: cv,
    setStep(index, semitone) {
      state.steps[index] = semitonesToHz(semitone);
    },
    setTempo(bpm) {
      state.tempo = Number(bpm);
    },
    run() {
      if (state.running) {
        return;
      }

      state.running = true;
      state.index = 0;
      scheduleStep();
    },
    stop() {
      state.running = false;

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      const now = audioContext.currentTime;
      env.offset.cancelScheduledValues(now);
      env.offset.setValueAtTime(0, now);
    },
    isRunning() {
      return state.running;
    }
  };
}

function createStudioVcoNodes(audioContext) {
  const oscillator = audioContext.createOscillator();
  const output = audioContext.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.value = 0;
  oscillator.detune.value = 0;
  output.gain.value = 0.5;
  oscillator.connect(output);
  oscillator.start();

  return {
    oscillator,
    pitch: oscillator.frequency,
    detune: oscillator.detune,
    output
  };
}

function createStudioVcfNodes(audioContext) {
  const filter = audioContext.createBiquadFilter();
  const output = audioContext.createGain();

  filter.type = "lowpass";
  filter.frequency.value = 1200;
  filter.Q.value = 1;
  output.gain.value = 1;
  filter.connect(output);

  return {
    input: filter,
    cutoff: filter.frequency,
    resonance: filter.Q,
    output
  };
}

function createStudioVcaNodes(audioContext) {
  const amplifier = audioContext.createGain();

  amplifier.gain.value = 0;

  return {
    input: amplifier,
    amplitude: amplifier.gain,
    output: amplifier
  };
}

function createStudioLfoNodes(audioContext) {
  const oscillator = audioContext.createOscillator();
  const depth = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 0.2;
  depth.gain.value = 300;
  oscillator.connect(depth);
  oscillator.start();

  return {
    oscillator,
    rate: oscillator.frequency,
    depth: depth.gain,
    output: depth
  };
}

function makeImpulseResponse(audioContext, seconds, decay) {
  const sampleRate = audioContext.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);

    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }

  return impulse;
}

function createReverbNodes(audioContext) {
  const input = audioContext.createGain();
  const dry = audioContext.createGain();
  const wet = audioContext.createGain();
  const convolver = audioContext.createConvolver();
  const output = audioContext.createGain();

  dry.gain.value = 0.7;
  wet.gain.value = 0.4;
  output.gain.value = 1;
  convolver.buffer = makeImpulseResponse(audioContext, 2.4, 2.2);
  input.connect(dry);
  dry.connect(output);
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  return {
    input,
    convolver,
    output,
    setSize(seconds) {
      convolver.buffer = makeImpulseResponse(audioContext, Math.max(0.2, Number(seconds)), 2.2);
    },
    setMix(mix) {
      const amount = Number(mix);
      wet.gain.value = amount;
      dry.gain.value = 1 - amount * 0.6;
    }
  };
}

function createScopeNodes(audioContext) {
  const input = audioContext.createGain();
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 2048;
  input.gain.value = 1;
  input.connect(analyser);

  return {
    input,
    analyser,
    output: input
  };
}

function createStudioMixNodes(audioContext) {
  const a = audioContext.createGain();
  const b = audioContext.createGain();
  const output = audioContext.createGain();

  a.gain.value = 0.8;
  b.gain.value = 0.8;
  output.gain.value = 0.9;
  a.connect(output);
  b.connect(output);

  return {
    a,
    b,
    levelA: a.gain,
    levelB: b.gain,
    output
  };
}

function createStudioOutputNodes(audioContext) {
  const left = audioContext.createGain();
  const right = audioContext.createGain();

  left.gain.value = 0.8;
  right.gain.value = 0.8;

  if (audioContext.destination) {
    left.connect(audioContext.destination);
    right.connect(audioContext.destination);
  }

  return { left, right };
}

/* ---------- self-running drum machine (kick · snare · hat) ---------- */

// 16-step patterns, inspired by a four-on-the-floor groove
const KICK_PATTERN = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const SNARE_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT_PATTERN = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1];

function createDrumNodes(audioContext) {
  const output = audioContext.createGain();
  output.gain.value = 0.9;

  const noiseLength = Math.floor(audioContext.sampleRate * 0.4);
  const noiseBuffer = audioContext.createBuffer(1, noiseLength, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < noiseLength; i += 1) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  function kick(time) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.13);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);
    osc.connect(gain);
    gain.connect(output);
    osc.start(time);
    osc.stop(time + 0.36);
  }

  function noiseHit(time, highpass, duration, level) {
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    source.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  const state = { tempo: 120, running: false, step: 0, timer: null };

  function tick() {
    const time = audioContext.currentTime + 0.02;

    if (KICK_PATTERN[state.step]) {
      kick(time);
    }

    if (SNARE_PATTERN[state.step]) {
      noiseHit(time, 1800, 0.18, 0.5);
    }

    if (HAT_PATTERN[state.step]) {
      noiseHit(time, 8000, 0.05, 0.35);
    }

    state.step = (state.step + 1) % 16;

    if (state.running) {
      state.timer = setTimeout(tick, (60 / state.tempo / 4) * 1000);
    }
  }

  return {
    output,
    setTempo(bpm) {
      state.tempo = Number(bpm);
    },
    setLevel(level) {
      output.gain.value = Number(level);
    },
    run() {
      if (state.running) {
        return;
      }

      state.running = true;
      state.step = 0;
      tick();
    },
    stop() {
      state.running = false;

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    },
    isRunning() {
      return state.running;
    }
  };
}

/* ---------- clocked random voltages (sample & hold) ---------- */

function createRandomNodes(audioContext) {
  const cv = audioContext.createConstantSource();

  cv.offset.value = 600;
  cv.start();

  const state = { tempo: 120, base: 400, range: 1600, running: false, timer: null };

  function tick() {
    const value = state.base + Math.random() * state.range;
    cv.offset.setValueAtTime(value, audioContext.currentTime);

    if (state.running) {
      state.timer = setTimeout(tick, (60 / state.tempo / 2) * 1000);
    }
  }

  return {
    cv,
    output: cv,
    setTempo(bpm) {
      state.tempo = Number(bpm);
    },
    setRange(range) {
      state.range = Number(range);
    },
    run() {
      if (state.running) {
        return;
      }

      state.running = true;
      tick();
    },
    stop() {
      state.running = false;

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    },
    isRunning() {
      return state.running;
    }
  };
}

/* ---------- module bindings ---------- */

function syncRunButton(nodes, isRunning) {
  if (!nodes?.button) {
    return;
  }

  nodes.button.textContent = isRunning ? "stop" : "run";
  nodes.button.dataset.state = isRunning ? "live" : "";
}

function bindSequencer(api) {
  const button = api.getControl("run");
  const nodes = api.nodes();

  if (!button || !nodes) {
    return;
  }

  // Stash the button so the POWER hook can keep its label in sync.
  nodes.button = button;

  button.addEventListener("click", async () => {
    if (nodes.isRunning()) {
      nodes.stop();
      syncRunButton(nodes, false);
      api.status("Sequencer stopped");
      return;
    }

    await api.context()?.resume?.();
    nodes.run();
    syncRunButton(nodes, true);
    api.status("Sequencer running · watch the scope");
  });
}

// Self-running voices start with the rack and stop when it powers down.
function runWithPower(nodes, isOn) {
  if (isOn) {
    nodes.run();
  } else {
    nodes.stop();
  }
}

function powerSequencer(nodes, isOn) {
  runWithPower(nodes, isOn);
  syncRunButton(nodes, isOn);
}

function drawScopeFrame(canvas, context2d, analyser, buffer) {
  const { width, height } = canvas;

  context2d.clearRect(0, 0, width, height);
  context2d.fillStyle = "#06120a";
  context2d.fillRect(0, 0, width, height);

  // phosphor grid
  context2d.strokeStyle = "rgba(80, 240, 140, 0.14)";
  context2d.lineWidth = 1;
  context2d.beginPath();

  for (let x = 0; x <= width; x += width / 8) {
    context2d.moveTo(x, 0);
    context2d.lineTo(x, height);
  }

  for (let y = 0; y <= height; y += height / 4) {
    context2d.moveTo(0, y);
    context2d.lineTo(width, y);
  }

  context2d.stroke();

  if (!analyser) {
    return;
  }

  analyser.getByteTimeDomainData(buffer);

  context2d.lineWidth = 2.5;
  context2d.strokeStyle = "#46f08c";
  context2d.shadowColor = "rgba(70, 240, 140, 0.9)";
  context2d.shadowBlur = 8;
  context2d.beginPath();

  const slice = width / buffer.length;

  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] / 128 - 1;
    const y = height / 2 + (value * height) / 2.2;
    const x = i * slice;

    if (i === 0) {
      context2d.moveTo(x, y);
    } else {
      context2d.lineTo(x, y);
    }
  }

  context2d.stroke();
  context2d.shadowBlur = 0;
}

function bindScope(api) {
  const canvas = api.getCanvas("scope");

  if (!canvas) {
    return;
  }

  const context2d = canvas.getContext("2d");
  const buffer = new Uint8Array(2048);

  const render = () => {
    drawScopeFrame(canvas, context2d, api.nodes()?.analyser, buffer);
    requestAnimationFrame(render);
  };

  render();
}

/* ---------- module definitions ---------- */

function buildSequencerSteps() {
  return DEFAULT_STEPS.map((semitone, index) => ({
    id: `step${index + 1}`,
    label: String(index + 1),
    type: "slider",
    min: -24,
    max: 24,
    step: 1,
    value: semitone,
    apply: (nodes, value) => nodes.setStep(index, value)
  }));
}

export const studioModules = [
  {
    id: "seq",
    name: "SEQ-8",
    kind: "sequencer",
    tag: "SEQ",
    hp: 22,
    controls: [
      ...buildSequencerSteps(),
      {
        id: "tempo",
        label: "tempo",
        type: "range",
        min: 50,
        max: 220,
        step: 1,
        value: 120,
        apply: (nodes, value) => nodes.setTempo(value)
      },
      { id: "run", label: "play", type: "button", value: "run" }
    ],
    ports: [
      { label: "pitch", type: signalTypes.cv, direction: portDirections.output, node: "cv" },
      { label: "env", type: signalTypes.cv, direction: portDirections.output, node: "env" }
    ],
    createAudioNodes: createSequencerNodes,
    bind: bindSequencer,
    onPower: powerSequencer
  },
  {
    id: "vco",
    name: "VCO",
    kind: "oscillator",
    tag: "OSC",
    hp: 12,
    controls: [
      {
        id: "coarse",
        label: "tune",
        type: "range",
        min: -1200,
        max: 1200,
        step: 1,
        value: 0,
        param: "detune"
      },
      {
        id: "shape",
        label: "wave",
        type: "select",
        options: ["sine", "square", "sawtooth", "triangle"],
        value: "sawtooth",
        apply: (nodes, value) => {
          nodes.oscillator.type = value;
        }
      }
    ],
    ports: [
      { label: "pitch", type: signalTypes.cv, direction: portDirections.input, node: "pitch" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createStudioVcoNodes
  },
  {
    id: "vcf",
    name: "VCF",
    kind: "filter",
    tag: "FLT",
    hp: 10,
    controls: [
      { id: "cutoff", label: "cutoff", type: "range", min: 80, max: 8000, step: 1, value: 1200, param: "cutoff" },
      { id: "res", label: "res", type: "range", min: 0.1, max: 24, step: 0.1, value: 1, param: "resonance" }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "cutoff", type: signalTypes.cv, direction: portDirections.input, node: "cutoff" }
    ],
    createAudioNodes: createStudioVcfNodes
  },
  {
    id: "vca",
    name: "VCA",
    kind: "amp",
    tag: "AMP",
    hp: 8,
    controls: [
      { id: "level", label: "gain", type: "range", min: 0, max: 1, step: 0.01, value: 0, param: "amplitude" }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "amp", type: signalTypes.cv, direction: portDirections.input, node: "amplitude" }
    ],
    createAudioNodes: createStudioVcaNodes
  },
  {
    id: "lfo",
    name: "LFO",
    kind: "modulator",
    tag: "MOD",
    hp: 8,
    controls: [
      { id: "rate", label: "rate", type: "range", min: 0.02, max: 20, step: 0.02, value: 0.2, param: "rate" },
      {
        id: "shape",
        label: "wave",
        type: "select",
        options: ["sine", "square", "sawtooth", "triangle"],
        value: "sine",
        apply: (nodes, value) => {
          nodes.oscillator.type = value;
        }
      },
      { id: "depth", label: "depth", type: "range", min: 0, max: 4000, step: 1, value: 300, param: "depth" }
    ],
    ports: [{ label: "cv", type: signalTypes.cv, direction: portDirections.output, node: "output" }],
    createAudioNodes: createStudioLfoNodes
  },
  {
    id: "random",
    name: "RANDOM",
    kind: "random",
    tag: "RND",
    hp: 8,
    controls: [
      {
        id: "rtempo",
        label: "rate",
        type: "range",
        min: 30,
        max: 320,
        step: 1,
        value: 120,
        apply: (nodes, value) => nodes.setTempo(value)
      },
      {
        id: "range",
        label: "spread",
        type: "range",
        min: 0,
        max: 4000,
        step: 1,
        value: 1600,
        apply: (nodes, value) => nodes.setRange(value)
      }
    ],
    ports: [{ label: "cv", type: signalTypes.cv, direction: portDirections.output, node: "output" }],
    createAudioNodes: createRandomNodes,
    onPower: runWithPower
  },
  {
    id: "reverb",
    name: "SPACE",
    kind: "fx",
    tag: "FX",
    hp: 12,
    controls: [
      {
        id: "size",
        label: "size",
        type: "range",
        min: 0.3,
        max: 5,
        step: 0.1,
        value: 2.4,
        apply: (nodes, value) => nodes.setSize(value)
      },
      {
        id: "mix",
        label: "mix",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.4,
        apply: (nodes, value) => nodes.setMix(value)
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createReverbNodes
  },
  {
    id: "scope",
    name: "SCOPE",
    kind: "scope",
    tag: "VIEW",
    hp: 18,
    controls: [{ id: "scope", label: "signal", type: "scope", width: 240, height: 130 }],
    ports: [{ label: "in", type: signalTypes.audio, direction: portDirections.input, node: "input" }],
    createAudioNodes: createScopeNodes,
    bind: bindScope
  },
  {
    id: "drums",
    name: "DRUMS",
    kind: "drums",
    tag: "DRM",
    hp: 10,
    controls: [
      {
        id: "dtempo",
        label: "tempo",
        type: "range",
        min: 60,
        max: 220,
        step: 1,
        value: 120,
        apply: (nodes, value) => nodes.setTempo(value)
      },
      {
        id: "dlevel",
        label: "level",
        type: "range",
        min: 0,
        max: 1.2,
        step: 0.01,
        value: 0.9,
        apply: (nodes, value) => nodes.setLevel(value)
      }
    ],
    ports: [{ label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" }],
    createAudioNodes: createDrumNodes,
    onPower: runWithPower
  },
  {
    id: "mix",
    name: "MIX",
    kind: "mixer",
    tag: "MIX",
    hp: 8,
    controls: [
      { id: "levelA", label: "ch a", type: "range", min: 0, max: 1.2, step: 0.01, value: 0.9, param: "levelA" },
      { id: "levelB", label: "ch b", type: "range", min: 0, max: 1.2, step: 0.01, value: 0, param: "levelB" }
    ],
    ports: [
      { label: "a", type: signalTypes.audio, direction: portDirections.input, node: "a" },
      { label: "b", type: signalTypes.audio, direction: portDirections.input, node: "b" },
      { label: "sum", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createStudioMixNodes
  },
  {
    id: "out",
    name: "OUT",
    kind: "output",
    tag: "OUT",
    hp: 8,
    controls: [
      {
        id: "level",
        label: "master",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.8,
        apply: (nodes, value) => {
          nodes.left.gain.value = Number(value);
          nodes.right.gain.value = Number(value);
        }
      }
    ],
    ports: [
      { label: "left", type: signalTypes.audio, direction: portDirections.input, node: "left" },
      { label: "right", type: signalTypes.audio, direction: portDirections.input, node: "right" }
    ],
    createAudioNodes: createStudioOutputNodes
  }
];

/* ---------- presets ---------- */

const GENERATIVE_CHAIN = [
  ["seq", "pitch", "output", "vco", "pitch", "input"],
  ["vco", "audio", "output", "vcf", "audio", "input"],
  ["vcf", "audio", "output", "vca", "audio", "input"],
  ["seq", "env", "output", "vca", "amp", "input"],
  ["vca", "audio", "output", "reverb", "audio", "input"],
  ["reverb", "audio", "output", "mix", "a", "input"],
  ["drums", "audio", "output", "mix", "b", "input"],
  ["random", "cv", "output", "vcf", "cutoff", "input"],
  ["mix", "sum", "output", "out", "left", "input"],
  ["mix", "sum", "output", "out", "right", "input"],
  ["mix", "sum", "output", "scope", "in", "input"],
  ["lfo", "cv", "output", "vcf", "cutoff", "input"]
];

export const studioPresets = [
  {
    id: "generative",
    name: "Generative",
    blurb: "Self-playing melody sweeping through a hall — press RUN",
    connections: GENERATIVE_CHAIN,
    controls: {
      seq: { tempo: 120, step1: 0, step2: 3, step3: 7, step4: 10, step5: 12, step6: 7, step7: 3, step8: 0 },
      vco: { coarse: 0, shape: "sawtooth" },
      vcf: { cutoff: 700, res: 6 },
      vca: { level: 0 },
      lfo: { rate: 0.12, shape: "sine", depth: 500 },
      random: { rtempo: 120, range: 1400 },
      drums: { dtempo: 120, dlevel: 0.85 },
      reverb: { size: 2.6, mix: 0.4 },
      mix: { levelA: 0.9, levelB: 0.7 },
      out: { level: 0.8 }
    }
  },
  {
    id: "acid",
    name: "Acid Line",
    blurb: "Squelchy resonant 303-style run — press RUN",
    connections: GENERATIVE_CHAIN,
    controls: {
      seq: { tempo: 168, step1: 0, step2: 0, step3: 12, step4: 0, step5: 3, step6: 0, step7: 10, step8: 7 },
      vco: { coarse: 0, shape: "sawtooth" },
      vcf: { cutoff: 420, res: 20 },
      vca: { level: 0 },
      lfo: { rate: 0.9, shape: "triangle", depth: 1200 },
      random: { rtempo: 168, range: 2200 },
      drums: { dtempo: 168, dlevel: 0.9 },
      reverb: { size: 0.8, mix: 0.2 },
      mix: { levelA: 0.9, levelB: 0.75 },
      out: { level: 0.8 }
    }
  },
  {
    id: "drone",
    name: "Deep Drone",
    blurb: "Slow detuned swells in a cathedral — press RUN",
    connections: GENERATIVE_CHAIN,
    controls: {
      seq: { tempo: 60, step1: -12, step2: -12, step3: -5, step4: -5, step5: 0, step6: 0, step7: -7, step8: -7 },
      vco: { coarse: -12, shape: "triangle" },
      vcf: { cutoff: 600, res: 3 },
      vca: { level: 0 },
      lfo: { rate: 0.05, shape: "sine", depth: 500 },
      random: { rtempo: 45, range: 900 },
      drums: { dtempo: 60, dlevel: 0 },
      reverb: { size: 5, mix: 0.6 },
      mix: { levelA: 0.9, levelB: 0 },
      out: { level: 0.8 }
    }
  }
];
