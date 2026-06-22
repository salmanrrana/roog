import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });

await cp(path.join(projectRoot, "index.html"), path.join(distDir, "index.html"));
await cp(path.join(projectRoot, "src"), path.join(distDir, "src"), {
  recursive: true
});

console.log(`Built ROOG static site at ${path.relative(projectRoot, distDir)}/`);
