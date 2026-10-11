import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import {
  arrowDiameterPx,
  finishSheet,
  nextEnd,
  recordedArrows,
  reloadPage,
  ringButton,
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
  // 満ちても自動で進まず、「1エンド進む」を強調するだけで文は出さず、的は押せなくなる
  await expect(progress).toContainText("エンド 1/2");
  await expect(progress).toContainText("3/3本");
  await expect(recordedArrows(page)).toHaveText(["9", "9", "9"]);
  await expect(page.getByRole("button", { name: "1エンド進む", exact: true })).toHaveClass(/primary/);
  await expect(page.locator(".score-entry .notice")).toHaveCount(0);
  await expect(ringButton(page, "9")).toBeDisabled();

  // 満ちたあとでも、最後の矢を外して打ち直せる
  await page.getByRole("button", { name: "1矢戻る", exact: true }).click();
  await shoot(page, "10", 1);
  await expect(recordedArrows(page)).toHaveText(["9", "9", "10"]);

  await nextEnd(page);
  await expect(progress).toContainText("エンド 2/2");
  await expect(recordedArrows(page)).toHaveCount(0);
});

test("scores stay on this device until 終了, which writes the whole game at once", async ({
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
  await shoot(page, "7", 1);
  expect(writes).toEqual([]);

  await finishSheet(page);
  expect(writes).toEqual(["PUT /api/v1/games/sheet"]);
  // 矢ごとに記録した時刻も送る
  const shotAt = sheets[0].rounds[0].ends[0].points.map((point) => Date.parse(point.shot_at));
  expect(shotAt).toHaveLength(3);
  for (const time of shotAt) expect(time).toBeGreaterThanOrEqual(startedAt - 1000);

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
  await shoot(page, "9", 3);
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

for (const targetType of ["80cm", "40cm"]) {
  test(`the ${targetType} face offers an X like the standard face`, async ({ page }) => {
    await startGame(page, { targetType, endSize: 3 });

    await shoot(page, "X", 1);
    await shoot(page, "9", 1);
    await expect(recordedArrows(page)).toHaveText(["X", "9"]);
  });
}

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
  const saved = await finishSheet(page);

  await page.locator(".EditGameButton").click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(recordedArrows(page)).toHaveText(["9"], { timeout: ROUTE_TIMEOUT });
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

// 数は 1〜100 の整数だけを受け、読めない間は始められない
test("a game shape always has at least one arrow, end and round", async ({ page }) => {
  await page.goto("/game/setup");
  const start = page.getByRole("button", { name: "ゲーム開始" });
  await expect(start).toBeEnabled();

  for (const label of ["1エンドの矢数", "エンド数", "ラウンド数"]) {
    const input = page.getByLabel(label);
    for (const bad of ["0", "", "101", "2.5", "a"]) {
      await input.fill(bad);
      await expect(start).toBeDisabled();
      await expect(page.getByText("1〜100の整数で入力してください")).toBeVisible();
    }
    // 日本語入力のままの全角の数字も受ける
    await input.fill("３");
    await expect(start).toBeEnabled();
  }
  await expect(page.locator(".SetupSummary")).toHaveText("合計 27本 (3本 × 3エンド × 3ラウンド)");
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
  const xRing = await ringButton(page, "X").boundingBox();
  if (!xRing) throw new Error("X ring not laid out");
  const centre = { x: xRing.x + xRing.width / 2, y: xRing.y + xRing.height / 2 };
  // 的は枠の中央に置く
  expect(centre.x).toBeCloseTo(box.x + box.width / 2, 0);
  expect(centre.y).toBeCloseTo(box.y + box.height / 2, 0);

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

test("押した所から、狙う点は指の動きの 4 分の 1 だけ動く", async ({ page }) => {
  await startGame(page, { endSize: 3 });
  const xRing = await ringButton(page, "X").boundingBox();
  const nine = await ringButton(page, "9").boundingBox();
  if (!xRing || !nine) throw new Error("rings not laid out");
  const centre = { x: xRing.x + xRing.width / 2, y: xRing.y + xRing.height / 2 };
  // 9 の帯の真ん中あたり(中心から 9 の外の半径の 3/4)
  const nineMiddle = (nine.width / 2) * 0.75;

  // 中心を押し、9 の帯までの 4 倍だけ指を動かすと、狙う点は 9 の帯に止まる
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + nineMiddle * 4, centre.y, { steps: 5 });
  await expect(page.locator(".target-lens .lens-score")).toHaveText("9");
  await page.mouse.up();
  await expect(recordedArrows(page)).toHaveText(["9"]);
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

test("an arrow touching a line scores the higher ring", async ({ page }) => {
  // 既定の 5mm は画面で 1〜2px で、線との間を押し分けられないので太くする。既定の画面(1280×720)
  // では的が 250px ほどで 30mm でも 6px なので、縦に伸ばして的を大きくする
  await page.setViewportSize({ width: 1280, height: 1100 });
  await startGame(page, { endSize: 3, arrowDiameterMm: 30 });
  const radius = (await arrowDiameterPx(page, 30)) / 2;
  const nine = await ringButton(page, "9").boundingBox();
  if (!nine) throw new Error("9 ring not laid out");
  const centre = { x: nine.x + nine.width / 2, y: nine.y + nine.height / 2 };
  const nineOuterRadius = nine.width / 2;

  // 中心が 9 と 8 の線の外でも、半径より近ければ縁が線にかかるので 9。半径より遠ければ 8
  await page.mouse.click(centre.x + nineOuterRadius + radius - 2, centre.y);
  await expect(recordedArrows(page)).toHaveText(["9"]);
  await page.mouse.click(centre.x + nineOuterRadius + radius + 2, centre.y);
  await expect(recordedArrows(page)).toHaveText(["9", "8"]);

  // 的の外でも、縁が 1 の帯にかかれば 1
  const one = await ringButton(page, "1").boundingBox();
  if (!one) throw new Error("1 ring not laid out");
  await page.mouse.click(centre.x + one.width / 2 + radius - 2, centre.y);
  await expect(recordedArrows(page)).toHaveText(["9", "8", "1"]);
});

test("the arrow diameter set for the game sizes the sight and decides line touches", async ({
  page,
}) => {
  // 記入画面を一度開くと、設定画面の見本がその的の大きさで px に直す。既定の画面(1280×720)では
  // 的が小さく、線との間を押し分けられるほど太くならないので、縦に伸ばして的を大きくする
  await page.setViewportSize({ width: 1280, height: 1100 });
  await startGame(page, { endSize: 3, arrowDiameterMm: 30 });
  const px = await arrowDiameterPx(page, 30);
  expect(px).toBeGreaterThan(8);

  const nine = await ringButton(page, "9").boundingBox();
  if (!nine) throw new Error("9 ring not laid out");
  const centre = { x: nine.x + nine.width / 2, y: nine.y + nine.height / 2 };

  // 中心が 9 と 8 の線の外でも、半径より近ければ縁がかかるので 9(既定の 5mm なら 8)
  await page.mouse.click(centre.x + nine.width / 2 + px / 2 - 2, centre.y);
  await expect(recordedArrows(page)).toHaveText(["9"]);

  // 直径(mm)はゲームに保存される
  const saved = await finishSheet(page);
  const game = await (await page.request.get(`/api/v1/games/${saved.id}`)).json();
  expect(game.arrow_diameter_mm).toBe(30);

  // 設定画面の見本は、記入画面のサイトと同じ大きさ(px × ズームの倍率 5)。ヒントの px は小数 1 桁に丸めて出す
  await page.goto("/game/setup");
  await page.getByLabel("矢の直径").fill("30");
  await expect(page.getByText(`この端末では ${Math.round(px * 10) / 10}px`)).toBeVisible();
  const preview = await page.locator(".SightPreview .ArrowSight").boundingBox();
  expect(preview?.width).toBeCloseTo(px * 5, 0);
});
