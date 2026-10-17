import { readFile } from "node:fs/promises";
import {
  canvasSignature,
  cell,
  clipPoint,
  expect,
  forceDownloads,
  newProject,
  projectMenu,
  test,
} from "./helpers";

test("arrange two patterns into a song and export a WAV", async ({ page }) => {
  const patterns = page.getByRole("button", { name: /^Pattern \d$/ });
  const clickAt = async (point: { x: number; y: number }) => page.mouse.click(point.x, point.y);

  await test.step("start a project and put a kick in Pattern 1", async () => {
    await forceDownloads(page);
    await newProject(page);
    await clickAt(await cell(page, 0, 0));
  });

  await test.step("add Pattern 2 and give it a hat", async () => {
    await page.getByRole("button", { name: "Add pattern" }).click();
    await expect(page.getByRole("combobox", { name: "Pattern" })).toHaveValue(/.+/);
    await expect(
      page.getByRole("combobox", { name: "Pattern" }).locator("option:checked"),
    ).toHaveText("Pattern 2");
    await clickAt(await cell(page, 2, 0));
  });

  await test.step("place both patterns in the playlist", async () => {
    await patterns.filter({ hasText: "Pattern 1" }).click();
    await clickAt(await clipPoint(page, 0, 0));
    await patterns.filter({ hasText: "Pattern 2" }).click();
    await clickAt(await clipPoint(page, 1, 1));
  });

  await test.step("play the song: the playhead and the master meter move", async () => {
    await page.getByRole("radio", { name: "Song" }).check();
    const meter = page.getByTitle("Master level");
    const before = await canvasSignature(meter);
    await page.keyboard.press("Space");
    await expect(page.getByTitle("Position (bar.beat)")).not.toHaveText("1.1");
    await expect.poll(() => canvasSignature(meter), { timeout: 2000 }).not.toBe(before);
    await page.keyboard.press("Space");
  });

  await test.step("delete Pattern 2, then undo from the toast", async () => {
    await patterns.filter({ hasText: "Pattern 2" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete (1 clip)" }).click();
    await expect(patterns.filter({ hasText: "Pattern 2" })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).last().click();
    await expect(patterns.filter({ hasText: "Pattern 2" })).toHaveCount(1);
  });

  await test.step("export the whole song as a WAV", async () => {
    const download = page.waitForEvent("download");
    await projectMenu(page, "Export WAV: whole song");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.wav$/);
    const bytes = await readFile(await file.path());
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
