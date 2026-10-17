import { canvasSignature, cell, expect, newProject, test, waitForSaved } from "./helpers";

test("paint a beat, hear it, and find it after a reload", async ({ page }) => {
  const rack = page.getByRole("region", { name: "Channel rack" });
  const toolbarNotes = (count: number) => expect(page.getByText(`${count} notes`)).toBeVisible();

  await test.step("start a new project", async () => {
    await newProject(page);
    await expect(page.getByRole("button", { name: "Rename project" })).toContainText(
      "Untitled beat 2",
    );
  });

  await test.step("click four kicks and paint-drag eight hats", async () => {
    for (const step of [0, 4, 8, 12]) {
      const point = await cell(page, 0, step);
      await page.mouse.click(point.x, point.y);
    }
    const hatRow = await rack
      .getByRole("button", { name: "Hat", exact: true })
      .evaluate((el) =>
        [...document.querySelectorAll("[data-channel-row]")].findIndex((row) => row.contains(el)),
      );
    const from = await cell(page, hatRow, 0);
    const to = await cell(page, hatRow, 7);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  });

  await test.step("play it and watch the master meter move", async () => {
    const meter = page.getByTitle("Master level");
    const before = await canvasSignature(meter);
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect.poll(() => canvasSignature(meter), { timeout: 2000 }).not.toBe(before);
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  await test.step("undo the hat stroke in one step, then redo it", async () => {
    await page.keyboard.press("Control+z");
    await page.keyboard.press("F7");
    await page.getByRole("combobox", { name: "Channel" }).selectOption("Hat");
    await toolbarNotes(0);
    await page.keyboard.press("Control+Shift+z");
    await toolbarNotes(8);
  });

  await test.step("reload and find every note", async () => {
    await waitForSaved(page);
    await page.reload();
    await rack.getByRole("button", { name: "Kick", exact: true }).click();
    await page.keyboard.press("F7");
    await toolbarNotes(4);
    await page.getByRole("combobox", { name: "Channel" }).selectOption("Hat");
    await toolbarNotes(8);
  });
});
