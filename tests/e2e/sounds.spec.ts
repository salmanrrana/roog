import { expect, openBeats, makeWav, test } from "./helpers";

test("bring in sounds: drag, replace with undo, import a sample", async ({ page }) => {
  const rack = page.getByRole("region", { name: "Channel rack" });
  const browser = page.getByRole("complementary", { name: "Browser" });
  const sound = (name: string) => browser.getByRole("button", { name, exact: true });
  const channel = (name: string) => rack.getByRole("button", { name, exact: true });
  const wav = { name: "blip.wav", mimeType: "audio/wav", buffer: makeWav() };
  const toasts = page.getByRole("status").filter({ hasNotText: /^(Saved|Saving…|Not saved)$/ });

  // The header has its own Undo, so look for the one inside a toast.
  const toastUndo = toasts.getByRole("button", { name: "Undo" });

  await openBeats(page);

  await test.step("drag Snare onto Add channel to get a second snare", async () => {
    await sound("Snare").dragTo(rack.getByRole("button", { name: /Add channel/ }));
    await expect(channel("Snare 2")).toBeVisible();
  });

  await test.step("drop Rim on Kick to replace it", async () => {
    await sound("Rim").dragTo(channel("Kick"));
    await expect(toastUndo).toBeVisible();
    await expect(channel("Rim")).toBeVisible();
    await expect(channel("Kick")).toHaveCount(0);
  });

  await test.step("undo brings Kick back", async () => {
    await toastUndo.click();
    await expect(channel("Kick")).toBeVisible();
  });

  await test.step("import a WAV, then import it again", async () => {
    const input = page.locator('input[type=file][accept="audio/*"]');
    await input.setInputFiles(wav);
    await expect(toasts.filter({ hasText: "Imported 1 sample" })).toBeVisible();
    await expect(sound("blip")).toBeVisible();
    await input.setInputFiles(wav);
    await expect(toasts.filter({ hasText: "already in My samples" })).toBeVisible();
    await expect(sound("blip")).toHaveCount(1);
  });
});
