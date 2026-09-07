import { expect, test } from "@playwright/test";

test("holds mock-auth home page with primary navigation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Archieves" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "スコア記録を開始" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "スコア記録を開始" }).click();

  // First navigation into a route dev-compiles it on demand (Turbopack),
  // which can take well past the default 5s assertion timeout.
  await expect(page).toHaveURL(/\/game$/, { timeout: 15_000 });
});
