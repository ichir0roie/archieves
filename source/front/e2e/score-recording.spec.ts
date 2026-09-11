import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see CLAUDE.md's "Running alongside
// archieves-api"), since recording a score persists every point through it.

// First navigation into each route dev-compiles it on demand (Turbopack),
// which can take well past the default 5s assertion timeout.
const ROUTE_TIMEOUT = 15_000;

interface Setup {
  endSize?: number;
  roundSize?: number;
  gameSize?: number;
  targetType?: string;
}

/** Runs the setup screen and lands on the score-only entry page. */
async function startGame(page: Page, setup: Setup = {}) {
  await page.goto("/game/setup");
  if (setup.targetType) {
    await page.getByRole("button", { name: setup.targetType }).click();
  }
  if (setup.endSize !== undefined) {
    await page.getByLabel("1エンドの矢数").fill(String(setup.endSize));
  }
  if (setup.roundSize !== undefined) {
    await page.getByLabel("エンド数").fill(String(setup.roundSize));
  }
  if (setup.gameSize !== undefined) {
    await page.getByLabel("ラウンド数").fill(String(setup.gameSize));
  }

  await page.getByRole("button", { name: "点数だけ入力" }).click();
  await expect(page).toHaveURL(/\/game\/simple-score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
}

function scoreButton(page: Page, label: string) {
  return page.locator(".SimpleScoreInput").getByRole("button", { name: label, exact: true });
}

/** The arrows recorded in the end on screen, in order (target-touch mode). */
function recordedArrows(page: Page) {
  return page.locator(".EndView .ArrowValue");
}

/** The score-only mode shows the whole game: this is its end in progress. */
function currentEndRow(page: Page) {
  return page.locator(".ScoreSheet .CurrentEnd");
}

function sheetArrows(page: Page) {
  return currentEndRow(page).locator(".ArrowValue");
}

async function shoot(page: Page, label: string, times: number) {
  const button = scoreButton(page, label);
  for (let i = 0; i < times; i++) {
    const before = await sheetArrows(page).count();
    await button.click();
    await expect(sheetArrows(page)).toHaveCount(before + 1, { timeout: 10_000 });
  }
}

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("records a full end of scores and views the result", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await shoot(page, "10", 6);

  await expect(currentEndRow(page).locator(".EndTotal")).toHaveText("60");
  await expect(scoreButton(page, "10")).toBeDisabled();
  await expect(page.locator(".EndCompleteNotice")).toBeVisible();

  await page.getByRole("button", { name: "終了" }).click();

  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.getByText("ラウンド：1")).toBeVisible();

  const row = page.locator("table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("10", { exact: true })).toHaveCount(6);
  await expect(row.getByText("60", { exact: true })).toHaveCount(2);
});

test("going back removes the last recorded point", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await shoot(page, "10", 1);
  await expect(sheetArrows(page)).toHaveText(["10"]);

  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(sheetArrows(page)).toHaveCount(0);

  await shoot(page, "9", 1);
  await expect(sheetArrows(page)).toHaveText(["9"]);
});

test("progress follows the arrow, end and round through a whole game", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 2, gameSize: 2 });

  const progress = page.locator(".ScoreProgress");
  await expect(progress).toContainText("ラウンド 1/2");
  await expect(progress).toContainText("END 1/2");
  await expect(progress).toContainText("0/3本");
  // The end keeps one column per planned arrow from the start, so the sheet
  // above the keypad never shifts as arrows come in.
  await expect(currentEndRow(page).locator(".ArrowCell")).toHaveCount(3);

  await shoot(page, "9", 3);
  await expect(progress).toContainText("3/3本");

  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(progress).toContainText("END 2/2");
  await shoot(page, "9", 3);

  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(progress).toContainText("ラウンド 2/2");
  await expect(progress).toContainText("END 1/2");
  await shoot(page, "9", 3);

  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(progress).toContainText("END 2/2");
  await shoot(page, "9", 3);

  // Nothing is left to record: the screen says so instead of leaving 次へ
  // silently doing nothing.
  await expect(page.locator(".GameCompleteNotice")).toBeVisible();
  await expect(page.getByRole("button", { name: "次へ", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("table")).toHaveCount(2);
});

test("an X is shown as X and counts as ten points", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 1, gameSize: 1 });

  await shoot(page, "X", 3);
  await expect(sheetArrows(page)).toHaveText(["X", "X", "X"]);
  await expect(currentEndRow(page).locator(".EndTotal")).toHaveText("30");

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  const row = page.locator("table tbody tr");
  await expect(row.getByText("X", { exact: true })).toHaveCount(3);
  await expect(row.getByText("30", { exact: true })).toHaveCount(2);
});

