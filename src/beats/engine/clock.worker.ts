/**
 * Clock thread for the scheduler. Post a period in ms to start ticking, 0 to stop.
 * Worker timers keep running in background tabs, where main-thread timers are throttled.
 */
let timer: ReturnType<typeof setInterval> | undefined;

self.addEventListener("message", (event: MessageEvent<number>) => {
  clearInterval(timer);
  if (event.data > 0) timer = setInterval(() => self.postMessage(0), event.data);
});
