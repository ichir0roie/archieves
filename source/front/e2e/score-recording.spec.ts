import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import {
  nextEnd,
  recordedArrows,
  reloadPage,
  ringButton,
  saveSheet,
  shoot,
  startGame,
} from "./scoreEntry";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E"), since
// recording a score persists every point through it.

// First navigation into each route dev-compiles it on demand (Turbopack),
// which can take well past the default 5s assertion timeout.
const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("records a full end of scores and views the result", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 1, gameSize: 1 });

  await shoot(page, "10", 6);

  await expect(page.locator(".EndView .EndTotal")).toHaveText("60");
  await expect(ringButton(page, "10")).toBeDisabled();
  // ゲームの最後のエンドなので、次のエンドへは進まず「ゲームの記録が済んだ」と出る
  await expect(page.locator(".GameCompleteNotice")).toBeVisible();

  await page.getByRole("button", { name: "終了" }).click();

  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.getByText("ラウンド 1", { exact: true })).toBeVisible();

  const row = page.locator("table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("10", { exact: true })).toHaveCount(6);
  await expect(row.getByText("60", { exact: true })).toHaveCount(2);
});

test("going back removes the last recorded point", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await shoot(page, "10", 1);
  await expect(recordedArrows(page)).toHaveText(["10"]);

  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveCount(0);

  await shoot(page, "9", 1);
  await expect(recordedArrows(page)).toHaveText(["9"]);
});

test("1矢進む puts back the arrow 1矢戻る removed", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });
  const forward = page.getByRole("button", { name: "1矢進む", exact: true });
  await expect(forward).toBeDisabled();

  await shoot(page, "10", 1);
  await shoot(page, "8", 1);
  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveText(["10"]);

  await forward.click();
  await expect(recordedArrows(page)).toHaveText(["10", "8"]);
  await expect(forward).toBeDisabled();

  // A new arrow after undoing starts a new history: nothing is left to put back.
  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveText(["10"]);
  await shoot(page, "7", 1);
  await expect(recordedArrows(page)).toHaveText(["10", "7"]);
  await expect(forward).toBeDisabled();
});

test("1エンド戻る・進む moves between ends and keeps every arrow", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });
  const progress = page.locator(".ScoreProgress");
  const back = page.getByRole("button", { name: "1エンド戻る", exact: true });
  const forward = page.getByRole("button", { name: "1エンド進む", exact: true });

  await shoot(page, "9", 3);
  await forward.click();
  await expect(progress).toContainText("エンド 2/2");
  await shoot(page, "10", 2);

  await back.click();
  await expect(progress).toContainText("エンド 1/2");
  await expect(recordedArrows(page)).toHaveText(["9", "9", "9"]);

  // The end behind is not cleared by going back past it.
  await forward.click();
  await expect(progress).toContainText("エンド 2/2");
  await expect(recordedArrows(page)).toHaveText(["10", "10"]);

  // The first end of a game with arrows in it cannot be backed out of.
  await back.click();
  await expect(progress).toContainText("エンド 1/2");
  await expect(back).toBeDisabled();
  await expect(recordedArrows(page)).toHaveText(["9", "9", "9"]);
});

test("1矢戻る is the only thing that erases an arrow", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });
  const progress = page.locator(".ScoreProgress");
  const forward = page.getByRole("button", { name: "1エンド進む", exact: true });
  const back = page.getByRole("button", { name: "1エンド戻る", exact: true });

  await shoot(page, "9", 3);
  await forward.click();
  await expect(progress).toContainText("エンド 2/2");
  await shoot(page, "7", 2);
  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveText(["7"]);

  // Walking away from the end and back keeps what is left and what was put aside.
  await back.click();
  await expect(progress).toContainText("エンド 1/2");
  await forward.click();
  await expect(progress).toContainText("エンド 2/2");
  await expect(recordedArrows(page)).toHaveText(["7"]);
  await page.getByRole("button", { name: "1矢進む", exact: true }).click();
  await expect(recordedArrows(page)).toHaveText(["7", "7"]);

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByText("7", { exact: true })).toHaveCount(2);
});

