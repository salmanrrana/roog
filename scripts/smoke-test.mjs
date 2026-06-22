import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readProjectFile(filePath) {
  return readFile(path.join(projectRoot, filePath), "utf8");
}

async function assertFileExists(filePath) {
  const fileStat = await stat(path.join(projectRoot, filePath));
  assert.equal(fileStat.isFile(), true, `${filePath} should be a file`);
}

execFileSync(process.execPath, ["scripts/build.mjs"], {
  cwd: projectRoot,
  stdio: "inherit"
});

[
  "src/app.js",
  "src/audio-graph-host.js",
  "src/module-framework.js",
  "src/rack-shell.js",
  "src/rack-engine.js",
  "src/studio-modules.js",
  "src/studio.js"
].forEach((sourceFile) => {
  execFileSync(process.execPath, ["--check", sourceFile], {
    cwd: projectRoot,
    stdio: "inherit"
  });
});

const packageJson = JSON.parse(await readProjectFile("package.json"));
const indexHtml = await readProjectFile("index.html");
const appSource = await readProjectFile("src/app.js");
const rackSource = await readProjectFile("src/rack-shell.js");
const frameworkSource = await readProjectFile("src/module-framework.js");
const graphHostSource = await readProjectFile("src/audio-graph-host.js");
const netlifyConfig = await readProjectFile("netlify.toml");
const { isPathInsideRoot } = await import("./dev-server.mjs");
const { createAudioGraphHost } = await import("../src/audio-graph-host.js");
const { placeholderModules } = await import("../src/rack-shell.js");
const {
  canPatchPorts,
  createModuleRegistry,
  portDirections,
  signalTypes
} = await import("../src/module-framework.js");

assert.equal(packageJson.type, "module");
assert.equal(packageJson.scripts.dev, "node scripts/dev-server.mjs");
assert.equal(packageJson.scripts.build, "node scripts/build.mjs");
assert.equal(packageJson.scripts.test, "node scripts/smoke-test.mjs");

assert.match(netlifyConfig, /command = "npm run build"/);
assert.match(netlifyConfig, /publish = "dist"/);

assert.match(indexHtml, /data-rack/);
assert.match(indexHtml, /data-rack-row/);
assert.match(indexHtml, /data-power-bus/);
assert.match(indexHtml, /Patchable rack shell/);
assert.match(indexHtml, /\.\/src\/app\.js/);
assert.match(indexHtml, /data-status-text/);

assert.match(appSource, /createModuleRegistry/);
assert.match(appSource, /createAudioGraphHost/);
assert.match(appSource, /data-hp-readout/);
assert.match(appSource, /renderPowerBus/);
assert.match(appSource, /layoutStorageKey/);
assert.match(appSource, /legacyModuleIds/);
assert.match(appSource, /bindModuleReordering/);
assert.match(appSource, /isOrderWithinRackCapacity/);
assert.match(appSource, /bindAudioInputControls/);
assert.match(rackSource, /totalHp: 112/);
assert.match(rackSource, /powerRails/);
assert.match(rackSource, /ports/);
assert.match(frameworkSource, /canPatchPorts/);
assert.match(graphHostSource, /registerModule/);
assert.match(graphHostSource, /connectPorts/);

const registry = createModuleRegistry();
const sourceModule = registry.register({
  id: "smoke-source",
  name: "Smoke Source",
  kind: "source",
  hp: 4,
  controls: [],
  ports: [{ label: "out", type: signalTypes.audio, direction: portDirections.output }]
});
const targetModule = registry.register({
  id: "smoke-target",
  name: "Smoke Target",
  kind: "processor",
  hp: 4,
  controls: [],
  ports: [{ label: "in", type: signalTypes.audio, direction: portDirections.input }]
});

assert.equal(registry.list().length, 2);
assert.equal(canPatchPorts(sourceModule.ports[0], targetModule.ports[0]), true);
assert.equal(canPatchPorts(targetModule.ports[0], sourceModule.ports[0]), false);

