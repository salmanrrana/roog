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

["src/app.js", "src/audio-graph-host.js", "src/module-framework.js", "src/rack-shell.js"].forEach(
  (sourceFile) => {
    execFileSync(process.execPath, ["--check", sourceFile], {
      cwd: projectRoot,
      stdio: "inherit"
    });
  }
);

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
assert.match(appSource, /bindModuleReordering/);
assert.match(appSource, /isOrderWithinRackCapacity/);
assert.match(rackSource, /totalHp: 84/);
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
}

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
  84,
  "Rack modules should fill the 84 HP row"
);

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

console.log("Smoke test passed: module framework, audio graph host, rack scaffold, scripts, build, and Netlify config are present.");