test("a ten-ring compound face offers no X", async ({ page }) => {
  await startGame(page, { targetType: "コンパウンド用(80cm)", endSize: 3 });

  await expect(scoreButton(page, "10")).toBeVisible();
  await expect(scoreButton(page, "X")).toHaveCount(0);
});

test("the score sheet shows one column per arrow of the end", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 1, gameSize: 1 });

  await shoot(page, "8", 3);
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });

  // 3 arrow columns plus the end number, its subtotal and the running total.
  await expect(page.locator("table thead th")).toHaveCount(6);
});

test("backing out past the first arrow leaves no game behind", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await shoot(page, "9", 1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gameId")))
    .not.toBeNull();

  await page.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(sheetArrows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "戻る", exact: true }).click();

  // The game the first arrow created is deleted rather than left in the
  // score log with nothing in it.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gameId")))
    .toBeNull();

  // The still-empty screen keeps working and starts a fresh game.
  await shoot(page, "8", 1);
  await expect(sheetArrows(page)).toHaveText(["8"]);
});

test("finishing a game with nothing recorded goes home", async ({ page }) => {
  await startGame(page, { endSize: 6, roundSize: 6, gameSize: 2 });

  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

test("a game shape that cannot be scored blocks the start buttons", async ({ page }) => {
  await page.goto("/game/setup");
  const start = page.getByRole("button", { name: "点数だけ入力" });
  await expect(start).toBeEnabled();

  await page.getByLabel("エンド数").fill("0");
  await expect(start).toBeDisabled();
  await expect(page.getByRole("button", { name: "的をタッチして入力" })).toBeDisabled();

  await page.getByLabel("エンド数").fill("6");
  await expect(start).toBeEnabled();

  await page.getByLabel("1エンドの矢数").fill("");
  await expect(start).toBeDisabled();
});

test("resuming a game whose end is already full opens the next end", async ({ page }) => {
  await startGame(page, { endSize: 3, roundSize: 6, gameSize: 2 });

  await shoot(page, "10", 3);
  await expect(page.locator(".ScoreProgress")).toContainText("END 1/6");

  await page.reload();

  await expect(page.locator(".ScoreProgress")).toContainText("END 2/6", {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(sheetArrows(page)).toHaveCount(0);

  // The end just finished stays on the sheet above the one being recorded.
  await expect(page.locator(".ScoreSheet .SheetEndRow")).toHaveCount(2);
  await expect(
    page.locator(".ScoreSheet .SheetEndRow").first().locator(".ArrowValue")
  ).toHaveText(["10", "10", "10"]);

  await shoot(page, "10", 1);
});

test("the score sheet keeps every round of the game across a reload", async ({ page }) => {
  await startGame(page, { endSize: 2, roundSize: 2, gameSize: 2 });

  await shoot(page, "10", 2);
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await shoot(page, "8", 2);
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2");
  await shoot(page, "9", 1);

  await page.reload();
  await expect(page.locator(".ScoreProgress")).toContainText("ラウンド 2/2", {
    timeout: ROUTE_TIMEOUT,
  });

  // Both rounds are on the sheet, not just the one being recorded.
  const rounds = page.locator(".ScoreSheet .SheetRound");
  await expect(rounds).toHaveCount(2);
  await expect(rounds.first().locator(".SheetEndRow")).toHaveCount(2);
  await expect(rounds.first().locator(".SheetEndRow").first().locator(".ArrowValue"))
    .toHaveText(["10", "10"]);
  await expect(rounds.first().locator(".RoundTotal")).toHaveText("計 36");
  await expect(sheetArrows(page)).toHaveText(["9"]);
});

test("the score entry screen cannot be reached without starting a game", async ({ page }) => {
  await page.goto("/game");
  await expect(page.getByRole("button", { name: "続きから" })).toBeDisabled({
    timeout: ROUTE_TIMEOUT,
  });

  await page.goto("/game/simple-score-card");
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

test("tapping the same spot twice on the target records two arrows", async ({ page }) => {
  await page.goto("/game/setup");
  await page.getByLabel("1エンドの矢数").fill("3");
  await page.getByRole("button", { name: "的をタッチして入力" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });

  const target = page.locator(".TargetCircleInput > div").first();
  await expect(target).toBeVisible({ timeout: ROUTE_TIMEOUT });
  const box = await target.boundingBox();
  if (!box) throw new Error("target not laid out");
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

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
