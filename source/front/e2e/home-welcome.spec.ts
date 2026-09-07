import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

test("home page greets the signed-in user with their database name", async ({ page }) => {
  await ensureRegistered(page);

  await page.getByLabel("名前").fill("データベース太郎");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました")).toBeVisible({ timeout: 15_000 });

  await page.goto("/");
  await expect(page.getByText("ようこそ、データベース太郎 さん")).toBeVisible({
    timeout: 15_000,
  });
});