const graphHost = createAudioGraphHost({ AudioContextClass: class SmokeAudioContext {} });
graphHost.registerModule(sourceModule);
assert.equal(graphHost.registeredModuleCount, 1);

class SmokeAudioContext {
  constructor() {
    this.destination = { label: "destination" };
  }

  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0 },
      detune: { value: 0 },
      connect(target) {
        this.connectedTarget = target;
      },
      disconnect(target) {
        this.disconnectedTarget = target;
      },
      start() {
        this.started = true;
      }
    };
  }

  createGain() {
    return {
      gain: {
        value: 1,
        cancelScheduledValues(time) {
          this.cancelTime = time;
        },
        setValueAtTime(value, time) {
          this.value = value;
          this.setTime = time;
        },
        linearRampToValueAtTime(value, time) {
          this.value = value;
          this.rampTime = time;
        }
      },
      connect(target) {
        this.connectedTarget = target;
      },
      disconnect(target) {
        this.disconnectedTarget = target;
      }
    };
  }

  createConstantSource() {
    return {
      offset: { value: 0 },
      connect(target) {
        this.connectedTarget = target;
      },
      disconnect(target) {
        this.disconnectedTarget = target;
      },
      start() {
        this.started = true;
      }
    };
  }

  createBiquadFilter() {
    return {
      type: "highpass",
      frequency: { value: 0 },
      Q: { value: 0 },
      connect(target) {
        this.connectedTarget = target;
      },
      disconnect(target) {
        this.disconnectedTarget = target;
      }
    };
  }

  createMediaStreamSource(stream) {
    return {
      stream,
      connect(target) {
        this.connectedTarget = target;
      },
      disconnect(target) {
        this.disconnectedTarget = target;
      }
    };
  }
}

const audioInputDefinition = placeholderModules.find(
  (moduleDefinition) => moduleDefinition.id === "roog-audio-input"
);
assert.ok(audioInputDefinition, "Audio input module should be registered in the rack shell");
assert.deepEqual(
  audioInputDefinition.controls.map((control) => control.id),
  ["arm", "level"]
);
assert.deepEqual(
  audioInputDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [[signalTypes.audio, portDirections.output, "output"]]
);

const audioInputRegistry = createModuleRegistry();
const registeredAudioInput = audioInputRegistry.register(audioInputDefinition);
const audioInputGraphHost = createAudioGraphHost({ AudioContextClass: SmokeAudioContext });
const audioInputNodes = audioInputGraphHost.registerModule(registeredAudioInput).nodes;
const fakeTrack = { stopped: false, stop() { this.stopped = true; } };
const fakeStream = { getTracks: () => [fakeTrack] };
let requestedMicConstraints = null;

await audioInputNodes.activate({
  async getUserMedia(constraints) {
    requestedMicConstraints = constraints;
    return fakeStream;
  }
});
assert.deepEqual(requestedMicConstraints, { audio: true });
assert.equal(audioInputNodes.level.value, 0.85);
assert.equal(audioInputNodes.mediaStream, fakeStream);
audioInputNodes.stop();
assert.equal(fakeTrack.stopped, true);
assert.equal(audioInputNodes.mediaStream, null);

const vcoDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-vco");
assert.ok(vcoDefinition, "VCO module should be registered in the rack shell");
assert.deepEqual(
  vcoDefinition.controls.map((control) => control.id),
  ["frequency", "waveform", "detune"]
);
assert.equal(vcoDefinition.ports[0].type, signalTypes.cv);
assert.equal(vcoDefinition.ports[0].direction, portDirections.input);
assert.equal(vcoDefinition.ports[0].node, "pitch");
assert.equal(vcoDefinition.ports[1].type, signalTypes.audio);
assert.equal(vcoDefinition.ports[1].direction, portDirections.output);
assert.equal(vcoDefinition.ports[1].node, "output");

