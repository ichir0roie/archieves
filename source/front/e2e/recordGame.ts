import { expect, type Page } from "@playwright/test";

const ROUTE_TIMEOUT = 15_000;

export interface RecordedGame {
  id: string;
  total: number;
}

/**
 * Records one full end through the score-only entry screen and finishes the
 * game, so the pages that read archieves-api back (score log, statistics,
 * ranking, match registration) have something of this user's to show.
 * Returns the finished game's id, read off the score-view URL.
 */
export async function recordGame(
  page: Page,
  { score = "10", arrows = 6 }: { score?: string; arrows?: number } = {},
): Promise<RecordedGame> {
  await page.goto("/game/setup");
  await page.getByLabel("1エンドの矢数").fill(String(arrows));
  await page.getByLabel("エンド数").fill("1");
  await page.getByLabel("ラウンド数").fill("1");
  await page.getByRole("button", { name: "点数だけ入力" }).click();
  await expect(page).toHaveURL(/\/game\/simple-score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });

  const sheetArrows = page.locator(".ScoreSheet .CurrentEnd .ArrowValue");
  const button = page
    .locator(".SimpleScoreInput")
    .getByRole("button", { name: score, exact: true });
  for (let i = 0; i < arrows; i++) {
    await button.click();
    await expect(sheetArrows).toHaveCount(i + 1);
  }

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  const id = new URL(page.url()).searchParams.get("gameId");
  expect(id).not.toBeNull();
  return { id: id as string, total: Number(score) * arrows };
}
