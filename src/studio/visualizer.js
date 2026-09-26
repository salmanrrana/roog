// Full-width music visualizer. Three modes:
//   orbit     - a 16-step clock ring; every gate in the patch bursts out of
//               the ring at the step it fired on, the master waveform wraps
//               the center and the bass makes it breathe
//   spectrum  - log-spaced bars with falling peak caps
//   waterfall - scrolling spectrogram, low notes at the bottom

export const visualizerModes = ["orbit", "spectrum", "waterfall"];

const MAX_PARTICLES = 400;

function hueOf(text) {
  let hash = 0;

  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }

  return hash;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ studio: ReturnType<typeof import("./engine.js").createStudio> }} options
 */
export function createVisualizer(canvas, { studio }) {
  const context = canvas.getContext("2d");
  const particles = [];
  const ticks = [];
  let mode = "orbit";
  let width = 0;
  let height = 0;
  let ratio = 1;
  let freq = new Uint8Array(0);
  let wave = new Float32Array(0);
  let peaks = new Float32Array(96);
  let bass = 0;

  studio.transport.onTick((tick, time) => {
    ticks.push({ tick, time });
    ticks.splice(0, Math.max(0, ticks.length - 64));
  });

  // Gates are scheduled slightly ahead; hold each one until its audio time arrives.
  const pending = [];

  studio.onGate((event) => pending.push(event));

  function stepAt(time) {
    let current = null;

    for (const entry of ticks) {
      if (entry.time <= time + 0.004) {
        current = entry;
      }
    }

    return current;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();

    ratio = globalThis.devicePixelRatio ?? 1;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#07080c";
    context.fillRect(0, 0, width, height);
  }

  function readAudio() {
    const analyser = studio.bus?.analyser;

    if (!analyser) {
      return false;
    }

    if (freq.length !== analyser.frequencyBinCount) {
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Float32Array(analyser.fftSize);
    }

    analyser.getByteFrequencyData(freq);
    analyser.getFloatTimeDomainData(wave);

    // Bass energy: roughly 30–150 Hz.
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const low = Math.floor(30 / binHz);
    const high = Math.ceil(150 / binHz);
    let sum = 0;

    for (let index = low; index <= high; index += 1) {
      sum += freq[index];
    }

    bass = bass * 0.7 + (sum / (high - low + 1) / 255) * 0.3;
    return true;
  }

  // Map 0..1 to a log frequency bin between 30 Hz and 16 kHz.
  function binAt(position) {
    const analyser = studio.bus.analyser;
    const hz = 30 * (16000 / 30) ** position;

    return Math.min(
      freq.length - 1,
      Math.round(hz / (analyser.context.sampleRate / analyser.fftSize)),
    );
  }

  function drawOrbit(now) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.36;
    const current = stepAt(now);
    const step = current ? current.tick % 16 : -1;

    context.fillStyle = "rgb(7 8 12 / 0.24)";
    context.fillRect(0, 0, width, height);

    // Clock ring
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2 - Math.PI / 2;
      const lit = index === step;

      context.beginPath();
      context.arc(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        lit ? 5 : index % 4 === 0 ? 3 : 1.8,
        0,
        Math.PI * 2,
      );
      context.fillStyle = lit ? "rgb(255 255 255)" : "rgb(255 255 255 / 0.28)";
      context.fill();
    }

    // Release gates whose time has come as particles on the ring.
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const event = pending[index];

      if (event.time <= now + 0.004) {
        pending.splice(index, 1);

        const at = stepAt(event.time);
        const angle =
          ((at ? at.tick % 16 : 0) / 16) * Math.PI * 2 -
          Math.PI / 2 +
          (Math.random() - 0.5) * 0.12;
        const hue = hueOf(`${event.moduleId}.${event.port}`);
        const count = 3 + Math.round(event.velocity * 6);

        for (
          let spark = 0;
          spark < count && particles.length < MAX_PARTICLES;
          spark += 1
        ) {
          const speed = 0.6 + Math.random() * 2.4 * event.velocity;
          const spread = angle + (Math.random() - 0.5) * 0.5;

          particles.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
            vx: Math.cos(spread) * speed,
            vy: Math.sin(spread) * speed,
            life: 1,
            size: 1.5 + event.velocity * 3,
            hue,
          });
        }
      }
    }

    context.globalCompositeOperation = "lighter";

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      particle.life -= 0.014;

      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }

      context.beginPath();
      context.arc(
        particle.x,
        particle.y,
        particle.size * particle.life,
        0,
        Math.PI * 2,
      );
      context.fillStyle = `hsl(${particle.hue} 90% 62% / ${particle.life})`;
      context.fill();
    }

    // Master waveform wrapped around the center, breathing with the bass.
    if (wave.length > 0) {
      const inner = radius * (0.42 + bass * 0.35);

      context.beginPath();

      for (let index = 0; index <= 256; index += 1) {
        const sample = wave[Math.floor((index / 256) * (wave.length - 1))];
        const angle = (index / 256) * Math.PI * 2 - Math.PI / 2;
        const r = inner + sample * radius * 0.45;

        if (index === 0) {
          context.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        } else {
          context.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
      }

      context.strokeStyle = `hsl(${30 + bass * 40} 100% ${55 + bass * 20}% / 0.9)`;
      context.lineWidth = 1.6 + bass * 3;
      context.shadowColor = "rgb(255 150 60)";
      context.shadowBlur = 10 + bass * 30;
      context.stroke();
      context.shadowBlur = 0;
    }

    context.globalCompositeOperation = "source-over";
  }

  function drawSpectrum() {
    const bars = peaks.length;
    const gap = 2;
    const barWidth = width / bars - gap;

    context.fillStyle = "rgb(7 8 12 / 0.5)";
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < bars; index += 1) {
      const level = freq[binAt(index / bars)] / 255;
      const x = index * (barWidth + gap);
      const barHeight = level * (height - 8);

      peaks[index] = Math.max(level, peaks[index] - 0.008);
      context.fillStyle = `hsl(${200 - index * 1.8} 85% ${45 + level * 25}%)`;
      context.fillRect(x, height - barHeight, barWidth, barHeight);
      context.fillStyle = "rgb(255 255 255 / 0.85)";
      context.fillRect(
        x,
        height - peaks[index] * (height - 8) - 2,
        barWidth,
        2,
      );
    }
  }

  function drawWaterfall() {
    const columnWidth = 2;

    // Shift the image left, then paint the newest column on the right edge.
    context.drawImage(
      canvas,
      columnWidth * ratio,
      0,
      canvas.width - columnWidth * ratio,
      canvas.height,
      0,
      0,
      width - columnWidth,
      height,
    );

    for (let y = 0; y < height; y += 2) {
      const level = freq[binAt(1 - y / height)] / 255;

      context.fillStyle = `hsl(${280 - level * 260} 90% ${level * 60}%)`;
      context.fillRect(width - columnWidth, y, columnWidth, 2);
    }
  }

  function frame() {
    if (
      canvas.clientWidth !== Math.round(width) ||
      canvas.clientHeight !== Math.round(height)
    ) {
      resize();
    }

    const live = readAudio();
    const now = studio.audio?.currentTime ?? 0;

    if (mode !== "orbit") {
      pending.length = 0;
    }

    if (!live) {
      drawIdle();
    } else if (mode === "orbit") {
      drawOrbit(now);
    } else if (mode === "spectrum") {
      drawSpectrum();
    } else {
      drawWaterfall();
    }

    requestAnimationFrame(frame);
  }

  function drawIdle() {
    context.fillStyle = "#07080c";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgb(255 255 255 / 0.45)";
    context.font = "700 12px 'JetBrains Mono', monospace";
    context.textAlign = "center";
    context.fillText("POWER ON TO SEE THE MUSIC", width / 2, height / 2 + 4);
  }

  resize();
  requestAnimationFrame(frame);

  return {
    get mode() {
      return mode;
    },
    set mode(next) {
      mode = visualizerModes.includes(next) ? next : "orbit";
      peaks = new Float32Array(96);
      context.fillStyle = "#07080c";
      context.fillRect(0, 0, width, height);
    },
  };
}