const vcoRegistry = createModuleRegistry();
const registeredVco = vcoRegistry.register(vcoDefinition);
const vcoGraphHost = createAudioGraphHost({ AudioContextClass: SmokeAudioContext });
const vcoRegistration = vcoGraphHost.registerModule(registeredVco);
assert.equal(vcoGraphHost.context, null, "VCO nodes should be lazy until patched or controlled");
const vcoNodes = vcoRegistration.nodes;
assert.equal(vcoNodes.oscillator.type, "sawtooth");
assert.equal(vcoNodes.oscillator.frequency.value, 220);
assert.equal(vcoNodes.oscillator.detune.value, 0);
assert.equal(vcoNodes.output.gain.value, 0.18);
assert.equal(vcoNodes.oscillator.connectedTarget, vcoNodes.output);
assert.equal(vcoNodes.oscillator.started, true);

const vcfDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-vcf");
assert.ok(vcfDefinition, "VCF module should be registered in the rack shell");
assert.deepEqual(
  vcfDefinition.controls.map((control) => control.id),
  ["cutoff", "resonance"]
);
assert.deepEqual(
  vcfDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.audio, portDirections.input, "input"],
    [signalTypes.audio, portDirections.output, "output"],
    [signalTypes.cv, portDirections.input, "cutoff"]
  ]
);

const vcaDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-vca");
assert.ok(vcaDefinition, "VCA module should be registered in the rack shell");
assert.deepEqual(
  vcaDefinition.controls.map((control) => control.id),
  ["level"]
);
assert.deepEqual(
  vcaDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.audio, portDirections.input, "input"],
    [signalTypes.audio, portDirections.output, "output"],
    [signalTypes.cv, portDirections.input, "amplitude"]
  ]
);
assert.equal(
  placeholderModules.reduce((usedHp, moduleDefinition) => usedHp + moduleDefinition.hp, 0),
  112,
  "Rack modules should fill the 112 HP row"
);

["roog-noise", "roog-drive", "roog-space", "roog-mix"].forEach((moduleId) => {
  const definition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === moduleId);
  assert.ok(definition, `${moduleId} module should be registered in the rack shell`);
  assert.ok(definition.controls.length > 0, `${moduleId} should expose controls`);
  assert.ok(definition.ports.length > 0, `${moduleId} should expose patch points`);
  assert.equal(typeof definition.createAudioNodes, "function", `${moduleId} should build audio nodes`);
});

const driveDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-drive");
assert.deepEqual(
  driveDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.audio, portDirections.input, "input"],
    [signalTypes.audio, portDirections.output, "output"],
    [signalTypes.cv, portDirections.input, "drive"]
  ]
);

const mixDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-mix");
assert.deepEqual(
  mixDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.audio, portDirections.input, "a"],
    [signalTypes.audio, portDirections.input, "b"],
    [signalTypes.audio, portDirections.output, "output"]
  ]
);

const { makeFuzzCurve } = await import("../src/rack-shell.js");
const fuzzCurve = makeFuzzCurve(40);
assert.equal(fuzzCurve.length, 1024);
assert.ok(fuzzCurve.every((sample) => sample >= -1 && sample <= 1), "Fuzz curve must stay within [-1, 1]");

const shapingRegistry = createModuleRegistry();
const registeredVcf = shapingRegistry.register(vcfDefinition);
const registeredVca = shapingRegistry.register(vcaDefinition);
const shapingGraphHost = createAudioGraphHost({ AudioContextClass: SmokeAudioContext });
const vcfNodes = shapingGraphHost.registerModule(registeredVcf).nodes;
const vcaNodes = shapingGraphHost.registerModule(registeredVca).nodes;
assert.equal(vcfNodes.input.type, "lowpass");
assert.equal(vcfNodes.cutoff.value, 1200);
assert.equal(vcfNodes.resonance.value, 1);
assert.equal(vcfNodes.input.connectedTarget, vcfNodes.output);
assert.equal(vcaNodes.input, vcaNodes.output);
assert.equal(vcaNodes.amplitude.value, 0.75);

