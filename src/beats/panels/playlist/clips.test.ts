import { describe, expect, test } from "vitest";
import { createProject } from "@/core/defaults";
import type { Clip } from "@/core/schema";
import { BAR_TICKS } from "@/core/timing";
import {
  clipsInBox,
  clipsSpan,
  hitClip,
  isFree,
  moveDelta,
  pasteClips,
  resizedLength,
} from "./clips";

const clip = (id: string, trackId: string, start: number, length = BAR_TICKS): Clip => ({
  id,
  patternId: "p",
  trackId,
  start,
  length,
});
const rowOf = new Map([
  ["t0", 0],
  ["t1", 1],
  ["t2", 2],
]);

describe("hitClip", () => {
  const clips = [clip("a", "t0", 0), clip("b", "t0", 0, BAR_TICKS * 2), clip("c", "t1", 0)];

  test("returns the topmost clip on the row", () => {
    expect(hitClip(clips, rowOf, 10, 0, 20)?.clip.id).toBe("b");
    expect(hitClip(clips, rowOf, 10, 1, 20)?.clip.id).toBe("c");
    expect(hitClip(clips, rowOf, 10, 2, 20)).toBeNull();
  });

  test("detects the resize edge, capped to a third of the clip", () => {
    expect(hitClip(clips, rowOf, BAR_TICKS - 5, 1, 20)?.zone).toBe("end");
    expect(hitClip(clips, rowOf, BAR_TICKS - 30, 1, 20)?.zone).toBe("body");
    expect(hitClip([clip("s", "t0", 0, 30)], rowOf, 15, 0, 1000)?.zone).toBe("body");
  });

  test("end is exclusive", () => {
    expect(hitClip(clips, rowOf, BAR_TICKS, 1, 20)).toBeNull();
  });
});

test("clipsInBox selects overlapping clips on the rows covered", () => {
  const clips = [clip("a", "t0", 0), clip("b", "t1", BAR_TICKS * 2), clip("c", "t2", 0)];
  const box = { tick0: BAR_TICKS * 2.5, tick1: 10, row0: 1.8, row1: 0.2 };
  expect([...clipsInBox(clips, rowOf, box)].sort()).toEqual(["a", "b"]);
});

describe("moveDelta", () => {
  const group = [
    { start: BAR_TICKS, row: 1 },
    { start: BAR_TICKS * 3, row: 2 },
  ];
  const lead = group[0] ?? { start: 0, row: 0 };

  test("snaps the lead clip to the grid", () => {
    expect(moveDelta(group, lead, BAR_TICKS * 0.6, 0, 3, BAR_TICKS).ticks).toBe(BAR_TICKS);
    expect(moveDelta(group, lead, 7, 0, 3, 1).ticks).toBe(7);
  });

  test("clamps the group to tick 0 and the track list", () => {
    expect(moveDelta(group, lead, -BAR_TICKS * 5, -4, 3, BAR_TICKS)).toEqual({
      ticks: -BAR_TICKS,
      rows: -1,
    });
    expect(moveDelta(group, lead, 0, 3, 3, BAR_TICKS).rows).toBe(0);
  });
});

test("resizedLength snaps the end and keeps one grid unit", () => {
  expect(resizedLength(0, BAR_TICKS * 2.6, BAR_TICKS)).toBe(BAR_TICKS * 3);
  expect(resizedLength(BAR_TICKS, 0, BAR_TICKS)).toBe(BAR_TICKS);
});

test("isFree checks overlap on one track only", () => {
  const clips = [clip("a", "t0", BAR_TICKS)];
  expect(isFree(clips, "t0", 0, BAR_TICKS)).toBe(true);
  expect(isFree(clips, "t0", BAR_TICKS / 2, BAR_TICKS)).toBe(false);
  expect(isFree(clips, "t1", BAR_TICKS, BAR_TICKS)).toBe(true);
});

test("clipsSpan rounds the extent up to bars", () => {
  expect(clipsSpan([])).toBe(0);
  expect(clipsSpan([clip("a", "t0", BAR_TICKS, 100), clip("b", "t1", BAR_TICKS * 2, 10)])).toBe(
    BAR_TICKS * 2,
  );
});

test("pasteClips adds shifted copies with new ids", () => {
  const project = createProject();
  const [source] = project.playlist.clips;
  if (!source) throw new Error("starter project has a clip");
  const ids = pasteClips(project, [source], BAR_TICKS * 4);
  const copy = project.playlist.clips.find((item) => item.id === ids[0]);
  expect(copy).toMatchObject({
    patternId: source.patternId,
    trackId: source.trackId,
    start: source.start + BAR_TICKS * 4,
    length: source.length,
  });
  expect(copy?.id).not.toBe(source.id);
});
