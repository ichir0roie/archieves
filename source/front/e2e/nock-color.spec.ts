import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { NOCK_RGB, arrowJpeg, registerNockColor } from "./nockColor";

// 矢の色登録: 設定の画面から矢の写真を撮り、拡大してノックを押して、ノックの色を測って登録する。
// 写真モードは、ノックの色を登録するまで始められない

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

function photoModeButton(page: import("@playwright/test").Page) {
  return page.getByRole("group", { name: "入れ方" }).getByRole("button", { name: "写真" });
}

test("photo mode cannot start until the nock color is registered", async ({ page }) => {
  await page.goto("/game/setup");
  await expect(page.locator(".NockColorUnregistered")).toHaveText("未登録");

  await photoModeButton(page).click();

  await expect(page.locator(".PhotoNeedsNockColor")).toBeVisible();
  await expect(page.getByRole("button", { name: "ゲーム開始" })).toBeDisabled();

  await registerNockColor(page);

  await expect(page.locator(".PhotoNeedsNockColor")).toBeHidden();
  await expect(page.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();
});

test("the nock color is measured from the tapped spots of the arrow photo", async ({ page }) => {
  await page.goto("/game/setup");
  await page.getByRole("button", { name: "矢の色登録" }).click();
  const dialog = page.getByRole("dialog", { name: "矢の色登録" });
  // 写真を撮るまでは、押す所も登録も無い
  await expect(dialog.getByRole("button", { name: "登録", exact: true })).toBeDisabled();

  await dialog.locator("input[type=file]").setInputFiles({
    name: "arrow.jpg",
    mimeType: "image/jpeg",
    buffer: await arrowJpeg(page),
  });
  const frame = dialog.locator(".NockColorFrame");
  await expect(frame.locator("canvas")).toBeVisible();

  // 拡大しても、枠の真ん中は写真の中央のまま(ボタンは枠の真ん中を中心に拡大する)
  await dialog.getByRole("button", { name: "拡大する" }).click();
  await dialog.getByRole("button", { name: "拡大する" }).click();
  await frame.click();
  // 軸(黒)を押した所は、一覧から消せる
  const box = await frame.boundingBox();
  if (!box) throw new Error("no frame");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + box.height * 0.35);
  await expect(dialog.locator(".NockSample")).toHaveCount(2);
  await dialog.getByRole("button", { name: "2 番目を消す" }).click();
  await expect(dialog.locator(".NockSample")).toHaveCount(1);

  await dialog.getByRole("button", { name: "登録", exact: true }).click();

  // 登録した色は、描いたノックの色に近い
  const swatch = page.locator(".NockColorSwatch");
  await expect(swatch).toBeVisible();
  const label = (await swatch.getAttribute("aria-label")) ?? "";
  const hex = label.match(/#[0-9a-f]{6}/)?.[0];
  expect(hex).toBeDefined();
  const rgb = [1, 3, 5].map((i) => parseInt(hex!.slice(i, i + 2), 16));
  rgb.forEach((value, i) => expect(Math.abs(value - NOCK_RGB[i])).toBeLessThan(30));
});

test("the registered nock color is kept for the next game", async ({ page }) => {
  await page.goto("/game/setup");
  await page.getByLabel("1エンドの矢数").fill("6");
  await registerNockColor(page);
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/);

  await page.goto("/game/setup");

  await expect(page.locator(".NockColorSwatch")).toBeVisible();
});
