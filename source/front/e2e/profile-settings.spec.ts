import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// どのテストも同じモックの利用者のプロフィールを丸ごと保存する。並べて走らせると、
// 片方が読み込んだ古い値で、もう片方の保存を上書きする。プロフィールを保存するテストは
// ほかの spec に置かず、ここに集めて一つずつ走らせる
test.describe.configure({ mode: "serial" });

// Needs archieves-api running (see .claude/docs/testing.md's "E2E"), since this
// page persists through it.
test("saving profile settings persists the entered fields", async ({ page }) => {
  await ensureRegistered(page);

  await page.getByLabel("ニックネーム").fill("テスト太郎");

  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/profile/settings");
  await expect(page.getByLabel("ニックネーム")).toHaveValue("テスト太郎");
});

test("organization field offers existing matches and creates a new one when none matches", async ({
  page,
}) => {
  await ensureRegistered(page);

  const organizationName = `E2E Archery Club ${Date.now()}`;
  const organizationPrefix = organizationName.slice(0, 16);

  await page.getByLabel("所属").fill(organizationName);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/profile/settings");
  await page.getByLabel("所属").fill("");
  await page.getByLabel("所属").fill(organizationPrefix);
  await expect(page.getByRole("option", { name: organizationName })).toBeVisible();

  await page.getByRole("option", { name: organizationName }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/profile/settings");
  await expect(page.getByLabel("所属")).toHaveValue(organizationName);
});

test("home page greets the signed-in user with their database name", async ({ page }) => {
  await ensureRegistered(page);

  await page.getByLabel("名前").fill("データベース太郎");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("ようこそ、データベース太郎 さん")).toBeVisible({
    timeout: 15_000,
  });
});

/** 設定の画面で公開範囲を選んで保存する。label は「プロフィール」か「ランキング」 */
async function saveVisibility(page: Page, label: string, option: string) {
  await ensureRegistered(page);
  await page
    .getByRole("group", { name: `${label}の公開範囲` })
    .getByRole("button", { name: option, exact: true })
    .click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");
}

/** この利用者(モックの利用者)の、API の行の id */
async function myUserId(page: Page): Promise<number> {
  const me = await page.request.get("/api/v1/users/me");
  expect(me.ok()).toBeTruthy();
  return (await me.json()).id;
}

/** ランキングの、この利用者の行 */
async function myRankingRow(page: Page) {
  return page.locator(`.RankingList a[href="/profile/${await myUserId(page)}"]`);
}

test("the saved visibility is shown again on the settings page", async ({ page }) => {
  await saveVisibility(page, "プロフィール", "グループ公開");

  await page.goto("/profile/settings");
  const group = page.getByRole("group", { name: "プロフィールの公開範囲" });
  await expect(group.getByRole("button", { name: "グループ公開", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await saveVisibility(page, "プロフィール", "非公開");
});

test("the ranking lists the signed-in user only while their ranking is shared", async ({ page }) => {
  await ensureRegistered(page);
  await page.getByLabel("名前").fill("ランキング太郎");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");
  await recordGame(page);

  await saveVisibility(page, "ランキング", "全体公開");
  await page.goto("/ranking");
  await expect(page.locator("header")).toContainText("ランキング");
  await expect(await myRankingRow(page)).toContainText("ランキング太郎");

  await saveVisibility(page, "ランキング", "非公開");
  await page.goto("/ranking");
  await expect(page.getByText("読み込み中...")).toHaveCount(0);
  await expect(await myRankingRow(page)).toHaveCount(0);
});

test("a game recorded with a bow type shows up under that bow", async ({ page }) => {
  await saveVisibility(page, "ランキング", "全体公開");
  await recordGame(page, { bowType: "コンパウンド" });

  await page.goto("/ranking");
  await page.getByRole("group", { name: "弓の種類" }).getByRole("button", { name: "コンパウンド" }).click();
  await expect(page.getByText("読み込み中...")).toHaveCount(0);
  const row = await myRankingRow(page);
  await expect(row).toHaveCount(1);
  await expect(row.locator(".big")).toContainText("点");

  await saveVisibility(page, "ランキング", "非公開");
});

test("my profile page has no visibility settings and links to the profile settings", async ({ page }) => {
  await ensureRegistered(page);

  await page.goto("/profile/me");
  await expect(page).toHaveURL(`/profile/${await myUserId(page)}`);
  await expect(page.getByRole("group", { name: "プロフィールの公開範囲" })).toHaveCount(0);
  await page.getByRole("link", { name: "プロフィール設定へ" }).click();
  await expect(page).toHaveURL("/profile/settings");
  await expect(page.getByRole("group", { name: "日記の公開範囲" })).toBeVisible();
});

test("another user's profile page has no link to the profile settings", async ({ page }) => {
  await ensureRegistered(page);
  // モックのログインでは他人としてログインできないので、他人の行は API で作る(既定は非公開)
  const created = await page.request.post("/api/v1/users/find-or-create", {
    data: {
      sub: `e2e-other-${Date.now()}`,
      name: "他人",
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto(`/profile/${(await created.json()).id}`);
  await expect(page.getByText("このプロフィールは公開されていません")).toBeVisible();
  await expect(page.locator(".ProfileSettingsLink")).toHaveCount(0);
});
