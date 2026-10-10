import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E").

const ROUTE_TIMEOUT = 15_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("a sent feedback shows up in the list, awaiting a reply", async ({ page }) => {
  await page.goto("/feedback");
  await expect(page.locator("header")).toContainText("意見箱", { timeout: ROUTE_TIMEOUT });

  const submit = page.getByRole("button", { name: "送信", exact: true });
  await expect(submit).toBeDisabled();

  // spec は一つの db に並べて走るので、このテストが送ったものを一意の文で探す
  const body = `E2E の意見 ${Date.now()}`;
  await page.getByLabel("内容").fill(body);
  await page.getByLabel("返信先のメールアドレス").fill("e2e@example.com");
  await submit.click();

  await expect(page.getByText("送信しました")).toBeVisible();
  await expect(page.getByLabel("内容")).toHaveValue("");
  const item = page.locator(".FeedbackItem", { hasText: body });
  await expect(item).toBeVisible();
  await expect(item).toContainText("返信待ち");
});

test("the announcements screen lists the announcements", async ({ page }) => {
  // 共有の db にお知らせを書く API は無いので、応答を差し替えて画面の出し方だけを確かめる
  await page.route("**/announcements", (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          published_at: "2026-10-01T09:00:00Z",
          body: "メンテナンスのお知らせ",
        },
      ],
    }),
  );
  await page.goto("/announcements");

  await expect(page.locator(".Announcements")).toContainText("メンテナンスのお知らせ", {
    timeout: ROUTE_TIMEOUT,
  });
});
