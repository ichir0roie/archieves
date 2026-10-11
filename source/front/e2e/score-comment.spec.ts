import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import {
  currentEndNumber,
  nextEnd,
  reloadPage,
  shoot,
  startGame as startCommentGame,
} from "./scoreEntry";

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
  await nextEnd(page);
  await expect(currentEndNumber(page)).toHaveText("2");
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

  // コメントも手元のキャッシュにあり、保存しないまま読み込み直しても戻る
  await reloadPage(page);
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".CommentBar")).toContainText("向かい風");
  await expect(page.locator(".CommentBar")).toContainText("押し手を修正");

  // 終了すると矢と一緒に保存され、スコアの画面に出る
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".RoundComment")).toContainText("向かい風");
  await expect(page.locator("table .comment-row .CommentText")).toHaveText(["押し手を修正"]);
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

  await reloadPage(page);
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

  await reloadPage(page);
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

test("a comment on the score view shows at once and is written in the background", async ({
  page,
}) => {
  await startGame(page);
  await shoot(page, "9", 1);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  // API の応答を遅らせても、保存を押した時点で画面に出る(モーダルも待たずに閉じる)
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/games/*/comment", async (route) => {
    await held;
    await route.continue();
  });
  const written = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/games\/\d+\/comment$/.test(r.url()),
  );
  await writeComment(page, "ゲーム", "すぐ出る");
  await expect(page.locator(".GameComment")).toContainText("すぐ出る");
  release();
  expect((await written).status()).toBe(200);

  await page.unroute("**/api/v1/games/*/comment");
  await reloadPage(page);
  await expect(page.locator(".GameComment")).toContainText("すぐ出る", { timeout: ROUTE_TIMEOUT });
});

test("a score view comment that could not be written goes back and says so", async ({ page }) => {
  await startGame(page);
  await shoot(page, "9", 1);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("table")).toBeVisible({ timeout: ROUTE_TIMEOUT });

  await page.route("**/api/v1/rounds/*/comment", (route) => route.abort("internetdisconnected"));
  await writeComment(page, "ラウンド 1", "届かない");

  // 書けなかったので API から読み直し、書けた所(コメントなし)に戻る
  await expect(page.locator(".api-error")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".RoundComment")).toHaveCount(0);
});
