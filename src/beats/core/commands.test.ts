import { describe, expect, test } from "vitest";
import {
  addChannel,
  addPattern,
  clonePattern,
  hasStep,
  removeChannel,
  removePattern,
  removePlaylistTrack,
  setChannelParam,
  setStep,
  toggleChannelSolo,
} from "./commands";
import { createProject } from "./defaults";
import type { Project } from "./schema";

const fresh = (): Project => structuredClone(createProject());

describe("channels", () => {
  test("a new channel gets its own mixer insert", () => {
    const project = fresh();
    const id = addChannel(project, { name: "Tom", sampleId: "factory:tom" });
    const channel = project.channels.find((item) => item.id === id);
    const insert = project.mixer.inserts.find((track) => track.id === channel?.mixerTrackId);
    expect(insert?.name).toBe("Tom");
  });

  test("removing a channel removes its notes from every pattern", () => {
    const project = fresh();
    const kick = project.channels[0];
    if (!kick) throw new Error("starter kit changed");
    removeChannel(project, kick.id);
    expect(project.patterns.every((pattern) => !(kick.id in pattern.notes))).toBe(true);
  });

  test("params are clamped to the instrument's spec and unknown keys are ignored", () => {
    const project = fresh();
    const id = project.channels[0]?.id ?? "";
    setChannelParam(project, id, "tune", 100);
    setChannelParam(project, id, "nonsense", 1);
    expect(project.channels[0]?.params.tune).toBe(24);
    expect(project.channels[0]?.params).not.toHaveProperty("nonsense");
  });

  test("solo mutes the others, and soloing again unmutes everyone", () => {
    const project = fresh();
    const id = project.channels[1]?.id ?? "";
    toggleChannelSolo(project, id);
    expect(project.channels.map((channel) => channel.muted)).toEqual(
      project.channels.map((channel) => channel.id !== id),
    );
    toggleChannelSolo(project, id);
    expect(project.channels.every((channel) => !channel.muted)).toBe(true);
  });
});

describe("steps", () => {
  test("setStep lights and clears a step and is idempotent", () => {
    const project = fresh();
    const patternId = project.patterns[0]?.id ?? "";
    const snare = project.channels[3]?.id ?? "";
    setStep(project, patternId, snare, 4, true);
    setStep(project, patternId, snare, 4, true);
    expect(project.patterns[0]?.notes[snare]).toHaveLength(1);
    setStep(project, patternId, snare, 4, false);
    expect(project.patterns[0] && hasStep(project.patterns[0], snare, 4)).toBe(false);
  });
});

describe("playlist", () => {
  test("removing a track drops its clips, but the last track stays", () => {
    const project = fresh();
    const [first] = project.playlist.tracks;
    removePlaylistTrack(project, first?.id ?? "");
    expect(project.playlist.tracks).toHaveLength(7);
    expect(project.playlist.clips).toEqual([]);
    for (const track of [...project.playlist.tracks]) removePlaylistTrack(project, track.id);
    expect(project.playlist.tracks).toHaveLength(1);
  });
});

describe("patterns", () => {
  test("new patterns are numbered after the highest existing one", () => {
    const project = fresh();
    addPattern(project);
    expect(project.patterns.map((pattern) => pattern.name)).toEqual(["Pattern 1", "Pattern 2"]);
  });

  test("clones get fresh note ids", () => {
    const project = fresh();
    const source = project.patterns[0];
    const copyId = clonePattern(project, source?.id ?? "");
    const copy = project.patterns.find((pattern) => pattern.id === copyId);
    const sourceIds = Object.values(source?.notes ?? {})
      .flat()
      .map((note) => note.id);
    const copyIds = Object.values(copy?.notes ?? {})
      .flat()
      .map((note) => note.id);
    expect(copyIds).toHaveLength(sourceIds.length);
    expect(copyIds.some((id) => sourceIds.includes(id))).toBe(false);
  });

  test("the last pattern can't be removed; removing one drops its clips", () => {
    const project = fresh();
    const first = project.patterns[0]?.id ?? "";
    removePattern(project, first);
    expect(project.patterns).toHaveLength(1);
    addPattern(project);
    removePattern(project, first);
    expect(project.patterns).toHaveLength(1);
    expect(project.playlist.clips).toEqual([]);
  });
});
