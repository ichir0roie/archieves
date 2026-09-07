import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see CLAUDE.md's "Running alongside
// archieves-api"), since recording a score persists every point through it.
test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("records a full end of scores and views the result", async ({ page }) => {
  await page.goto("/game/setup");

  await page.getByRole("button", { name: "点数だけ入力" }).click();

  await expect(page).toHaveURL(/\/game\/simple-score-card$/, { timeout: 15_000 });

  const scoreButton = page.getByRole("button", { name: "10", exact: true });
  const endView = page.locator(".EndView > div > div");
  await expect(scoreButton).toBeVisible({ timeout: 15_000 });

  for (let i = 1; i <= 6; i++) {
    await scoreButton.click();
    await expect(endView).toHaveCount(i, { timeout: 10_000 });
  }

  await expect(scoreButton).toBeDisabled();

  await page.getByRole("button", { name: "終了" }).click();

  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: 15_000 });
  await expect(page.getByText("ラウンド：1")).toBeVisible();

  const row = page.locator("table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("10", { exact: true })).toHaveCount(6);
  await expect(row.getByText("60", { exact: true })).toHaveCount(2);
});

test("going back removes the last recorded point", async ({ page }) => {
  await page.goto("/game/setup");

  await page.getByRole("button", { name: "点数だけ入力" }).click();

  await expect(page).toHaveURL(/\/game\/simple-score-card$/, { timeout: 15_000 });

  const tenButton = page.getByRole("button", { name: "10", exact: true });
  const nineButton = page.getByRole("button", { name: "9", exact: true });
  const endView = page.locator(".EndView");
  await expect(tenButton).toBeVisible({ timeout: 15_000 });

  await tenButton.click();
  await expect(endView.getByText("10", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(endView.getByText("10", { exact: true })).toHaveCount(0);

  await nineButton.click();
  await expect(endView.getByText("9", { exact: true })).toBeVisible();
});
