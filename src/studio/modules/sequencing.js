import {
  euclid,
  midiToVolts,
  noteNames,
  quantizeSemitone,
  registerValue,
  scaleDegree,
  scaleNames,
  turingStep,
} from "../music.js";
import { disconnectAll, scaler, voltage } from "./shared.js";

// Clock divisions offered by sequencers, counted in master 16th-note ticks.
const RATES = { "1/16": 1, "1/8": 2, "1/4": 4, "1/2": 8 };
const rateControl = {
  id: "rate",
  label: "rate",
  value: "1/16",
  options: Object.keys(RATES),
};
const scaleControl = (value) => ({
  id: "scale",
  label: "scale",
  value,
  options: scaleNames,
});
const rootControl = {
  id: "root",
  label: "root",
  value: "C",
  options: noteNames,
};

function el(tag, className, text) {
  const node = document.createElement(tag);

  node.className = className;

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

/** Fire a gate: rising edge at `time`, falling edge `length` seconds later. */
function pulse(emit, port, time, length, velocity = 1) {
  emit(port, time, velocity);
  emit(port, time + length, 0);
}

/** Count incoming clocks and only let every `div`-th one through. */
function divider(values) {
  let count = 0;

  return {
    reset() {
      count = 0;
    },
    passes() {
      const div = RATES[values.rate] ?? 1;
      const passes = count % div === 0;

      count += 1;
      return passes;
    },
    div: () => RATES[values.rate] ?? 1,
  };
}

function ledRow(host, count, className = "led") {
  const row = el("div", "led-row");
  const leds = Array.from({ length: count }, () => el("span", className));

  row.append(...leds);
  host.append(row);
  return leds;
}

/* ---------- CLOCK ---------- */

const CLOCK_OUTS = [
  { id: "x1", label: "1/16", every: 1 },
  { id: "x2", label: "1/8", every: 2 },
  { id: "x4", label: "1/4", every: 4 },
  { id: "x16", label: "bar", every: 16 },
];

/** @type {import("../types.js").ModuleDef} */
export const clock = {
  type: "clock",
  name: "CLOCK",
  category: "sequencer",
  hp: 6,
  blurb: "Master clock as gates: 16ths, 8ths, quarters and bars",
  ports: [
    { id: "reset", label: "reset", type: "gate", dir: "in" },
    ...CLOCK_OUTS.map(({ id, label }) => ({
      id,
      label,
      type: "gate",
      dir: "out",
    })),
  ],
  controls: [],
  create({ emit, onClock, signal }) {
    let count = 0;

    onClock((time, step) => {
      CLOCK_OUTS.forEach(({ id, every }, index) => {
        if (count % every === 0) {
          pulse(emit, id, time, Math.min(0.05, step * 0.5));
          signal("pulse", index, time);
        }
      });
      count += 1;
    });

    return {
      reset() {
        count = 0;
      },
    };
  },
  view(host, view) {
    const leds = ledRow(host, CLOCK_OUTS.length);

    view.on("pulse", (index) => flash(leds[index]));
  },
};

function flash(led) {
  led.classList.remove("led-on");
  void led.offsetWidth;
  led.classList.add("led-on");
}

/* ---------- STEPS: 8-step acid sequencer ---------- */

const STEP_MODES = ["on", "accent", "slide", "ratchet", "off"];
const STEP_LABELS = {
  on: "on",
  accent: "AC",
  slide: "SL",
  ratchet: "R2",
  off: "–",
};

/** @type {import("../types.js").ModuleDef} */
export const steps = {
  type: "steps",
  name: "STEPS",
  category: "sequencer",
  hp: 22,
  blurb:
    "8-step pitch sequencer with accent, slide and ratchets · quantized to a scale",
  ports: [
    { id: "clock", label: "clock", type: "gate", dir: "in" },
    { id: "reset", label: "reset", type: "gate", dir: "in" },
    { id: "transpose", label: "transp", type: "cv", dir: "in" },
    { id: "pitch", label: "pitch", type: "cv", dir: "out" },
    { id: "gate", label: "gate", type: "gate", dir: "out" },
    { id: "accent", label: "accent", type: "gate", dir: "out" },
  ],
  controls: [
    { id: "length", label: "length", value: 8, min: 1, max: 8, step: 1 },
    { id: "octave", label: "octave", value: -1, min: -4, max: 3, step: 1 },
    { id: "gate", label: "gate", value: 0.5, min: 0.05, max: 1, unit: "%" },
    {
      id: "glide",
      label: "glide",
      value: 0.06,
      min: 0.005,
      max: 0.4,
      curve: "exp",
      unit: "s",
    },
    rateControl,
    {
      id: "direction",
      label: "dir",
      value: "fwd",
      options: ["fwd", "rev", "pong", "rand"],
    },
    scaleControl("minor"),
    rootControl,
  ],
  initialData: () => ({
    steps: [0, 0, 12, 0, 3, 0, 10, 7].map((note, index) => ({
      note,
      mode: index === 2 ? "accent" : "on",
    })),
  }),
  create({ audio, data, values, emit, onClock, signal }) {
    const cv = voltage(audio);
    const pitch = audio.createGain();
    const transpose = scaler(audio, 1, pitch);
    const clockDiv = divider(values);
    let position = -1;
    let heading = 1;
    let gateHigh = false;
    let sliding = false;

    cv.connect(pitch);

    function advance() {
      const length = Math.max(1, Math.round(Number(values.length)));

      if (values.direction === "rand") {
        position = Math.floor(Math.random() * length);
      } else if (values.direction === "rev") {
        position = position <= 0 ? length - 1 : position - 1;
      } else if (values.direction === "pong") {
        if (position + heading >= length || position + heading < 0) {
          heading = -heading;
        }

        position = Math.min(length - 1, Math.max(0, position + heading));
      } else {
        position = (position + 1) % length;
      }
    }

    onClock((time, step) => {
      if (!clockDiv.passes()) {
        return;
      }

      advance();

      const stepLength = step * clockDiv.div();
      const { note, mode } = data.steps[position] ?? { note: 0, mode: "off" };
      const root = noteNames.indexOf(String(values.root));
      const semitone =
        quantizeSemitone(note + root, String(values.scale), root) +
        Number(values.octave) * 12;

      signal("step", position, time);

      if (mode === "off") {
        if (gateHigh) {
          emit("gate", time, 0);
          gateHigh = false;
        }

        sliding = false;
        return;
      }

      if (sliding) {
        cv.offset.setTargetAtTime(
          semitone / 12,
          time,
          Number(values.glide) / 3,
        );
      } else {
        cv.offset.setValueAtTime(semitone / 12, time);
      }

      const velocity = mode === "accent" ? 1 : 0.7;

      if (mode === "accent") {
        pulse(emit, "accent", time, stepLength * 0.5);
      }

      if (mode === "ratchet") {
        pulse(emit, "gate", time, stepLength * 0.22, velocity);
        pulse(
          emit,
          "gate",
          time + stepLength * 0.5,
          stepLength * 0.22,
          velocity,
        );
        gateHigh = false;
      } else if (!sliding || !gateHigh) {
        emit("gate", time, velocity);
        gateHigh = true;
      }

      // A slide step holds its gate into the next step so envelopes don't retrigger (303 legato).
      sliding = mode === "slide";

      if (!sliding && gateHigh) {
        emit("gate", time + stepLength * Number(values.gate), 0);
        gateHigh = false;
      }
    });

    return {
      inputs: { transpose },
      outputs: { pitch },
      reset() {
        position = -1;
        heading = 1;
        clockDiv.reset();
      },
      dispose: () => disconnectAll(cv, pitch, transpose),
    };
  },
  view(host, view) {
    host.classList.add("steps-view");

    const columns = view.data.steps.map((step, index) => {
      const column = el("div", "step-col");
      const led = el("span", "led");
      const slider = el("input", "step-slider");
      const name = el("span", "step-note");
      const mode = el("button", "step-mode", STEP_LABELS[step.mode]);

      slider.type = "range";
      slider.min = "0";
      slider.max = "24";
      slider.value = String(step.note);
      slider.setAttribute("aria-label", `Step ${index + 1} pitch`);
      slider.addEventListener("input", () => {
        step.note = Number(slider.value);
        label();
        view.changed();
      });

      mode.type = "button";
      mode.dataset.mode = step.mode;
      mode.title = "Click: on → accent → slide → ratchet → off";
      mode.setAttribute("aria-label", `Step ${index + 1} mode`);
      mode.addEventListener("click", () => {
        step.mode =
          STEP_MODES[(STEP_MODES.indexOf(step.mode) + 1) % STEP_MODES.length];
        mode.dataset.mode = step.mode;
        mode.textContent = STEP_LABELS[step.mode];
        view.changed();
      });

      function label() {
        const root = noteNames.indexOf(String(view.values.root));
        const semitone = quantizeSemitone(
          step.note + root,
          String(view.values.scale),
          root,
        );

        name.textContent = noteNames[((semitone % 12) + 12) % 12];
      }

      label();
      column.append(led, slider, name, mode);
      host.append(column);
      return { led, label };
    });

    view.on("step", (position) =>
      columns.forEach((column, index) =>
        column.led.classList.toggle("led-on", index === position),
      ),
    );
    view.on("value", ({ id }) => {
      if (id === "scale" || id === "root") {
        columns.forEach((column) => column.label());
      }
    });
  },
};

/* ---------- GRID: 6-lane drum trigger sequencer ---------- */

const LANES = ["kick", "snare", "hat", "open", "clap", "zap"];
const CELL_CYCLE = [0, 1, 2, 3];
const CELL_NAMES = ["off", "hit", "accent", "50% chance"];

/** @type {import("../types.js").ModuleDef} */
export const grid = {
  type: "grid",
  name: "GRID",
  category: "sequencer",
  hp: 28,
  blurb:
    "16-step drum grid · click: hit → accent → chance · click a lane name to mute",
  ports: [
    { id: "clock", label: "clock", type: "gate", dir: "in" },
    { id: "reset", label: "reset", type: "gate", dir: "in" },
    ...LANES.map((lane) => ({
      id: lane,
      label: lane,
      type: "gate",
      dir: "out",
    })),
  ],
  controls: [
    { id: "length", label: "length", value: 16, min: 1, max: 16, step: 1 },
    { id: "drift", label: "drift", value: 0.15, min: 0, max: 1, unit: "%" },
    rateControl,
  ],
  initialData: () => ({
    mutes: LANES.map(() => false),
    lanes: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 3, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0],
    ],
  }),
  create({ data, values, emit, onClock, signal }) {
    const clockDiv = divider(values);
    let position = -1;

    onClock((time, step) => {
      if (!clockDiv.passes()) {
        return;
      }

      position =
        (position + 1) % Math.max(1, Math.round(Number(values.length)));
      signal("step", position, time);

      const drift = Number(values.drift);

      LANES.forEach((lane, index) => {
        const cell = data.lanes[index]?.[position] ?? 0;

        if (data.mutes?.[index]) {
          return;
        }

        // Drift humanizes: nudges timing, varies velocity, adds rare ghost notes.
        const ghost =
          cell === 0 && lane !== "kick" && Math.random() < drift * 0.06;
        const plays =
          cell === 1 ||
          cell === 2 ||
          (cell === 3 && Math.random() < 0.5) ||
          ghost;

        if (plays) {
          const velocity = ghost
            ? 0.3
            : cell === 2
              ? 1
              : 0.72 - Math.random() * drift * 0.3;

          pulse(
            emit,
            lane,
            time + Math.random() * drift * 0.012,
            step * clockDiv.div() * 0.5,
            velocity,
          );
        }
      });
    });

    return {
      reset() {
        position = -1;
        clockDiv.reset();
      },
    };
  },
  view(host, view) {
    host.classList.add("grid-view");

    const rows = LANES.map((lane, laneIndex) => {
      const row = el("div", "grid-row");
      const mute = el("button", "grid-lane", lane);

      mute.type = "button";
      mute.setAttribute("aria-pressed", String(view.data.mutes[laneIndex]));
      mute.title = `Mute ${lane}`;
      mute.addEventListener("click", () => {
        view.data.mutes[laneIndex] = !view.data.mutes[laneIndex];
        mute.setAttribute("aria-pressed", String(view.data.mutes[laneIndex]));
        view.changed();
      });
      row.append(mute);

      const cells = view.data.lanes[laneIndex].map((value, stepIndex) => {
        const cell = el("button", "grid-cell");

        cell.type = "button";
        cell.dataset.value = String(value);
        cell.classList.toggle("grid-beat", stepIndex % 4 === 0);
        cell.setAttribute(
          "aria-label",
          `${lane} step ${stepIndex + 1}: ${CELL_NAMES[value]}`,
        );
        cell.addEventListener("click", (event) => {
          const lanes = view.data.lanes[laneIndex];

          lanes[stepIndex] = event.shiftKey
            ? 0
            : CELL_CYCLE[(lanes[stepIndex] + 1) % CELL_CYCLE.length];
          cell.dataset.value = String(lanes[stepIndex]);
          cell.setAttribute(
            "aria-label",
            `${lane} step ${stepIndex + 1}: ${CELL_NAMES[lanes[stepIndex]]}`,
          );
          view.changed();
        });
        row.append(cell);
        return cell;
      });

      host.append(row);
      return cells;
    });

    view.on("step", (position) => {
      rows.forEach((cells) =>
        cells.forEach((cell, index) =>
          cell.classList.toggle("grid-now", index === position),
        ),
      );
    });
  },
};

