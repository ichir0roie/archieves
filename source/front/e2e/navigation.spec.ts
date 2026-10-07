import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// First navigation into each route dev-compiles it on demand (Turbopack),
// which can take well past the default 5s assertion timeout (see home.spec.ts).
const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("settings page links to match registration and profile settings", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("link", { name: "大会情報の登録" }).click();
  await expect(page).toHaveURL(/\/profile\/matches$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("大会情報の登録");

  await page.goBack();
  await page.getByRole("link", { name: "プロフィール設定" }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("プロフィール設定");
});

test("the menu button moves to the corner chosen on the settings page", async ({ page }) => {
  await page.goto("/settings");
  const menu = page.getByRole("button", { name: "メニュー" });

  for (const [label, left, top] of [
    ["左上", true, true],
    ["右上", false, true],
    ["左下", true, false],
    ["右下", false, false],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const box = await menu.boundingBox();
    const view = page.viewportSize()!;
    expect(box!.x < view.width / 2).toBe(left);
    expect(box!.y < view.height / 2).toBe(top);
  }
});

// メニュー(components/Nav.tsx)は、浮かべた丸いボタンを押したときだけ開く
async function openMenuAndGo(page: Page, label: string) {
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.locator("nav").getByRole("link", { name: label, exact: true }).click();
}

// 行き先ごとに "/" から開き直す(前の行き先のコンパイル待ちに引きずられないように)
test("menu navigates to each primary destination", async ({ page }) => {
  await page.goto("/");
  await openMenuAndGo(page, "記録");
  await expect(page).toHaveURL(/\/score-log$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("スコアログ");

  await page.goto("/");
  await openMenuAndGo(page, "統計");
  await expect(page).toHaveURL(/\/analysis$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("統計ダッシュボード");

  await page.goto("/");
  await openMenuAndGo(page, "ランキング");
  await expect(page).toHaveURL(/\/ranking$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("ランキング");

  await page.goto("/");
  await openMenuAndGo(page, "設定");
  await expect(page).toHaveURL(/\/settings$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("設定");

  await page.goto("/");
  await openMenuAndGo(page, "記録開始");
  await expect(page).toHaveURL(/\/game\/setup$/, { timeout: ROUTE_TIMEOUT });

  await page.goto("/");
  await openMenuAndGo(page, "プロフィール");
  await expect(page).toHaveURL(/\/profile\/local-dev-user$/, { timeout: ROUTE_TIMEOUT });

  await openMenuAndGo(page, "Archieves");
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

test("the menu is hidden on the full-screen score entry", async ({ page }) => {
  await page.goto("/game/score-card");
  await expect(page.locator(".score-entry")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.getByRole("button", { name: "メニュー" })).toHaveCount(0);
});
