import { describe, expect, test } from "vitest";
import {
  BAR_TICKS,
  STEP_TICKS,
  reanchor,
  secondsToTicks,
  swingTick,
  tickAtTime,
  ticksToSeconds,
  timeAtTick,
} from "./timing";

describe("ticks and seconds", () => {
  test("one bar at 120 BPM lasts two seconds", () => {
    expect(ticksToSeconds(BAR_TICKS, 120)).toBe(2);
    expect(secondsToTicks(2, 120)).toBe(BAR_TICKS);
  });

  test("re-anchoring on a tempo change keeps the anchor tick at the same moment", () => {
    const anchor = { time: 10, tick: 0, bpm: 120 };
    const next = reanchor(anchor, BAR_TICKS, 60);
    expect(next.time).toBe(timeAtTick(anchor, BAR_TICKS));
    expect(timeAtTick(next, BAR_TICKS * 2) - next.time).toBe(4);
    expect(tickAtTime(next, next.time + 4)).toBe(BAR_TICKS * 2);
  });
});

describe("swing", () => {
  test("zero swing changes nothing", () => {
    expect(swingTick(STEP_TICKS, 0)).toBe(STEP_TICKS);
  });

  test("full swing pushes the off-beat 16th to 75% of the 8th and leaves on-beats alone", () => {
    expect(swingTick(STEP_TICKS, 1)).toBe(STEP_TICKS * 1.5);
    expect(swingTick(STEP_TICKS * 3, 1)).toBe(STEP_TICKS * 3.5);
    expect(swingTick(STEP_TICKS * 2, 1)).toBe(STEP_TICKS * 2);
    expect(swingTick(0, 1)).toBe(0);
  });

  test("swing never reorders notes", () => {
    let previous = -1;
    for (let tick = 0; tick < BAR_TICKS; tick += 1) {
      const swung = swingTick(tick, 0.7);
      expect(swung).toBeGreaterThan(previous);
      previous = swung;
    }
  });
});