test("a full end stays on screen until 1エンド進む is pressed", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });
  const progress = page.locator(".ScoreProgress");

  await shoot(page, "9", 3);
  // 満ちても自動で進まず、満ちたことと次の操作を知らせ、的は押せなくなる
  await expect(progress).toContainText("エンド 1/2");
  await expect(progress).toContainText("3/3本");
  await expect(recordedArrows(page)).toHaveText(["9", "9", "9"]);
  await expect(page.locator(".EndCompleteNotice")).toContainText("「1エンド進む」で次のエンドに進みます");
  await expect(ringButton(page, "9")).toBeDisabled();

  // 満ちたあとでも、最後の矢を外して打ち直せる
  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await shoot(page, "10", 1);
  await expect(recordedArrows(page)).toHaveText(["9", "9", "10"]);

  await nextEnd(page);
  await expect(progress).toContainText("エンド 2/2");
  await expect(recordedArrows(page)).toHaveCount(0);
});

test("scores stay on this device until 保存, which writes the whole game at once", async ({
  page,
}) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });
  const writes: Array<string> = [];
  const sheets: Array<{ rounds: Array<{ ends: Array<{ points: Array<{ shot_at: string }> }> }> }> =
    [];
  page.on("request", (request) => {
    if (request.method() === "GET") return;
    if (!new URL(request.url()).pathname.startsWith("/api/v1/")) return;
    writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.url().endsWith("/games/sheet")) sheets.push(request.postDataJSON());
  });

  const startedAt = Date.now();
  await shoot(page, "9", 3);
  await nextEnd(page);
  await shoot(page, "8", 1);
  await expect(page.locator(".ScoreSave")).toHaveText("保存");
  expect(writes).toEqual([]);

  await saveSheet(page);
  expect(writes).toEqual(["PUT /api/v1/games/sheet"]);
  // 矢ごとに記録した時刻も送る
  const shotAt = sheets[0].rounds[0].ends[0].points.map((point) => Date.parse(point.shot_at));
  expect(shotAt).toHaveLength(3);
  for (const time of shotAt) expect(time).toBeGreaterThanOrEqual(startedAt - 1000);

  // 保存したあとも同じ画面で続けられ、次の保存は同じゲームを上書きする
  await shoot(page, "7", 1);
  await saveSheet(page);
  expect(writes).toEqual(["PUT /api/v1/games/sheet", "PUT /api/v1/games/sheet"]);

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByText("8", { exact: true })).toHaveCount(1);
  await expect(rows.nth(1).getByText("7", { exact: true })).toHaveCount(1);
});

test("progress follows the arrow, end and round through a whole game", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });

  const progress = page.locator(".ScoreProgress");
  await expect(progress).toContainText("ラウンド 1/2");
  await expect(progress).toContainText("エンド 1/2");
  await expect(progress).toContainText("0/3本");
  // The end keeps one slot per planned arrow from the start, so the target
  // below never shifts as arrows come in.
  await expect(page.locator(".EndView .ArrowSlot")).toHaveCount(3);

  await shoot(page, "9", 3);
  await nextEnd(page);
  await expect(progress).toContainText("エンド 2/2");
  await expect(progress).toContainText("0/3本");
  // ラウンドの最後のエンドが満ちたら、次へ進むとラウンドが変わることを知らせる
  await shoot(page, "9", 3);
  await expect(page.locator(".EndCompleteNotice")).toContainText("次のラウンドに進みます");
  await nextEnd(page);
  await expect(progress).toContainText("ラウンド 2/2");
  await expect(progress).toContainText("エンド 1/2");
  await shoot(page, "9", 3);
  await nextEnd(page);
  await expect(progress).toContainText("エンド 2/2");
  await shoot(page, "9", 3);

  // Nothing is left to record: the screen says so instead of leaving 1エンド進む
  // silently doing nothing.
  await expect(page.locator(".GameCompleteNotice")).toBeVisible();
  await expect(page.getByRole("button", { name: "1エンド進む", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("table")).toHaveCount(2);
});

test("an X is shown as X and counts as ten points", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 1, gameSize: 1 });

  await shoot(page, "X", 3);
  await expect(recordedArrows(page)).toHaveText(["X", "X", "X"]);
  await expect(page.locator(".EndView .EndTotal")).toHaveText("30");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  const row = page.locator("table tbody tr");
  await expect(row.getByText("X", { exact: true })).toHaveCount(3);
  await expect(row.getByText("30", { exact: true })).toHaveCount(2);
});

test("a ten-ring compound face offers no X", async ({ page }) => {
  await startGame(page, { targetType: "コンパウンド用(80cm)", endSize: 3 });

  await expect(ringButton(page, "10")).toBeVisible();
  await expect(ringButton(page, "X")).toHaveCount(0);
});

