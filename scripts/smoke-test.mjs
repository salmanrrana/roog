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
const netlifyConfig = await readProjectFile("netlify.toml");

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

assert.match(appSource, /placeholderModules/);
assert.match(appSource, /data-hp-readout/);
assert.match(rackSource, /totalHp: 84/);
assert.match(rackSource, /powerRails/);

await assertFileExists("dist/index.html");
await assertFileExists("dist/src/app.js");
await assertFileExists("dist/src/styles.css");

console.log("Smoke test passed: static rack scaffold, scripts, build, and Netlify config are present.");
