// Master clock. Uses the "two clocks" pattern: a coarse JS timer wakes up
// every ~25 ms and schedules every 16th-note tick that falls inside the next
// lookahead window on the precise audio clock. Sequencers subscribe with
// onTick and receive the exact audio time of each step.

const LOOKAHEAD_SECONDS = 0.12;
const TIMER_MS = 25;
const START_DELAY = 0.06;

// A tiny worker keeps ticking when the tab is in the background, where
// main-thread timers get throttled to once a second.
function createTimer(callback) {
  try {
    const source = `let id; onmessage = (e) => { clearInterval(id); if (e.data) id = setInterval(() => postMessage(0), e.data); };`;
    const worker = new Worker(
      URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    );

    worker.onmessage = callback;
    return {
      start: () => worker.postMessage(TIMER_MS),
      stop: () => worker.postMessage(0),
    };
  } catch {
    let id = null;

    return {
      start: () => {
        clearInterval(id);
        id = setInterval(callback, TIMER_MS);
      },
      stop: () => clearInterval(id),
    };
  }
}

/**
 * @param {{ currentTime: number }} clock - usually the AudioContext
 * @param {{ bpm?: number, swing?: number, timer?: (cb: () => void) => { start(): void, stop(): void } }} [options]
 */
export function createTransport(clock, options = {}) {
  const tickListeners = new Set();
  const startListeners = new Set();
  const timer = (options.timer ?? createTimer)(() => schedule());
  const tapTimes = [];

  let bpm = options.bpm ?? 120;
  let swing = options.swing ?? 0;
  let playing = false;
  let tick = 0;
  let nextTime = 0;

  function stepSeconds() {
    return 60 / bpm / 4;
  }

  // Swing pushes every odd 16th late by up to half a step (0.5 swing ≈ MPC 62%).
  function schedule() {
    const horizon = clock.currentTime + LOOKAHEAD_SECONDS;

    while (playing && nextTime < horizon) {
      const duration = stepSeconds();
      const time = nextTime + (tick % 2 === 1 ? swing * duration * 0.5 : 0);

      tickListeners.forEach((listener) => listener(tick, time, duration));
      nextTime += duration;
      tick += 1;
    }
  }

  return {
    get bpm() {
      return bpm;
    },
    // Out-of-range values clamp; non-numbers (e.g. from a hand-edited patch) are ignored.
    set bpm(value) {
      if (Number.isFinite(Number(value))) {
        bpm = Math.min(300, Math.max(20, Number(value)));
      }
    },
    get swing() {
      return swing;
    },
    set swing(value) {
      if (Number.isFinite(Number(value))) {
        swing = Math.min(1, Math.max(0, Number(value)));
      }
    },
    get playing() {
      return playing;
    },
    get stepSeconds() {
      return stepSeconds();
    },

    /** Subscribe to 16th-note ticks. Returns an unsubscribe function. */
    onTick(listener) {
      tickListeners.add(listener);
      return () => tickListeners.delete(listener);
    },

    /** Subscribe to play-from-the-top events (used to reset sequencers). */
    onStart(listener) {
      startListeners.add(listener);
      return () => startListeners.delete(listener);
    },

    start() {
      if (playing) {
        return;
      }

      playing = true;
      tick = 0;
      nextTime = clock.currentTime + START_DELAY;
      startListeners.forEach((listener) => listener(nextTime));
      schedule();
      timer.start();
    },

    stop() {
      playing = false;
      timer.stop();
    },

    /** Tap tempo: averages the last few taps, resets after a 2 s pause. */
    tap(now = performance.now()) {
      if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
        tapTimes.length = 0;
      }

      tapTimes.push(now);
      tapTimes.splice(0, Math.max(0, tapTimes.length - 5));

      if (tapTimes.length >= 2) {
        const gaps = tapTimes
          .slice(1)
          .map((time, index) => time - tapTimes[index]);
        const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

        this.bpm = Math.round(60000 / average);
      }

      return bpm;
    },

    // Exposed for tests and for manual pumping.
    schedule,
  };
}