const vcfAudioOut = vcfDefinition.ports.find((port) => port.direction === portDirections.output);
const vcaAudioIn = vcaDefinition.ports.find(
  (port) => port.type === signalTypes.audio && port.direction === portDirections.input
);
const vcaCvIn = vcaDefinition.ports.find((port) => port.type === signalTypes.cv);

const lfoDefinition = placeholderModules.find((moduleDefinition) => moduleDefinition.id === "roog-lfo");
assert.ok(lfoDefinition, "LFO module should be registered in the rack shell");
assert.deepEqual(
  lfoDefinition.controls.map((control) => control.id),
  ["rate", "waveform", "depth"]
);
assert.deepEqual(
  lfoDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [[signalTypes.cv, portDirections.output, "output"]]
);

const envelopeDefinition = placeholderModules.find(
  (moduleDefinition) => moduleDefinition.id === "roog-envelope"
);
assert.ok(envelopeDefinition, "Envelope module should be registered in the rack shell");
assert.deepEqual(
  envelopeDefinition.controls.map((control) => control.id),
  ["trigger", "attack", "decay", "sustain", "release"]
);
assert.deepEqual(
  envelopeDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.gate, portDirections.input, "gate"],
    [signalTypes.cv, portDirections.output, "output"]
  ]
);

const modulationRegistry = createModuleRegistry();
const registeredLfo = modulationRegistry.register(lfoDefinition);
const registeredEnvelope = modulationRegistry.register(envelopeDefinition);
const modulationGraphHost = createAudioGraphHost({ AudioContextClass: SmokeAudioContext });
const lfoNodes = modulationGraphHost.registerModule(registeredLfo).nodes;
const envelopeNodes = modulationGraphHost.registerModule(registeredEnvelope).nodes;
assert.equal(lfoNodes.oscillator.type, "sine");
assert.equal(lfoNodes.rate.value, 2);
assert.equal(lfoNodes.depth.value, 1);
assert.equal(lfoNodes.oscillator.connectedTarget, lfoNodes.output);
assert.equal(lfoNodes.oscillator.started, true);
assert.equal(envelopeNodes.source.offset.value, 1);
assert.equal(envelopeNodes.envelope.value, 0);
assert.equal(envelopeNodes.source.connectedTarget, envelopeNodes.output);
assert.equal(envelopeNodes.source.started, true);

const lfoCvOut = lfoDefinition.ports[0];
const envelopeGateIn = envelopeDefinition.ports[0];
const envelopeCvOut = envelopeDefinition.ports[1];
assert.equal(canPatchPorts(lfoCvOut, vcaCvIn), true);
assert.equal(canPatchPorts(envelopeCvOut, vcaCvIn), true);
assert.equal(canPatchPorts(lfoCvOut, envelopeGateIn), false);
assert.equal(canPatchPorts(vcfAudioOut, vcaAudioIn), true);
assert.equal(canPatchPorts(vcfAudioOut, vcaCvIn), false);

const patchConnectionId = shapingGraphHost.connectPorts(
  registeredVcf.id,
  vcfAudioOut,
  registeredVca.id,
  vcaAudioIn
);
assert.equal(vcfNodes.output.connectedTarget, vcaNodes.input);
assert.equal(shapingGraphHost.disconnect(patchConnectionId), true);
assert.equal(vcfNodes.output.disconnectedTarget, vcaNodes.input);

const outputDefinition = placeholderModules.find(
  (moduleDefinition) => moduleDefinition.id === "output-placeholder"
);
assert.ok(outputDefinition, "Output module should be registered in the rack shell");
assert.deepEqual(
  outputDefinition.ports.map((port) => [port.type, port.direction, port.node]),
  [
    [signalTypes.audio, portDirections.input, "left"],
    [signalTypes.audio, portDirections.input, "right"]
  ]
);

assert.equal(isPathInsideRoot(path.join(projectRoot, "index.html")), true);
assert.equal(isPathInsideRoot(path.resolve(projectRoot, "..", "package.json")), false);
assert.equal(isPathInsideRoot(`${projectRoot}-shadow/secret.txt`), false);

