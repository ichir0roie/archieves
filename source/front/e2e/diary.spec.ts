import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// API を起こしてから回す(.claude/docs/testing.md の「E2E」)。

const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("a written diary shows up at the top of the list", async ({ page }) => {
  await page.goto("/diary");
  await expect(page.locator("header")).toContainText("日記", { timeout: ROUTE_TIMEOUT });

  const submit = page.getByRole("button", { name: "書く", exact: true });
  await expect(submit).toBeDisabled();

  // spec は一つの db に並べて走るので、このテストが書いたものを一意の文で探す
  const body = `E2E の日記 ${Date.now()}`;
  await page.getByLabel("本文").fill(`${body}\n2 行目`);
  await submit.click();

  await expect(page.getByLabel("本文")).toHaveValue("");
  const item = page.locator(".DiaryCell", { hasText: body });
  await expect(item).toBeVisible();
  await expect(item).toContainText("2 行目");
});

test("the list screen shows a written diary under its month", async ({ page }) => {
  await page.goto("/diary");
  const submit = page.getByRole("button", { name: "書く", exact: true });
  await expect(submit).toBeDisabled({ timeout: ROUTE_TIMEOUT });

  const body = `E2E の日記一覧 ${Date.now()}`;
  await page.getByLabel("本文").fill(body);
  await submit.click();
  await expect(page.locator(".DiaryCell", { hasText: body })).toBeVisible();

  await page.getByRole("button", { name: "日記一覧へ", exact: true }).click();
  await expect(page).toHaveURL(/\/diary\/list$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator("header")).toContainText("日記一覧");
  const now = new Date();
  await expect(page.locator(".YearSwitcher")).toContainText(`${now.getFullYear()}年`);
  const month = page.locator(".LogGroup", { hasText: `${now.getMonth() + 1}月` });
  const row = month.locator(".DiaryCell", { hasText: body });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${now.getDate()}日`);

  await month.locator(".log-head").click();
  await expect(row).toBeHidden();
});
