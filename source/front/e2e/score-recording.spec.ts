import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordedArrows, reloadAfterWrites, ringButton, shoot, startGame } from "./scoreEntry";

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

  // 矢が満ちると同じラウンドの次のエンドへ自動で進む
  await shoot(page, "9", 3);
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

test("arrows are written when the end changes, not one by one", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });
  const arrowPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/ends\/\d+\/points$/.test(request.url())) {
      arrowPosts.push(request.url());
    }
  });

  await shoot(page, "9", 2);
  expect(arrowPosts).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("gameId"))).toBeNull();

  // 三本目でエンドが満ち、次のエンドへ自動で進むときにまとめて書く
  await shoot(page, "9", 1);
  await expect.poll(() => arrowPosts.length).toBe(3);
  expect(await page.evaluate(() => localStorage.getItem("gameId"))).not.toBeNull();
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

  // 満ちたエンドから同じラウンドの次のエンドへは自動で進む
  await shoot(page, "9", 3);
  await expect(progress).toContainText("エンド 2/2");
  await expect(progress).toContainText("0/3本");
  // ラウンドの最後のエンドが満ちたら、次のラウンドへも自動で進む
  await shoot(page, "9", 3);
  await expect(progress).toContainText("ラウンド 2/2");
  await expect(progress).toContainText("エンド 1/2");
  await shoot(page, "9", 3);
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

test("backing out past the first arrow leaves no game behind", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  // Arrows are only written when the end changes, so move on and back to get the game created.
  await shoot(page, "9", 1);
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/6");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gameId")))
    .not.toBeNull();
  await page.getByRole("button", { name: "1エンド戻る", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 1/6");

  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await expect(recordedArrows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "1エンド戻る", exact: true }).click();

  // The game the arrow created is deleted rather than left in the
  // score log with nothing in it.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gameId")))
    .toBeNull();

  // The still-empty screen keeps working and starts a fresh game.
  await shoot(page, "8", 1);
  await expect(recordedArrows(page)).toHaveText(["8"]);
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

test("resuming a game whose end is already full opens the next end", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 6, gameSize: 2 });

  // 満ちると次のエンドへ自動で進み、そのときに矢を書く
  const arrowPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/ends\/\d+\/points$/.test(request.url())) {
      arrowPosts.push(request.url());
    }
  });
  await shoot(page, "10", 3);
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/6");
  await page.getByRole("button", { name: "1エンド戻る", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 1/6");
  // 書き込みが終わる前に読み直すと、書きかけの矢が読めない
  await expect.poll(() => arrowPosts.length).toBe(3);

  await reloadAfterWrites(page);

  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/6", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(recordedArrows(page)).toHaveCount(0);

  await shoot(page, "10", 1);
});

test("the game resumes in the right round and end across a reload", async ({ page }) => {
  await startGame(page, { endSize: 2, roundSize: 2, gameSize: 2 });

  await shoot(page, "10", 2);
  await expect(page.locator(".ScoreProgress")).toContainText("エンド 2/2");
  // ラウンドの最後のエンドが満ちると、次のラウンドへ自動で進む
  await shoot(page, "8", 2);
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2");
  await shoot(page, "9", 1);
  // 矢はエンドを動かすときに書くので、動かして今のエンドを書かせる
  await page.getByRole("button", { name: "1エンド戻る", exact: true }).click();
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2");

  await reloadAfterWrites(page);
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2", {
    timeout: ROUTE_TIMEOUT,
  });

  await expect(page.locator(".ScoreProgress")).toContainText("エンド 1/2");
  await expect(recordedArrows(page)).toHaveText(["9"]);
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
  await expect(progress).toContainText("エンド 3/3");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
});
