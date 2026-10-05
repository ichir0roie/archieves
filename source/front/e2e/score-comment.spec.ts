import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E"), since every
// comment is persisted through it.

const ROUTE_TIMEOUT = 15_000;

async function startGame(page: Page) {
  await page.goto("/game/setup");
  await page.getByLabel("1エンドの矢数").fill("3");
  await page.getByLabel("エンド数").fill("2");
  await page.getByLabel("ラウンド数").fill("1");
  await page.getByRole("button", { name: "点数だけ入力" }).click();
  await expect(page).toHaveURL(/\/game\/simple-score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
}

function sheetArrows(page: Page) {
  return page.locator(".ScoreSheet .CurrentEnd .ArrowValue");
}

async function shoot(page: Page, label: string, times: number) {
  const button = page
    .locator(".SimpleScoreInput")
    .getByRole("button", { name: label, exact: true });
  for (let i = 0; i < times; i++) {
    const before = await sheetArrows(page).count();
    await button.click();
    await expect(sheetArrows(page)).toHaveCount(before + 1, { timeout: 10_000 });
  }
}

/** Opens a comment's modal from its icon, writes the text and saves. */
async function writeComment(page: Page, title: string, body: string) {
  await page.getByRole("button", { name: `${title}のコメントを入力` }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("コメント").fill(body);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("comments written while recording are kept on the end, round and game", async ({
  page,
}) => {
  await startGame(page);
  await shoot(page, "10", 3);

  const commentBar = page.locator(".CommentBar");
  await writeComment(page, "END 1", "押し手が流れた");
  await expect(commentBar).toContainText("押し手が流れた");

  await writeComment(page, "ラウンド 1", "向かい風");
  await expect(commentBar).toContainText("向かい風");

  await writeComment(page, "ゲーム", "調子は上向き");
  await expect(commentBar).toContainText("調子は上向き");

  // The modal comes back preloaded with what is already stored, and saving
  // updates that same comment instead of adding a second one.
  await page.getByRole("button", { name: "END 1のコメントを入力" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("コメント")).toHaveValue("押し手が流れた");
  await dialog.getByLabel("コメント").fill("押し手を修正");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();
  await expect(commentBar).toContainText("押し手を修正");
  await expect(commentBar).not.toContainText("押し手が流れた");

  // A reload reads the stored comments back onto the screen.
  await page.reload();
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".CommentBar")).toContainText("向かい風");
  await expect(page.locator(".CommentBar")).toContainText("調子は上向き");
});

test("the score view shows each end's comment and can edit it", async ({ page }) => {
  await startGame(page);
  await shoot(page, "9", 3);
  await writeComment(page, "END 1", "最初のエンド");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  // On a wide screen the note sits at the right-hand end of its own row.
  const row = page.locator("table tbody tr").first();
  await expect(row.locator(".CommentField .CommentText")).toHaveText("最初のエンド");

  await writeComment(page, "ゲーム", "全体の振り返り");
  await expect(page.locator(".GameComment")).toContainText("全体の振り返り");

  await writeComment(page, "ラウンド 1", "距離は70m");
  await expect(page.locator(".RoundComment")).toContainText("距離は70m");

  await page.reload();
  await expect(page.locator(".GameComment")).toContainText("全体の振り返り", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(page.locator(".RoundComment")).toContainText("距離は70m");
  await expect(
    page.locator("table tbody tr").first().locator(".CommentField .CommentText")
  ).toHaveText("最初のエンド");
});

test("clearing a comment removes it", async ({ page }) => {
  await startGame(page);
  await shoot(page, "8", 3);

  await writeComment(page, "END 1", "消す予定");
  await expect(page.locator(".CommentBar")).toContainText("消す予定");

  await writeComment(page, "END 1", "");
  await expect(page.locator(".CommentBar")).not.toContainText("消す予定");

  await page.reload();
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".CommentBar")).not.toContainText("消す予定");
});

test("a comment keeps a game that holds no arrow at all", async ({ page }) => {
  await startGame(page);

  await writeComment(page, "ゲーム", "矢はまだ引いていない");
  await expect(page.locator(".CommentBar")).toContainText("矢はまだ引いていない");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".GameComment")).toContainText("矢はまだ引いていない");
});