/* ---------- EUCLID: three euclidean rhythm channels ---------- */

const EUCLID_CHANNELS = ["a", "b", "c"];

function euclidControls(channel, stepsValue, hitsValue) {
  return [
    {
      id: `steps${channel}`,
      label: `${channel} len`,
      value: stepsValue,
      min: 1,
      max: 16,
      step: 1,
    },
    {
      id: `hits${channel}`,
      label: `${channel} hits`,
      value: hitsValue,
      min: 0,
      max: 16,
      step: 1,
    },
    {
      id: `rot${channel}`,
      label: `${channel} rot`,
      value: 0,
      min: 0,
      max: 15,
      step: 1,
    },
  ];
}

function euclidPattern(values, channel) {
  return euclid(
    Number(values[`steps${channel}`]),
    Number(values[`hits${channel}`]),
    Number(values[`rot${channel}`]),
  );
}

/** @type {import("../types.js").ModuleDef} */
export const euclidModule = {
  type: "euclid",
  name: "EUCLID",
  category: "sequencer",
  hp: 14,
  blurb: "Three euclidean rhythms with their own lengths: instant polyrhythm",
  ports: [
    { id: "clock", label: "clock", type: "gate", dir: "in" },
    { id: "reset", label: "reset", type: "gate", dir: "in" },
    ...EUCLID_CHANNELS.map((channel) => ({
      id: channel,
      label: channel,
      type: "gate",
      dir: "out",
    })),
  ],
  controls: [
    ...euclidControls("a", 16, 5),
    ...euclidControls("b", 12, 4),
    ...euclidControls("c", 7, 3),
  ],
  create({ values, emit, onClock, signal }) {
    let count = 0;

    onClock((time, step) => {
      const positions = EUCLID_CHANNELS.map((channel) => {
        const pattern = euclidPattern(values, channel);
        const position = count % pattern.length;

        if (pattern[position]) {
          pulse(emit, channel, time, step * 0.5);
        }

        return position;
      });

      signal("step", positions, time);
      count += 1;
    });

    return {
      reset() {
        count = 0;
      },
    };
  },
  view(host, view) {
    const canvas = el("canvas", "euclid-ring");
    const size = 104;
    const ratio = globalThis.devicePixelRatio ?? 1;
    const context = canvas.getContext("2d");
    let positions = [-1, -1, -1];

    canvas.width = size * ratio;
    canvas.height = size * ratio;
    canvas.style.width = `${size}px`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Euclidean rhythm rings");
    host.append(canvas);

    const colors = [
      "oklch(72% 0.19 145)",
      "oklch(74% 0.17 60)",
      "oklch(70% 0.17 300)",
    ];

    function draw() {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size, size);

      EUCLID_CHANNELS.forEach((channel, ring) => {
        const pattern = euclidPattern(view.values, channel);
        const radius = 46 - ring * 14;

        pattern.forEach((hit, index) => {
          const angle = (index / pattern.length) * Math.PI * 2 - Math.PI / 2;
          const x = size / 2 + Math.cos(angle) * radius;
          const y = size / 2 + Math.sin(angle) * radius;
          const now = positions[ring] === index;

          context.beginPath();
          context.arc(x, y, now ? 4.5 : hit ? 3.2 : 1.4, 0, Math.PI * 2);
          context.fillStyle = hit ? colors[ring] : "oklch(45% 0.01 264)";
          context.globalAlpha = now ? 1 : hit ? 0.75 : 0.6;
          context.fill();

          if (now) {
            context.strokeStyle = "oklch(98% 0 0)";
            context.lineWidth = 1.5;
            context.stroke();
          }
        });
      });

      context.globalAlpha = 1;
    }

    draw();
    view.on("step", (next) => {
      positions = next;
      draw();
    });
    view.on("value", draw);
  },
};