await assertFileExists("dist/index.html");
await assertFileExists("dist/src/app.js");
await assertFileExists("dist/src/styles.css");
await assertFileExists("dist/src/module-framework.js");
await assertFileExists("dist/src/audio-graph-host.js");

/* ---------- Studio (VCV-inspired) page ---------- */

const studioHtml = await readProjectFile("studio.html");
const studioModulesSource = await readProjectFile("src/studio-modules.js");
const engineSource = await readProjectFile("src/rack-engine.js");
const indexHtmlPage = indexHtml;

assert.match(studioHtml, /data-rack-row/);
assert.match(studioHtml, /data-patch-cable-layer/);
assert.match(studioHtml, /\.\/src\/studio\.js/);
assert.match(studioHtml, /href="\.\/index\.html"/, "Studio page should link back to the patch bay");
assert.match(indexHtmlPage, /href="\.\/studio\.html"/, "Patch bay should link to the studio page");
assert.match(engineSource, /export function createRackEngine/);
assert.match(studioModulesSource, /cableSag|studioPresets/);

const { createRackEngine } = await import("../src/rack-engine.js");
assert.equal(typeof createRackEngine, "function", "rack-engine should export createRackEngine");

const { studioModules, studioPresets, studioRackConfig } = await import("../src/studio-modules.js");

assert.equal(
  studioModules.reduce((usedHp, moduleDefinition) => usedHp + moduleDefinition.hp, 0),
  studioRackConfig.totalHp,
  "Studio modules should fill the studio rack capacity"
);

const studioRegistry = createModuleRegistry();
const registeredStudioModules = studioModules.map((moduleDefinition) => studioRegistry.register(moduleDefinition));
assert.equal(registeredStudioModules.length, studioModules.length, "All studio modules should register");

// Every preset connection must reference a real, patchable source/target port.
const studioById = new Map(registeredStudioModules.map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));

function findStudioPort(moduleId, label, direction) {
  return studioById
    .get(moduleId)
    ?.ports.find((port) => port.label.toLowerCase() === label.toLowerCase() && port.direction === direction);
}

studioPresets.forEach((preset) => {
  assert.ok(preset.connections.length > 0, `${preset.id} preset should define cables`);

  preset.connections.forEach(([srcModule, srcLabel, srcDir, tgtModule, tgtLabel, tgtDir]) => {
    const sourcePort = findStudioPort(srcModule, srcLabel, srcDir);
    const targetPort = findStudioPort(tgtModule, tgtLabel, tgtDir);

    assert.ok(sourcePort, `${preset.id}: missing source port ${srcModule}/${srcLabel}/${srcDir}`);
    assert.ok(targetPort, `${preset.id}: missing target port ${tgtModule}/${tgtLabel}/${tgtDir}`);
    assert.equal(
      canPatchPorts(sourcePort, targetPort),
      true,
      `${preset.id}: ${srcModule}.${srcLabel} -> ${tgtModule}.${tgtLabel} should be patchable`
    );
  });
});

const sequencerDefinition = studioModules.find((moduleDefinition) => moduleDefinition.id === "seq");
assert.ok(sequencerDefinition, "Studio should include the SEQ-8 sequencer");
assert.equal(typeof sequencerDefinition.bind, "function", "Sequencer should bind its RUN button");

const scopeDefinition = studioModules.find((moduleDefinition) => moduleDefinition.id === "scope");
assert.equal(scopeDefinition.controls[0].type, "scope", "Scope module should render a scope display");

await assertFileExists("dist/studio.html");
await assertFileExists("dist/src/studio.js");
await assertFileExists("dist/src/rack-engine.js");
await assertFileExists("dist/src/studio-modules.js");
await assertFileExists("dist/src/studio.css");

console.log("Smoke test passed: module framework, audio graph host, both racks, the studio engine, scripts, build, and Netlify config are present.");
