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

const packageJson = JSON.parse(await readProjectFile("package.json"));
const indexHtml = await readProjectFile("index.html");
const appSource = await readProjectFile("src/app.js");
const rackSource = await readProjectFile("src/rack-shell.js");
const frameworkSource = await readProjectFile("src/module-framework.js");
const graphHostSource = await readProjectFile("src/audio-graph-host.js");
const netlifyConfig = await readProjectFile("netlify.toml");
const { isPathInsideRoot } = await import("./dev-server.mjs");
const { createAudioGraphHost } = await import("../src/audio-graph-host.js");
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
assert.match(indexHtml, /Placeholder rack shell/);
assert.match(indexHtml, /\.\/src\/app\.js/);
assert.match(indexHtml, /data-status-text/);

assert.match(appSource, /createModuleRegistry/);
assert.match(appSource, /createAudioGraphHost/);
assert.match(appSource, /data-hp-readout/);
assert.match(rackSource, /totalHp: 84/);
assert.match(rackSource, /powerRails/);
assert.match(rackSource, /ports/);
assert.match(frameworkSource, /canPatchPorts/);
assert.match(graphHostSource, /registerModule/);

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

assert.equal(isPathInsideRoot(path.join(projectRoot, "index.html")), true);
assert.equal(isPathInsideRoot(path.resolve(projectRoot, "..", "package.json")), false);
assert.equal(isPathInsideRoot(`${projectRoot}-shadow/secret.txt`), false);

await assertFileExists("dist/index.html");
await assertFileExists("dist/src/app.js");
await assertFileExists("dist/src/styles.css");
await assertFileExists("dist/src/module-framework.js");
await assertFileExists("dist/src/audio-graph-host.js");

console.log("Smoke test passed: module framework, audio graph host, rack scaffold, scripts, build, and Netlify config are present.");