/* ---------- TURING: looping random melodies ---------- */

/** @type {import("../types.js").ModuleDef} */
export const turing = {
  type: "turing",
  name: "TURING",
  category: "sequencer",
  hp: 12,
  blurb:
    "Turing Machine: random melodies that loop · turn CHAOS up to let them mutate",
  ports: [
    { id: "clock", label: "clock", type: "gate", dir: "in" },
    { id: "pitch", label: "pitch", type: "cv", dir: "out" },
    { id: "gate", label: "gate", type: "gate", dir: "out" },
    { id: "mod", label: "mod", type: "cv", dir: "out" },
  ],
  controls: [
    { id: "chaos", label: "chaos", value: 0.08, min: 0, max: 1, unit: "%" },
    { id: "length", label: "length", value: 8, min: 2, max: 16, step: 1 },
    { id: "range", label: "range", value: 7, min: 1, max: 21, step: 1 },
    { id: "octave", label: "octave", value: 0, min: -4, max: 3, step: 1 },
    { id: "rate", label: "rate", value: "1/8", options: Object.keys(RATES) },
    scaleControl("pent min"),
    rootControl,
  ],
  initialData: () => ({
    bits: Array.from({ length: 16 }, () => (Math.random() < 0.5 ? 1 : 0)),
  }),
  create({ audio, data, values, emit, onClock, signal }) {
    const pitch = voltage(audio);
    const mod = voltage(audio);
    const clockDiv = divider(values);

    // A register from an old or hand-edited patch may be missing bits: start a fresh loop.
    if (!Array.isArray(data.bits) || data.bits.length < 16) {
      data.bits = turing.initialData().bits;
    }

    onClock((time, step) => {
      if (!clockDiv.passes()) {
        return;
      }

      data.bits = turingStep(
        data.bits,
        Number(values.length),
        Number(values.chaos),
      );

      const value = registerValue(data.bits);
      const root = noteNames.indexOf(String(values.root));
      const degree = Math.floor(value * Number(values.range));
      const semitone =
        scaleDegree(degree, String(values.scale), root) +
        Number(values.octave) * 12;

      pitch.offset.setValueAtTime(semitone / 12, time);
      mod.offset.setTargetAtTime(value * 5, time, 0.01);

      if (data.bits[0]) {
        pulse(
          emit,
          "gate",
          time,
          step * clockDiv.div() * 0.5,
          0.55 + value * 0.45,
        );
      }

      signal("bits", data.bits.slice(0, 8), time);
    });

    return {
      outputs: { pitch, mod },
      reset: () => clockDiv.reset(),
      dispose: () => disconnectAll(pitch, mod),
    };
  },
  view(host, view) {
    const leds = ledRow(host, 8, "led led-bit");
    const show = (bits) =>
      leds.forEach((led, index) =>
        led.classList.toggle("led-on", Boolean(bits[index])),
      );

    show(view.data.bits);
    view.on("bits", show);
  },
};

