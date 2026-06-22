import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });

const rootEntries = await readdir(projectRoot, { withFileTypes: true });
const htmlPages = rootEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name);

await Promise.all(
  htmlPages.map((page) => cp(path.join(projectRoot, page), path.join(distDir, page)))
);

await cp(path.join(projectRoot, "src"), path.join(distDir, "src"), {
  recursive: true
});

console.log(`Built ROOG static site at ${path.relative(projectRoot, distDir)}/ (${htmlPages.join(", ")})`);
