import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { MOCK_SIGNED_OUT_COOKIE } from "../src/lib/auth/openPaths";

// ログインしていない人の画面。モックのログインはいつも本人なので、ログインなしを真似るクッキーを置く
// (画面の AuthGate と route handler の両方が見る)

const API_URL = process.env.ARCHIEVES_API_URL ?? "http://127.0.0.1:8080";
const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([
    {
      name: MOCK_SIGNED_OUT_COOKIE,
      value: "1",
      url: baseURL!,
    },
  ]);
});

/** 他人の行を API に作り、プロフィールの公開範囲を決める */
async function createUser(
  request: APIRequestContext,
  name: string,
  profileVisibility: "private" | "public",
): Promise<{ id: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer mock-token-e2e-signed-out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  if (process.env.ARCHIEVES_API_KEY) headers["x-archieves-api-key"] = process.env.ARCHIEVES_API_KEY;
  const created = await request.post(`${API_URL}/api/v1/users/me/ensure`, {
    headers,
    data: { name },
  });
  expect(created.ok()).toBeTruthy();
  const updated = await request.patch(`${API_URL}/api/v1/users/me`, {
    headers,
    data: { profile_visibility: profileVisibility },
  });
  expect(updated.ok()).toBeTruthy();
  return created.json();
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "メニュー" }).click();
  return page.locator("nav");
}

test("the home introduces the app and offers sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".SignedOutHome")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.getByRole("link", { name: "サインイン・新規登録" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ゲーム開始" })).toHaveCount(0);

  const nav = await openMenu(page);
  await expect(nav.getByRole("link", { name: "ランキング", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "使い方", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "サインイン・新規登録" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "スコア", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "サインアウト" })).toHaveCount(0);
});

test("the guide and the ranking open without signing in", async ({ page }) => {
  await page.goto("/");
  let nav = await openMenu(page);
  await nav.getByRole("link", { name: "使い方", exact: true }).click();
  await expect(page).toHaveURL(/\/guide$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.getByRole("heading", { name: "ホーム画面に追加(インストール)" })).toBeVisible();

  nav = await openMenu(page);
  await nav.getByRole("link", { name: "ランキング", exact: true }).click();
  await expect(page).toHaveURL(/\/ranking$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.getByText("全体公開にしている人だけを出します")).toBeVisible();
  // 組織の一覧はログインが要るので、組織では絞らせない
  await expect(page.getByText("所属", { exact: true })).toHaveCount(0);
  await expect(page.locator(".api-error")).toHaveCount(0);
  await expect(page.getByText("読み込み中...")).toHaveCount(0, { timeout: ROUTE_TIMEOUT });
});

test("a public profile opens without signing in, a private one does not", async ({
  page,
  request,
}) => {
  const open = await createUser(request, "公開の人", "public");
  const closed = await createUser(request, "非公開の人", "private");

  await page.goto(`/profile/${open.id}`);
  await expect(page.locator(".profile-name")).toHaveText("公開の人", { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ProfileSettingsLink")).toHaveCount(0);

  await page.goto(`/profile/${closed.id}`);
  await expect(page.locator(".ProfilePrivate")).toBeVisible({ timeout: ROUTE_TIMEOUT });
});

test("other screens ask to sign in, and signing in shows them", async ({ page }) => {
  await page.goto("/score-log");
  const signIn = page.getByRole("button", { name: "サインイン・新規登録" });
  await expect(signIn).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.getByText("この画面はサインインすると使えます")).toBeVisible();
  await expect(page.locator(".log-group")).toHaveCount(0);

  await signIn.click();
  // 登録の前なら、登録の画面(プロフィール設定)へ送られる。どちらでも画面が出ればよい
  await expect(page.locator("header")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(signIn).toHaveCount(0);
});
