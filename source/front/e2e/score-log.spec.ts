import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E"): every page
// here reads the recorded game back through it.

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("the score log lists a game that was just recorded", async ({ page }) => {
  const game = await recordGame(page);

  await page.goto("/score-log");
  await expect(page.locator("header")).toContainText("スコアログ");

  const card = page.locator(".ScoreLogGame", { hasText: `Game ID` }).filter({
    has: page.getByText(game.id, { exact: true }),
  });
  await expect(card.first()).toBeVisible();
});

test("a score log card opens that game's score sheet", async ({ page }) => {
  const game = await recordGame(page);

  await page.goto("/score-log");
  const card = page
    .locator(".ScoreLogGame")
    .filter({ has: page.getByText(game.id, { exact: true }) })
    .first();
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(new RegExp(`gameId=${game.id}`));
  await expect(page.getByText("ラウンド：1")).toBeVisible();
});

test("the statistics dashboard summarises the recorded scores", async ({ page }) => {
  await recordGame(page);

  await page.goto("/analysis");
  await expect(page.locator("header")).toContainText("統計ダッシュボード");

  await expect(page.getByText("読み込み中...")).toHaveCount(0);
  for (const card of ["ラウンド合計点", "エンド合計点", "矢1本あたり"]) {
    await expect(page.getByText(card, { exact: true })).toBeVisible();
  }
});

test("the ranking shows an empty state for a period with no games", async ({ page }) => {
  await page.goto("/ranking");
  await page.getByLabel("開始月").fill("1990/01");
  await page.getByLabel("終了月").fill("1990/02");
  await page.getByRole("button", { name: "適用" }).click();

  await expect(page.getByText("該当するデータがありません")).toBeVisible();
});
