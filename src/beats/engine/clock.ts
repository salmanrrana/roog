export interface Clock {
  start(): void;
  stop(): void;
}

/**
 * A steady tick every `periodMs` from a module Worker (keeps time in hidden tabs).
 * Falls back to a main-thread setInterval if the worker can't be created or fails.
 */
export function createClock(periodMs: number, onTick: () => void): Clock {
  let running = false;
  let interval: ReturnType<typeof setInterval> | undefined;

  const fallback: Clock = {
    start: () => {
      clearInterval(interval);
      interval = setInterval(onTick, periodMs);
    },
    stop: () => clearInterval(interval),
  };

  let active = fallback;
  try {
    const worker = new Worker(new URL("./clock.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", onTick);
    worker.addEventListener("error", () => {
      worker.terminate();
      active = fallback;
      if (running) fallback.start();
    });
    active = {
      start: () => worker.postMessage(periodMs),
      stop: () => worker.postMessage(0),
    };
  } catch {
    // No module workers here: keep the setInterval fallback.
  }

  return {
    start: () => {
      running = true;
      active.start();
    },
    stop: () => {
      running = false;
      active.stop();
    },
  };
}
