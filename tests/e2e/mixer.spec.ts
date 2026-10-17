import { expect, openBeats, test, waitForSaved } from "./helpers";

test("shape a channel in the mixer", async ({ page }) => {
  const strip = page.getByRole("group", { name: "Kick strip" });
  const effects = page.getByRole("complementary", { name: "Effects" });
  const highType = effects
    .getByRole("radiogroup", { name: "Type" })
    .getByRole("radio", { name: "High" });
  const muteKick = strip.getByRole("button", { name: "Mute Kick" });

  await openBeats(page);

  await test.step("open the mixer and add a filter to Kick", async () => {
    await page.keyboard.press("F9");
    await strip.click();
    await effects.getByRole("button", { name: "Add effect" }).click();
    await page.getByRole("menuitem", { name: "Filter" }).click();
  });

  await test.step("make it a high-pass and pull the cutoff down", async () => {
    await highType.click();
    await expect(highType).toBeChecked();
    const cutoff = effects.getByRole("slider", { name: "Cutoff" });
    const before = await cutoff.getAttribute("aria-valuetext");
    await cutoff.focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowDown");
    await expect(cutoff).not.toHaveAttribute("aria-valuetext", before ?? "");
  });

  await test.step("mute Kick, solo Clap, then clear the solo", async () => {
    await muteKick.click();
    await expect(muteKick).toHaveAttribute("aria-pressed", "true");
    const soloClap = page
      .getByRole("group", { name: "Clap strip" })
      .getByRole("button", { name: "Solo Clap" });
    await soloClap.click();
    await expect(soloClap).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Clear solo" }).click();
    // Solo is separate from mute: clearing it leaves Kick's own mute alone.
    await expect(soloClap).toHaveAttribute("aria-pressed", "false");
    await expect(muteKick).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("reload: the high-pass filter is still on Kick", async () => {
    await waitForSaved(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Rename project" })).toBeVisible();
    await page.keyboard.press("F9");
    await strip.click();
    await expect(effects.getByRole("button", { name: "Filter", exact: true })).toBeVisible();
    await expect(highType).toBeChecked();
  });
});
