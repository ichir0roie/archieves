import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see CLAUDE.md's "Running alongside
// archieves-api"): the upload is rejected by the API, not by the page.

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
  await page.goto("/import");
  await expect(page.locator("header")).toContainText("インポート");
});

test("the import button stays disabled until a file is chosen", async ({ page }) => {
  await expect(page.getByRole("button", { name: "インポート", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "ファイルを選択" })).toBeEnabled();
});

test("choosing a file names it on the picker button", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.sqlite",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a database"),
  });

  await expect(page.getByRole("button", { name: "backup.sqlite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "インポート", exact: true })).toBeEnabled();
});

test("a file that is not a SQLite backup is reported as an error", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.sqlite",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("definitely not a database"),
  });
  await page.getByRole("button", { name: "インポート", exact: true }).click();

  const alert = page.locator(".MuiAlert-root");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Not a valid SQLite file");
  await expect(page.getByText("インポートが完了しました")).toHaveCount(0);
});
