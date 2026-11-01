import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// スコアの点数表で、エンドの行を押すとそのエンドの矢だけを的に描いたモーダルが開く(RoundScoreSheet)

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

test("tapping an end row opens the target with only that end's arrows", async ({ page }) => {
  await recordGame(page, { score: "9", arrows: 6 });

  const sheet = page.locator(".RoundScoreSheet").first();
  // 番号でなく、行の中の点数の所を押しても開く
  await sheet.locator(".EndRow").first().locator("td").nth(2).click();

  const dialog = page.getByRole("dialog", { name: "ラウンド 1 エンド 1" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".arrow-chip")).toHaveCount(6);
  await expect(dialog.locator(".arrow-chip").first()).toHaveText("9");
  await expect(dialog.locator(".end-map-total")).toContainText("54");
  const map = dialog.getByRole("img", { name: "このエンドの矢の位置" });
  await expect(map).toBeVisible();
  // 的の帯(X〜1 の 11 本)に、矢の 6 本を重ねる
  await expect(map.locator("circle")).toHaveCount(11 + 6);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the end-number button opens the end's target and the comment icon does not", async ({
  page,
}) => {
  await recordGame(page, { score: "10", arrows: 3 });

  await page.getByRole("button", { name: "エンド 1のコメントを入力" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "エンド 1のコメント" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "エンド 1の矢の位置を開く" }).click();
  await expect(page.getByRole("dialog", { name: "ラウンド 1 エンド 1" })).toBeVisible();
});
