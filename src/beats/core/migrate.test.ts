import { describe, expect, test } from "vitest";
import { createProject } from "./defaults";
import { parseProject } from "./migrate";
import { PROJECT_VERSION } from "./schema";

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("parseProject", () => {
  test("accepts the starter project after a JSON round trip", () => {
    const project = createProject("Demo", 1);
    const result = parseProject(roundTrip(project));
    expect(result).toEqual({ ok: true, project });
  });

  test("rejects junk, missing versions and projects from a newer build", () => {
    expect(parseProject("nope").ok).toBe(false);
    expect(parseProject({ name: "x" }).ok).toBe(false);
    expect(parseProject({ ...createProject(), version: PROJECT_VERSION + 1 }).ok).toBe(false);
    expect(parseProject({ ...createProject(), bpm: "fast" }).ok).toBe(false);
  });

  test("never mutates its input", () => {
    const raw = roundTrip(createProject());
    const before = JSON.stringify(raw);
    parseProject(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  test("normalizes against the registries: unknown instruments, missing params, unknown effects", () => {
    const project = createProject();
    const [first, second] = project.channels;
    if (!first || !second) throw new Error("starter kit changed");
    first.instrument = "theremin-from-the-future";
    second.params = { tune: 999 };
    project.mixer.master.effects = [{ id: "fx", kind: "warp-drive", enabled: true, params: {} }];

    const result = parseProject(roundTrip(project));
    if (!result.ok) throw new Error(result.error);
    const [a, b] = result.project.channels;
    expect(a?.instrument).toBe("sampler");
    expect(Object.keys(a?.params ?? {}).length).toBeGreaterThan(0);
    expect(b?.params.tune).toBe(24);
    expect(Object.keys(b?.params ?? {})).toEqual(Object.keys(a?.params ?? {}));
    expect(result.project.mixer.master.effects).toEqual([]);
  });

  test("repairs dangling references", () => {
    const project = createProject();
    const [channel] = project.channels;
    if (!channel) throw new Error("starter kit changed");
    channel.mixerTrackId = "deleted-insert";
    project.patterns[0]!.notes["deleted-channel"] = [];
    project.playlist.clips.push({
      id: "c",
      patternId: "deleted-pattern",
      trackId: project.playlist.tracks[0]!.id,
      start: 0,
      length: 96,
    });

    const result = parseProject(roundTrip(project));
    if (!result.ok) throw new Error(result.error);
    expect(result.project.channels[0]?.mixerTrackId).toBe("master");
    expect(result.project.patterns[0]?.notes["deleted-channel"]).toBeUndefined();
    expect(result.project.playlist.clips.map((clip) => clip.id)).not.toContain("c");
  });
});
