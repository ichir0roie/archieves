import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// API が要る(.claude/docs/testing.md の「E2E」)。モックのログインは常に本人なので、
// 本人のスコア・日記は公開範囲に依らずプロフィールに出る

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("本人のプロフィールに、直近の日記と、直近のゲームをまとめた公開ページへのボタンを出す", async ({ page }) => {
  const game = await recordGame(page);
  // spec は一つの db に並べて走るので、このテストが書いたものを一意の文で探す
  const body = `プロフィールの E2E の日記 ${Date.now()}`;
  await page.goto("/diary");
  await page.getByLabel("本文").fill(body);
  await page.getByRole("button", { name: "書く", exact: true }).click();
  await expect(page.locator(".DiaryCell", { hasText: body })).toBeVisible();

  await page.goto("/profile/me");
  await expect(page.locator(".ProfileRecentDiaries .DiaryCell", { hasText: body })).toBeVisible();

  await page.locator(".ProfileRecentScores").getByRole("button", { name: /スコアを見る$/ }).click();
  await expect(page).toHaveURL(/\/score-share\?ids=/);
  await expect(page.locator(`.SharedGame[data-game-id="${game.id}"]`)).toBeVisible();
});
