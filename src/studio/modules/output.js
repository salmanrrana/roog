import { disconnectAll, glide, scaler } from "./shared.js";

function canvasIn(host, width, height, label) {
  const canvas = document.createElement("canvas");
  const ratio = globalThis.devicePixelRatio ?? 1;

  canvas.className = "screen";
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  host.append(canvas);

  const context = canvas.getContext("2d");

  context.scale(ratio, ratio);
  return context;
}

/**
 * Run `draw` every frame until the panel leaves the page (module removed).
 * Panels are mounted in the same task they're built, so the first frame always sees them connected.
 */
export function animate(element, draw) {
  const frame = () => {
    if (element.isConnected) {
      draw();
      requestAnimationFrame(frame);
    }
  };

  requestAnimationFrame(frame);
}

// Find a rising zero crossing so periodic waves stand still on screen.
function triggerIndex(samples, span) {
  for (let index = 1; index < samples.length - span; index += 1) {
    if (samples[index - 1] <= 0 && samples[index] > 0) {
      return index;
    }
  }

  return 0;
}

/** @type {import("../types.js").ModuleDef} */
export const scope = {
  type: "scope",
  name: "SCOPE",
  category: "utility",
  hp: 14,
  blurb:
    "Two-channel scope with an XY mode for Lissajous figures · A passes through",
  ports: [
    { id: "a", label: "a", type: "audio", dir: "in" },
    { id: "b", label: "b", type: "cv", dir: "in" },
    { id: "thru", label: "a thru", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "zoom", label: "time", value: 0.35, min: 0.05, max: 1, unit: "%" },
    { id: "gainB", label: "b scale", value: 0.2, min: 0.05, max: 2 },
    { id: "mode", label: "mode", value: "wave", options: ["wave", "xy"] },
  ],
  create({ audio }) {
    const a = audio.createGain();
    const b = audio.createGain();
    const probeA = audio.createAnalyser();
    const probeB = audio.createAnalyser();

    probeA.fftSize = 2048;
    probeB.fftSize = 2048;
    a.connect(probeA);
    b.connect(probeB);

    return {
      inputs: { a, b },
      outputs: { thru: a },
      probes: { a: probeA, b: probeB },
      dispose: () => disconnectAll(a, b, probeA, probeB),
    };
  },
  view(host, view) {
    const width = 150;
    const height = 112;
    const context = canvasIn(host, width, height, "Oscilloscope");
    const samplesA = new Float32Array(2048);
    const samplesB = new Float32Array(2048);

    function trace(samples, start, span, scale, color) {
      context.beginPath();

      for (let index = 0; index < span; index += 1) {
        const x = (index / (span - 1)) * width;
        const y = height / 2 - samples[start + index] * scale * (height / 2.3);

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.shadowColor = color;
      context.shadowBlur = 6;
      context.stroke();
      context.shadowBlur = 0;
    }

    animate(context.canvas, () => {
      const probeA = view.probe("a");
      const probeB = view.probe("b");

      context.fillStyle = "rgb(6 16 10 / 0.55)";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgb(80 240 140 / 0.12)";
      context.lineWidth = 1;
      context.beginPath();

      for (let x = 0; x <= width; x += width / 6) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }

      for (let y = 0; y <= height; y += height / 4) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }

      context.stroke();

      if (!probeA || !probeB) {
        return;
      }

      probeA.getFloatTimeDomainData(samplesA);
      probeB.getFloatTimeDomainData(samplesB);

      const scaleB = Number(view.values.gainB);

      if (view.values.mode === "xy") {
        context.beginPath();

        for (let index = 0; index < samplesA.length; index += 2) {
          const x = width / 2 + samplesA[index] * (width / 2.2);
          const y = height / 2 - samplesB[index] * scaleB * (height / 2.2);

          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }

        context.strokeStyle = "rgb(120 255 170)";
        context.lineWidth = 1.2;
        context.stroke();
        return;
      }

      const span = Math.max(32, Math.floor(1024 * Number(view.values.zoom)));
      const start = triggerIndex(samplesA, span);

      trace(samplesB, start, span, scaleB, "rgb(110 170 255)");
      trace(samplesA, start, span, 1, "rgb(255 170 90)");
    });
  },
};

/** @type {import("../types.js").ModuleDef} */
export const out = {
  type: "out",
  name: "OUT",
  category: "utility",
  hp: 6,
  blurb:
    "To the speakers, through a limiter · R copies L when nothing is patched",
  ports: [
    { id: "left", label: "L", type: "audio", dir: "in" },
    { id: "right", label: "R", type: "audio", dir: "in" },
  ],
  controls: [{ id: "level", label: "level", value: 0.8, min: 0, max: 1.2 }],
  create({ audio, master, isPatched }) {
    const left = audio.createGain();
    const right = audio.createGain();
    const normal = audio.createGain();
    const merger = audio.createChannelMerger(2);
    const level = scaler(audio, 0.8, master);
    const meter = audio.createAnalyser();

    meter.fftSize = 512;
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    // Normalled jack: with R unpatched, L feeds both sides.
    left.connect(normal);
    normal.connect(merger, 0, 1);
    merger.connect(level);
    level.connect(meter);

    return {
      inputs: { left, right },
      probes: { meter },
      set: (_, value) => glide(level.gain, value, audio),
      patched() {
        normal.gain.value = isPatched("right") ? 0 : 1;
      },
      dispose: () => disconnectAll(left, right, normal, merger, level, meter),
    };
  },
  view(host, view) {
    const meter = document.createElement("div");
    const fill = document.createElement("span");
    const samples = new Float32Array(512);

    meter.className = "vu";
    meter.setAttribute("aria-hidden", "true");
    meter.append(fill);
    host.append(meter);

    let peak = 0;

    animate(meter, () => {
      const probe = view.probe("meter");

      if (probe) {
        probe.getFloatTimeDomainData(samples);
        const level = Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) /
            samples.length,
        );

        peak = Math.max(level * 2.2, peak * 0.92);
        fill.style.setProperty("--level", String(Math.min(1, peak)));
      }
    });
  },
};
