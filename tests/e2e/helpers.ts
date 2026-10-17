import { test as base, expect, type Locator, type Page } from "@playwright/test";

// Each test gets a fresh browser context, so it also starts with a fresh IndexedDB.

/** `test` that fails when the page logs a console error or throws. */
export const test = base.extend<{ failOnErrors: void }>({
  failOnErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors, "console or page errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Remove the native save picker so exports fall back to a download (a picker hangs headless). */
export async function forceDownloads(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Window.prototype, "showSaveFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
}

/** Center of a canvas cell, using the geometry the canvas publishes as data-* attributes. */
async function canvasPoint(canvas: Locator, widthAttr: string, column: number, row: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas is not visible");
  const read = async (name: string) => Number(await canvas.getAttribute(name));
  const width = await read(widthAttr);
  const rowHeight = await read("data-row-height");
  const ruler = await read("data-ruler-height");
  return {
    x: box.x + (column + 0.5) * width,
    y: box.y + ruler + (row + 0.5) * rowHeight,
  };
}

/** Page point of a step cell in the channel rack (row and step are 0-based). */
export function cell(page: Page, row: number, step: number) {
  return canvasPoint(page.getByLabel("Step sequencer"), "data-cell-width", step, row);
}

/** Page point of a bar on a playlist track (both 0-based). */
export function clipPoint(page: Page, track: number, bar: number) {
  return canvasPoint(page.getByLabel("Playlist timeline"), "data-bar-width", bar, track);
}

/** Snapshot of a canvas's pixels, to tell when a meter has moved. */
export function canvasSignature(canvas: Locator) {
  return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

/** A short 16-bit mono PCM sine WAV, for sample imports. */
export function makeWav(seconds = 0.2) {
  const rate = 22050;
  const frames = Math.round(rate * seconds);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  }
  return buffer;
}

/** Wait until autosave reports the project is stored. */
export async function waitForSaved(page: Page) {
  await expect(page.getByRole("status", { name: "Save status" })).toHaveText("Saved");
}

/** Open the project menu and pick an item. */
export async function projectMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Open Beats and wait until the saved project has loaded. */
export async function openBeats(page: Page) {
  await page.goto("/beats.html");
  await expect(page.getByRole("button", { name: "Rename project" })).toBeVisible();
}

/** Open Beats and start a blank project. */
export async function newProject(page: Page) {
  await openBeats(page);
  await projectMenu(page, "New project");
}
