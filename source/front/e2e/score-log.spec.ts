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
  await expect(page.locator("header")).toContainText("スコア");

  const card = page.locator(`.ScoreLogGame[data-game-id="${game.id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("合計点");
  await expect(card).toContainText("エンド平均");
  await expect(card).toContainText("矢平均");
});

test("a score log card opens that game's score sheet", async ({ page }) => {
  const game = await recordGame(page);

  await page.goto("/score-log");
  const card = page.locator(`.ScoreLogGame[data-game-id="${game.id}"]`);
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(new RegExp(`gameId=${game.id}`));
  await expect(page.getByText("ラウンド 1", { exact: true })).toBeVisible();
});

test("スコアは月の見出しで閉じられ、開閉は再読み込みしても残る", async ({ page }) => {
  const game = await recordGame(page);

  await page.goto("/score-log");
  const card = page.locator(`.ScoreLogGame[data-game-id="${game.id}"]`);
  await expect(card).toBeVisible();

  await page.getByRole("button", { name: "全部閉じる" }).click();
  await expect(card).toBeHidden();

  await page.reload();
  await expect(page.locator(".LogGroup").first()).toBeVisible();
  await expect(page.locator(".ScoreLogGame")).toHaveCount(0);

  await page.getByRole("button", { name: "全部開く" }).click();
  await expect(card).toBeVisible();

  // 月の見出しだけを閉じる
  await page.locator(".LogGroup .log-head").first().click();
  await expect(card).toBeHidden();
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

test("the ranking shows an empty state when nobody matches the filters", async ({ page }) => {
  // 共有の db に誰の記録があるかに依らないよう、応答を空にして画面の出し分けだけを確かめる
  await page.route("**/statistics/ranking?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/ranking");

  await expect(page.getByText("該当するデータがありません")).toBeVisible();
});
