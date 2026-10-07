import { expect, test } from "@playwright/test";
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
  await page.getByLabel("年齢").fill("28");

  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/profile/settings");
  await expect(page.getByLabel("ニックネーム")).toHaveValue("テスト太郎");
  await expect(page.getByLabel("年齢")).toHaveValue("28");
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

test("the ranking lists the signed-in user once they have a game", async ({ page }) => {
  await ensureRegistered(page);
  await page.getByLabel("名前").fill("ランキング太郎");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL("/");

  await recordGame(page);

  await page.goto("/ranking");
  await expect(page.locator("header")).toContainText("ランキング");
  await expect(page.getByText("該当するデータがありません")).toHaveCount(0);
  await expect(page.getByText("ランキング太郎").first()).toBeVisible();
});
