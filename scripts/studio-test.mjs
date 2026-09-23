import assert from "node:assert/strict";
import { test } from "node:test";
import {
  euclid,
  quantizeSemitone,
  registerValue,
  scaleDegree,
  turingStep,
} from "../src/studio/music.js";
import {
  RACK,
  canPatch,
  decodePatch,
  encodePatch,
  layoutRows,
} from "../src/studio/patch.js";
import { fromNorm, toNorm } from "../src/studio/panel.js";
import { createTransport } from "../src/studio/transport.js";
import { catalog } from "../src/studio/modules/index.js";
import { presets } from "../src/studio/presets.js";

test("quantizer snaps to the scale and keeps octaves", () => {
  assert.equal(quantizeSemitone(6, "major"), 5);
  assert.equal(quantizeSemitone(13, "major"), 12);
  assert.equal(quantizeSemitone(-1, "major"), -1);
  assert.equal(quantizeSemitone(-2, "pent min"), -2);
  assert.equal(quantizeSemitone(4, "minor", 9), 4, "A minor contains E");
  assert.equal(scaleDegree(7, "major"), 12);
  assert.equal(scaleDegree(-1, "major"), -1);
});

test("euclid spreads hits evenly and rotates", () => {
  assert.deepEqual(euclid(8, 3), [1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(euclid(8, 3, 1), [0, 1, 0, 0, 1, 0, 0, 1]);
  assert.deepEqual(euclid(4, 0), [0, 0, 0, 0]);
  assert.equal(
    euclid(16, 5).reduce((sum, hit) => sum + hit, 0),
    5,
  );
});

test("turing register loops when locked and mutates when chaotic", () => {
  const start = [1, 0, 1, 1, 0, 0, 0, 0];
  let bits = start;

  for (let step = 0; step < 4; step += 1) {
    bits = turingStep(bits, 4, 0);
  }

  assert.deepEqual(
    bits.slice(0, 4),
    start.slice(0, 4),
    "a locked 4-step loop repeats every 4 clocks",
  );
  assert.equal(
    turingStep(start, 4, 1, () => 0)[0],
    0,
    "full chaos flips the recycled bit",
  );
  assert.equal(registerValue([1, 1, 1, 1, 1, 1, 1, 1]), 1);
});

test("transport schedules ticks ahead on the audio clock, with swing", () => {
  const clock = { currentTime: 10 };
  const ticks = [];
  const transport = createTransport(clock, {
    bpm: 120,
    swing: 0.5,
    timer: () => ({ start() {}, stop() {} }),
  });

  transport.onTick((tick, time, duration) =>
    ticks.push({ tick, time, duration }),
  );
  transport.start();

  const step = 60 / 120 / 4;

  assert.ok(ticks.length >= 1);
  assert.equal(ticks[0].duration, step);

  clock.currentTime = 10.5;
  transport.schedule();

  const first = ticks[0].time;

  assert.ok(
    Math.abs(ticks[2].time - (first + 2 * step)) < 1e-9,
    "even ticks stay on the grid",
  );
  assert.ok(
    Math.abs(ticks[1].time - (first + step * 1.25)) < 1e-9,
    "odd ticks swing late",
  );
  assert.ok(ticks.every(({ time }) => time <= clock.currentTime + 0.12 + step));

  transport.stop();
  const count = ticks.length;

  clock.currentTime = 20;
  transport.schedule();
  assert.equal(ticks.length, count, "a stopped transport schedules nothing");
});

test("tap tempo averages the gaps", () => {
  const transport = createTransport(
    { currentTime: 0 },
    { timer: () => ({ start() {}, stop() {} }) },
  );

  [0, 500, 1000, 1500].forEach((time) => transport.tap(time));
  assert.equal(transport.bpm, 120);

  transport.bpm = "fast";
  transport.swing = Number.NaN;
  assert.equal(transport.bpm, 120, "junk tempo is ignored");
  assert.equal(transport.swing, 0);
});

test("patch rules: gates to gates, voltages to voltages, outputs to inputs", () => {
  assert.equal(
    canPatch({ dir: "out", type: "audio" }, { dir: "in", type: "cv" }),
    true,
  );
  assert.equal(
    canPatch({ dir: "out", type: "cv" }, { dir: "in", type: "audio" }),
    true,
  );
  assert.equal(
    canPatch({ dir: "out", type: "gate" }, { dir: "in", type: "gate" }),
    true,
  );
  assert.equal(
    canPatch({ dir: "out", type: "gate" }, { dir: "in", type: "cv" }),
    false,
  );
  assert.equal(
    canPatch({ dir: "in", type: "audio" }, { dir: "in", type: "audio" }),
    false,
  );
});

test("modules flow into rows and a full rack refuses more", () => {
  const hp = { a: 60, b: 50, c: 30 };

  assert.deepEqual(
    layoutRows(["a", "b", "c"], (id) => hp[id], { rows: 2, rowHp: 100 }),
    [["a"], ["b", "c"]],
  );
  assert.equal(
    layoutRows(["a", "b", "a"], (id) => hp[id], { rows: 2, rowHp: 100 }),
    null,
  );
});

test("share links round-trip and reject junk", () => {
  const patch = presets[0].patch;

  assert.deepEqual(decodePatch(encodePatch(patch)), patch);
  assert.equal(decodePatch("not-a-patch"), null);
  assert.equal(
    decodePatch(encodePatch({ modules: [], cables: [null] })),
    null,
    "malformed cables are rejected",
  );
});

test("exponential knobs map back and forth", () => {
  const control = { min: 30, max: 16000, curve: "exp" };

  assert.ok(Math.abs(fromNorm(control, toNorm(control, 1200)) - 1200) < 0.01);
  assert.equal(fromNorm({ min: 1, max: 8, step: 1 }, 0.5), 5);
});

test("every module definition is well formed", () => {
  const types = new Set();

  catalog.forEach((def) => {
    assert.ok(!types.has(def.type), `duplicate module type ${def.type}`);
    types.add(def.type);
    assert.ok(
      Number.isInteger(def.hp) && def.hp <= RACK.rowHp,
      `${def.type} hp`,
    );
    assert.equal(
      new Set(def.ports.map((port) => port.id)).size,
      def.ports.length,
      `${def.type} port ids unique`,
    );
    assert.equal(typeof def.create, "function");

    def.controls.forEach((control) => {
      if (control.options) {
        assert.ok(
          control.options.includes(control.value),
          `${def.type}.${control.id} default is an option`,
        );
      } else {
        assert.ok(
          control.value >= control.min && control.value <= control.max,
          `${def.type}.${control.id} default in range`,
        );
      }
    });
  });
});

test("factory patches only use real modules, jacks and values, and fit the rack", () => {
  const defs = new Map(catalog.map((def) => [def.type, def]));

  presets.forEach(({ id, patch }) => {
    const modules = new Map(
      patch.modules.map((module) => [module.id, defs.get(module.type)]),
    );

    assert.equal(
      modules.size,
      patch.modules.length,
      `${id}: module ids unique`,
    );
    assert.ok(
      layoutRows(
        patch.modules.map((module) => module.id),
        (moduleId) => modules.get(moduleId).hp,
        RACK,
      ),
      `${id}: fits the rack`,
    );

    patch.modules.forEach((module) => {
      const def = modules.get(module.id);

      assert.ok(def, `${id}: unknown type ${module.type}`);
      Object.keys(module.values).forEach((controlId) => {
        assert.ok(
          def.controls.some((control) => control.id === controlId),
          `${id}: ${module.id} has no control ${controlId}`,
        );
      });
    });

    const inputs = new Set();

    patch.cables.forEach(([fromId, fromPort, toId, toPort]) => {
      const from = modules
        .get(fromId)
        ?.ports.find((port) => port.id === fromPort);
      const to = modules.get(toId)?.ports.find((port) => port.id === toPort);

      assert.ok(
        from && to,
        `${id}: ${fromId}.${fromPort} → ${toId}.${toPort} exists`,
      );
      assert.ok(
        canPatch(from, to),
        `${id}: ${fromId}.${fromPort} → ${toId}.${toPort} is patchable`,
      );
      assert.ok(
        !inputs.has(`${toId}.${toPort}`),
        `${id}: ${toId}.${toPort} has one cable`,
      );
      inputs.add(`${toId}.${toPort}`);
    });
  });
});
