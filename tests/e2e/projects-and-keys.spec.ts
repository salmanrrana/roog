import { expect, openBeats, projectMenu, test, waitForSaved } from "./helpers";

test("name, keep and switch projects with the keyboard", async ({ page }) => {
  const title = page.getByRole("button", { name: "Rename project" });
  const tempo = page.getByRole("textbox", { name: "Tempo (BPM)" });
  const dialog = page.getByRole("dialog", { name: "Projects" });

  await openBeats(page);

  await test.step("rename the project to Night Drive", async () => {
    await title.click();
    await page.getByRole("textbox", { name: "Project name" }).fill("Night Drive");
    await page.keyboard.press("Enter");
    await expect(title).toContainText("Night Drive");
    await waitForSaved(page);
  });

  await test.step("tempo ignores a blank entry and clamps a huge one", async () => {
    await tempo.fill("");
    await page.getByRole("region", { name: "Channel rack" }).click({ position: { x: 5, y: 5 } });
    await expect(tempo).toHaveValue("128");
    await tempo.fill("999");
    await tempo.press("Enter");
    await expect(tempo).toHaveValue("300");
  });

  await test.step("Space plays even with the pattern select focused", async () => {
    const select = page.getByRole("combobox", { name: "Pattern" });
    await select.focus();
    await select.selectOption("Pattern 1");
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  await test.step("Space does nothing behind the projects dialog", async () => {
    await projectMenu(page, "Open / manage…");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  await test.step("start a new project, then switch back to Night Drive", async () => {
    await projectMenu(page, "New project");
    await expect(title).toContainText("Untitled beat");
    await projectMenu(page, "Open / manage…");
    await dialog.getByRole("button", { name: "Open Night Drive" }).click();
    await expect(title).toContainText("Night Drive");
    await expect(dialog).toBeHidden();
  });

  await test.step("reload: Night Drive is still open", async () => {
    await page.reload();
    await expect(title).toContainText("Night Drive");
  });
});
