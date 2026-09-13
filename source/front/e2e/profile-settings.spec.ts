import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see CLAUDE.md's "E2E tests"), since this
// page persists through it.
test("saving profile settings persists the entered fields", async ({ page }) => {
  await ensureRegistered(page);

  await page.getByLabel("ニックネーム").fill("テスト太郎");
  await page.getByLabel("年齢").fill("28");

  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("保存しました")).toBeVisible({ timeout: 15_000 });

  await page.reload();
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
  await expect(page.getByText("保存しました")).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("所属").fill("");
  await page.getByLabel("所属").fill(organizationPrefix);
  await expect(page.getByRole("option", { name: organizationName })).toBeVisible();

  await page.getByRole("option", { name: organizationName }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel("所属")).toHaveValue(organizationName);
});