/* ---------- KEYS: MIDI + computer keyboard ---------- */

/** @type {import("../types.js").ModuleDef} */
export const keys = {
  type: "keys",
  name: "KEYS",
  category: "sequencer",
  hp: 6,
  blurb:
    "Play from MIDI or your keyboard (A W S E D F T G… · Z/X shift octave)",
  ports: [
    { id: "pitch", label: "pitch", type: "cv", dir: "out" },
    { id: "gate", label: "gate", type: "gate", dir: "out" },
    { id: "velo", label: "velo", type: "cv", dir: "out" },
  ],
  controls: [
    { id: "octave", label: "octave", value: 0, min: -3, max: 3, step: 1 },
    {
      id: "glide",
      label: "glide",
      value: 0.005,
      min: 0.001,
      max: 0.5,
      curve: "exp",
      unit: "s",
    },
  ],
  create({ audio, values, emit, onNote, signal }) {
    const pitch = voltage(audio);
    const velo = voltage(audio);
    const held = [];

    onNote((note, velocity) => {
      const time = audio.currentTime + 0.005;
      const index = held.indexOf(note);

      if (index !== -1) {
        held.splice(index, 1);
      }

      if (velocity > 0) {
        held.push(note);
      }

      // Last-note priority: releasing a key falls back to the one still held.
      const current = held[held.length - 1];

      if (current === undefined) {
        emit("gate", time, 0);
        signal("note", null);
        return;
      }

      pitch.offset.setTargetAtTime(
        midiToVolts(current) + Number(values.octave),
        time,
        Number(values.glide) / 3,
      );

      if (velocity > 0) {
        velo.offset.setValueAtTime(velocity * 5, time);
        emit("gate", time, velocity);
      }

      signal("note", current);
    });

    return {
      outputs: { pitch, velo },
      dispose: () => disconnectAll(pitch, velo),
    };
  },
  view(host, view) {
    const display = el("span", "keys-note", "—");

    host.append(display);
    view.on("note", (note) => {
      display.textContent =
        note === null
          ? "—"
          : `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;
      display.classList.toggle("keys-live", note !== null);
    });
  },
};