test("the score sheet shows one column per arrow of the end", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 1, gameSize: 1 });

  await shoot(page, "8", 3);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  // 3 arrow columns plus the end number, its subtotal, the running total
  // and the end's comment.
  await expect(page.locator("table thead th")).toHaveCount(7);
});

test("finishing a saved game after taking every arrow back leaves no game behind", async ({
  page,
}) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });
  await shoot(page, "9", 1);
  const saved = await saveSheet(page);

  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "終了" }).click();

  // 保存してあったゲームは、空のままスコアに残さず消す
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
  const response = await page.request.get(`/api/v1/games/${saved.id}`);
  expect(response.status()).toBe(404);
});

test("finishing a game with nothing recorded goes home", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

// 数は 1 から選ぶ select なので、矢の無いゲームの形は選べない
test("a game shape always has at least one arrow, end and round", async ({ page }) => {
  await page.goto("/game/setup");
  await expect(page.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();

  for (const label of ["1エンドの矢数", "エンド数", "ラウンド数"]) {
    const options = page.getByLabel(label).locator("option");
    await expect(options.first()).toHaveText("1");
    await expect(options.filter({ hasText: /^0$/ })).toHaveCount(0);
  }
});

test("editing a saved game whose last end is full opens the next end", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 6, gameSize: 2 });
  await shoot(page, "10", 3);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  await page.locator(".EditGameButton").click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/6", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(recordedArrows(page)).toHaveCount(0);

  await shoot(page, "8", 1);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("table tbody tr")).toHaveCount(2);
});

test("an unsaved game comes back in the right round and end across a reload", async ({
  page,
}) => {
  await startGame(page, { endSize: 2, roundSize: 2, gameSize: 2 });

  await shoot(page, "10", 2);
  await nextEnd(page);
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/2");
  await shoot(page, "8", 2);
  await nextEnd(page);
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2");
  await shoot(page, "9", 1);

  await reloadPage(page);
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 1/2");
  await expect(recordedArrows(page)).toHaveText(["9"]);
  await expect(page.locator(".ScoreSave")).toHaveText("保存");
});

test("leaving with ✕ keeps the unsaved game to continue from home", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 1 });
  await shoot(page, "10", 2);

  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
  await page.getByRole("link", { name: "入力中のゲームを続ける" }).click();

  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(recordedArrows(page)).toHaveText(["10", "10"]);
});

test("starting a new game over unsaved scores asks first", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 1 });
  await shoot(page, "10", 1);
  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });

  // 断ると設定の画面にとどまる
  await page.goto("/game/setup");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page).toHaveURL(/\/game\/setup$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(recordedArrows(page)).toHaveCount(0);
});

test("the score entry screen cannot be reached without starting a game", async ({ page }) => {
  await page.goto("/game/score-card");
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

test("tapping the same spot twice on the target records two arrows", async ({ page }) => {
  await startGame(page, { endSize: 3 });

  const target = page.locator(".TargetCircleInput .TargetFace");
  const box = await target.boundingBox();
  if (!box) throw new Error("target not laid out");
  // 的の中心は枠の中央でなく(下の余白のぶん上に寄る)、X の帯の中心
  const xRing = await ringButton(page, "X").boundingBox();
  if (!xRing) throw new Error("X ring not laid out");
  // 狙う点は指の上 107px(TargetCircleInput の AIM_OFFSET_Y)なので、そのぶん下を押す
  const centre = { x: xRing.x + xRing.width / 2, y: xRing.y + xRing.height / 2 + 107 };

  // The marker drawn for the first arrow sits on top of every ring, so it
  // must not swallow the tap that records the second.
  await page.mouse.click(centre.x, centre.y);
  await expect(recordedArrows(page)).toHaveCount(1);
  await page.mouse.click(centre.x, centre.y);
  await expect(recordedArrows(page)).toHaveCount(2);
  await expect(recordedArrows(page)).toHaveText(["X", "X"]);

  // The end's slots are laid out up front, so the target keeps its place.
  await expect(await target.boundingBox()).toEqual(box);
});

test("矢が空のままでも 1エンド進む でエンドを飛ばせる", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 3, gameSize: 1 });
  const progress = page.locator(".ScoreProgress");
  const forward = page.getByRole("button", { name: "1エンド進む", exact: true });

  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(progress).toContainText("エンド 2/3");
  await shoot(page, "8", 3);
  await nextEnd(page);
  await expect(progress).toContainText("エンド 3/3");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
});
