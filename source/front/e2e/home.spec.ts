import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

test("holds mock-auth home page without navigation buttons", async ({
  page,
}) => {
  await ensureRegistered(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Archieves" }),
  ).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(0);
});
