import { describe, expect, it } from "vitest";
import { createProject } from "@/core/defaults";
import { decodeProjectFile, encodeProjectFile, userSampleIds } from "./file-format";

const sampleId = `user:${"ab".repeat(32)}`;

describe("project files", () => {
  it("round-trips a project and its samples byte for byte", async () => {
    const project = createProject("My beat", 1000);
    const bytes = Uint8Array.from({ length: 70_000 }, (_, index) => (index * 7) % 256);
    const text = await encodeProjectFile(project, [
      { id: sampleId, name: "Vox", blob: new Blob([bytes], { type: "audio/wav" }) },
    ]);

    const decoded = decodeProjectFile(text);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.project).toEqual(project);
    expect(decoded.samples).toHaveLength(1);
    const [sample] = decoded.samples;
    expect(sample?.name).toBe("Vox");
    expect(sample?.blob.type).toBe("audio/wav");
    expect(new Uint8Array((await sample?.blob.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);
  });

  it.each([
    ["not JSON", "{oops"],
    ["another JSON file", JSON.stringify({ hello: "world" })],
    [
      "a newer file format",
      JSON.stringify({ format: "roog-beats", formatVersion: 2, project: {}, samples: [] }),
    ],
    [
      "a sample id that isn't a user sample",
      JSON.stringify({
        format: "roog-beats",
        formatVersion: 1,
        project: createProject(),
        samples: [{ id: "factory:kick", name: "k", type: "", data: "" }],
      }),
    ],
    [
      "a broken project",
      JSON.stringify({
        format: "roog-beats",
        formatVersion: 1,
        project: { version: 1 },
        samples: [],
      }),
    ],
    [
      "damaged base64",
      JSON.stringify({
        format: "roog-beats",
        formatVersion: 1,
        project: createProject(),
        samples: [{ id: sampleId, name: "x", type: "", data: "!!!" }],
      }),
    ],
  ])("rejects %s", (_, text) => {
    expect(decodeProjectFile(text).ok).toBe(false);
  });

  it("lists each user sample a project plays once", () => {
    const project = createProject();
    const [first, second] = project.channels;
    if (!first || !second) throw new Error("starter kit changed");
    first.sampleId = sampleId;
    second.sampleId = sampleId;
    expect(userSampleIds(project)).toEqual([sampleId]);
  });
});
