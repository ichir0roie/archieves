import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// API が要る(.claude/docs/testing.md の「E2E」)。モックのログインは常に本人なので、
// 本人のゲームは公開範囲に依らず公開ページに出る

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("公開ページに、指定したゲームの合計・距離などのゲームの情報・点数表・ラウンドの的中の図を出し、メニューは出さない", async ({ page }) => {
  const game = await recordGame(page, { score: "9", bowType: "コンパウンド" });

  await page.goto(`/score-share?ids=${game.id}`);

  await expect(page.locator("header h1")).toHaveText("公開スコア");
  const card = page.locator(`.SharedGame[data-game-id="${game.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator(".GameSummary")).toContainText(String(game.total));
  const details = card.locator(".GameSummary .GameDetails");
  await expect(details).toContainText("距離");
  await expect(details).toContainText("的の大きさ");
  await expect(details).toContainText("弓の種類コンパウンド");
  await expect(card.getByText("ラウンド 1", { exact: true })).toBeVisible();
  await expect(card.locator(".RoundScoreSheet .ArrowMap")).toBeVisible();
  await expect(page.getByRole("button", { name: "メニュー" })).toHaveCount(0);
});

test("公開ページは、ids が無ければそう知らせる", async ({ page }) => {
  await page.goto("/score-share");

  await expect(page.getByText("表示するスコアが指定されていません。")).toBeVisible();
});
