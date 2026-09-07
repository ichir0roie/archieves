import { expect, test } from "@playwright/test";
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

// The sidebar (see Navigation.tsx) is only rendered on the home page, so
// each destination is reached from a fresh visit to "/" rather than from
// one another.
test("sidebar navigates to each primary destination", async ({ page }) => {
  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "記録" }).click();
  await expect(page).toHaveURL(/\/score-log$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("スコアログ");

  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "統計" }).click();
  await expect(page).toHaveURL(/\/analysis$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("統計ダッシュボード");

  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "ランキング" }).click();
  await expect(page).toHaveURL(/\/ranking$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("ランキング");

  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "プロフィール" }).click();
  await expect(page).toHaveURL(/\/profile\/local-dev-user$/, { timeout: ROUTE_TIMEOUT });
});
