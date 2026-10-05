import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// First navigation into each route dev-compiles it on demand (Turbopack),
// which can take well past the default 5s assertion timeout (see home.spec.ts).
const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("home page links to match registration and profile settings", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "大会情報の登録" }).click();
  await expect(page).toHaveURL(/\/profile\/matches$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("大会情報の登録");

  await page.goBack();
  await page.getByRole("button", { name: "プロフィール設定" }).click();
  await expect(page).toHaveURL(/\/profile\/settings$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("プロフィール設定");
});

// メニュー(components/Nav.tsx)は、浮かべた丸いボタンを押したときだけ開く
async function openMenuAndGo(page: Page, label: string) {
  await page.getByRole("button", { name: "メニュー" }).click();
  await page.locator("nav").getByRole("link", { name: label, exact: true }).click();
}

test("menu navigates to each primary destination", async ({ page }) => {
  await page.goto("/");
  await openMenuAndGo(page, "記録");
  await expect(page).toHaveURL(/\/score-log$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("スコアログ");

  await openMenuAndGo(page, "統計");
  await expect(page).toHaveURL(/\/analysis$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("統計ダッシュボード");

  await openMenuAndGo(page, "ランキング");
  await expect(page).toHaveURL(/\/ranking$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("ランキング");

  await openMenuAndGo(page, "プロフィール");
  await expect(page).toHaveURL(/\/profile\/local-dev-user$/, { timeout: ROUTE_TIMEOUT });

  await openMenuAndGo(page, "Archieves");
  await expect(page).toHaveURL(/\/$/, { timeout: ROUTE_TIMEOUT });
});

test("the menu is hidden on the full-screen score entry", async ({ page }) => {
  await page.goto("/game/simple-score-card");
  await expect(page.locator(".score-entry")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.getByRole("button", { name: "メニュー" })).toHaveCount(0);
});
