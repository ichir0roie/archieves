import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { reloadAfterWrites, shoot, startGame as startCommentGame } from "./scoreEntry";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E"), since every
// comment is persisted through it.

const ROUTE_TIMEOUT = 15_000;

async function startGame(page: Page) {
  await startCommentGame(page, { endSize: 3, roundSize: 2, gameSize: 1 });
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

test("comments written while recording are kept on the end and round", async ({
  page,
}) => {
  await startGame(page);
  const commentBar = page.locator(".CommentBar");

  // 入力の画面にあるのはエンドのコメントだけ。ラウンドは埋まったとき、ゲームはスコア表示で書く
  await shoot(page, "10", 3);
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/2");
  await expect(page.getByRole("button", { name: "ラウンド 1のコメントを入力" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ゲームのコメントを入力" })).toHaveCount(0);

  await writeComment(page, "エンド 2", "押し手が流れた");
  await expect(commentBar).toContainText("押し手が流れた");

  await shoot(page, "10", 3);
  await writeComment(page, "ラウンド 1", "向かい風");
  await expect(commentBar).toContainText("向かい風");

  // The modal comes back preloaded with what is already stored, and saving
  // updates that same comment instead of adding a second one.
  await page.getByRole("button", { name: "エンド 2のコメントを入力" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("コメント")).toHaveValue("押し手が流れた");
  await dialog.getByLabel("コメント").fill("押し手を修正");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();
  await expect(commentBar).toContainText("押し手を修正");
  await expect(commentBar).not.toContainText("押し手が流れた");

  // 矢はエンドを動かすときに書くので、最後のエンドの矢も書かせてから読み直す
  // (矢が無いとラウンドが埋まらず、ラウンドのコメントが出ない)
  const back = page.getByRole("button", { name: "1エンド戻る", exact: true });
  await back.click();
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 1/2");
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/2");
  await expect(back).toBeEnabled();

  // A reload reads the stored comments back onto the screen.
  await reloadAfterWrites(page);
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".CommentBar")).toContainText("向かい風");
  await expect(page.locator(".CommentBar")).toContainText("押し手を修正");
});

test("the score view shows each end's comment and can edit it", async ({ page }) => {
  await startGame(page);
  await shoot(page, "9", 2);
  await writeComment(page, "エンド 1", "最初のエンド");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  // 書かれたコメントだけ、そのエンドの行の下に出る。
  await expect(page.locator("table .comment-row .CommentText").first()).toHaveText("最初のエンド");

  await writeComment(page, "ゲーム", "全体の振り返り");
  await expect(page.locator(".GameComment")).toContainText("全体の振り返り");

  await writeComment(page, "ラウンド 1", "距離は70m");
  await expect(page.locator(".RoundComment")).toContainText("距離は70m");

  await reloadAfterWrites(page);
  await expect(page.locator(".GameComment")).toContainText("全体の振り返り", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(page.locator(".RoundComment")).toContainText("距離は70m");
  await expect(
    page.locator("table .comment-row .CommentText").first()
  ).toHaveText("最初のエンド");
});

test("clearing a comment removes it", async ({ page }) => {
  await startGame(page);
  await shoot(page, "8", 2);

  await writeComment(page, "エンド 1", "消す予定");
  await expect(page.locator(".CommentBar")).toContainText("消す予定");

  await writeComment(page, "エンド 1", "");
  await expect(page.locator(".CommentBar")).not.toContainText("消す予定");

  await reloadAfterWrites(page);
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".CommentBar")).not.toContainText("消す予定");
});

test("a comment keeps a game that holds no arrow at all", async ({ page }) => {
  await startGame(page);

  await writeComment(page, "エンド 1", "矢はまだ引いていない");
  await expect(page.locator(".CommentBar")).toContainText("矢はまだ引いていない");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(
    page.locator("table .comment-row .CommentText").first()
  ).toHaveText("矢はまだ引いていない");
});

test("コメント枠のどこを押しても入力できる", async ({ page }) => {
  await startGame(page);

  await page.locator(".CommentBar .CommentText").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
