import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { startGame } from "./scoreEntry";

const ROUTE_TIMEOUT = 15_000;

test("the home page lists the destinations as buttons", async ({ page }) => {
  await ensureRegistered(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Archieves" })).toBeVisible({
    timeout: ROUTE_TIMEOUT,
  });
  const menu = page.locator(".HomeMenu");
  for (const label of [
    "ゲーム開始",
    "スコア",
    "統計",
    "日記",
    "プロフィール",
    "ランキング",
    "お知らせ",
    "意見箱",
    "設定",
  ]) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await menu.getByRole("link", { name: "ゲーム開始", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/setup$/, { timeout: ROUTE_TIMEOUT });
});

// 一度登録が済めば(ensureRegistered が利用者をキャッシュに置く)、ホームもゲームの設定も、
// 新しいゲームの入力の画面も、最初の矢を入れるまで API を叩かない
test("the home and new game screens make no API calls once the user is cached", async ({ page }) => {
  await ensureRegistered(page);
  const calls: Array<string> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) calls.push(`${request.method()} ${url.pathname}`);
  });

  await page.goto("/");
  await expect(page.locator(".HomeMenu")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await startGame(page);
  await expect(page.locator(".score-entry")).toBeVisible({ timeout: ROUTE_TIMEOUT });

  expect(calls).toEqual([]);
});
