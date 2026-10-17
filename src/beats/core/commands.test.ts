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
  uniqueName,
  updateChannel,
} from "./commands";
import { createProject } from "./defaults";
import type { Project } from "./schema";

const fresh = (): Project => structuredClone(createProject());

test("uniqueName adds or bumps a trailing number", () => {
  expect(uniqueName("Snare", ["Kick"])).toBe("Snare");
  expect(uniqueName("Snare", ["Snare"])).toBe("Snare 2");
  expect(uniqueName("Snare", ["Snare", "Snare 2"])).toBe("Snare 3");
  expect(uniqueName("Snare 2", ["Snare", "Snare 2"])).toBe("Snare 3");
});

describe("channels", () => {
  test("a second Snare is 'Snare 2' in an unused color, on an insert of that name", () => {
    const project = fresh();
    const snare = project.channels.find((channel) => channel.name === "Snare");
    const id = addChannel(project, { name: "Snare", sampleId: "factory:snare" });
    const channel = project.channels.find((item) => item.id === id);
    expect(channel?.name).toBe("Snare 2");
    expect(project.channels.filter((item) => item.color === channel?.color)).toHaveLength(1);
    expect(channel?.color).not.toBe(snare?.color);
    const insert = project.mixer.inserts.find((track) => track.id === channel?.mixerTrackId);
    expect(insert?.name).toBe("Snare 2");
  });

  test("renaming a channel renames its own insert, not a shared or custom-named one", () => {
    const project = fresh();
    const [kick, clap, hat] = project.channels;
    if (!kick || !clap || !hat) throw new Error("starter kit changed");
    const insertName = (channelId: string) =>
      project.mixer.inserts.find(
        (track) => track.id === project.channels.find((c) => c.id === channelId)?.mixerTrackId,
      )?.name;

    updateChannel(project, kick.id, { name: "Big Kick" });
    expect(insertName(kick.id)).toBe("Big Kick");

    // Clap now shares Hat's insert: renaming Hat leaves it alone.
    updateChannel(project, clap.id, { mixerTrackId: hat.mixerTrackId });
    updateChannel(project, hat.id, { name: "Shaker" });
    expect(insertName(hat.id)).toBe("Hat");

    // A custom-named insert keeps its name.
    const custom = project.mixer.inserts.find((track) => track.id === kick.mixerTrackId);
    if (custom) custom.name = "Drums bus";
    updateChannel(project, kick.id, { name: "Kick" });
    expect(insertName(kick.id)).toBe("Drums bus");
  });

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

  test("solo marks one channel, leaves mutes alone, and soloing again clears it", () => {
    const project = fresh();
    const [first, second] = project.channels;
    if (!first || !second) throw new Error("fresh project needs two channels");
    first.muted = true;
    toggleChannelSolo(project, second.id);
    expect(project.channels.filter((channel) => channel.solo)).toEqual([second]);
    expect(first.muted).toBe(true);
    toggleChannelSolo(project, second.id);
    expect(project.channels.some((channel) => channel.solo)).toBe(false);
    expect(first.muted).toBe(true);
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
  test("new and cloned patterns get the next free name and an unused color", () => {
    const project = fresh();
    addPattern(project);
    const first = project.patterns[0]?.id ?? "";
    clonePattern(project, first);
    expect(project.patterns.map((pattern) => pattern.name)).toEqual([
      "Pattern 1",
      "Pattern 3",
      "Pattern 2",
    ]);
    expect(new Set(project.patterns.map((pattern) => pattern.color)).size).toBe(3);
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
