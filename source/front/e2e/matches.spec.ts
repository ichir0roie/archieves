import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// Needs archieves-api running (see CLAUDE.md's "E2E tests"): a match is
// registered against a persisted game.

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("a match can be registered against a recorded game, then removed", async ({ page }) => {
  const name = `全日本選手権 ${Date.now()}`;
  await recordGame(page);

  await page.goto("/profile/matches");
  await expect(page.locator("header")).toContainText("大会情報の登録");

  await page.getByRole("button", { name: "大会情報を登録" }).first().click();
  await page.getByLabel("大会名").fill(name);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText(name)).toBeVisible();

  const row = page.locator(".MatchRow").filter({ hasText: name });
  await row.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("a match cannot be saved without a name", async ({ page }) => {
  await recordGame(page);

  await page.goto("/profile/matches");
  await page.getByRole("button", { name: "大会情報を登録" }).first().click();

  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();

  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
});
