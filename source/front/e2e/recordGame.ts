import { expect, type Page } from "@playwright/test";
import { shoot, startGame } from "./scoreEntry";

const ROUTE_TIMEOUT = 15_000;

export interface RecordedGame {
  id: string;
  total: number;
}

/**
 * 1 エンドぶんを的のタッチで記録して終了し、archieves-api を読む画面
 * (スコア一覧・統計・ランキング)にこの利用者の記録を一つ作る。
 * 終わったゲームの id を score-view の URL から読んで返す。
 */
export async function recordGame(
  page: Page,
  {
    score = "10",
    arrows = 6,
    bowType,
  }: { score?: string; arrows?: number; bowType?: string } = {},
): Promise<RecordedGame> {
  await startGame(page, {
    bowType,
    endSize: arrows,
    roundSize: 1,
    gameSize: 1,
  });
  await shoot(page, score, arrows);

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  const id = new URL(page.url()).searchParams.get("gameId");
  expect(id).not.toBeNull();
  return { id: id as string, total: Number(score) * arrows };
}
