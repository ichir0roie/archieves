import { expect, type Page } from "@playwright/test";

/** 写真に描くノックの色。登録の画面は、押した所の鮮やかな画素を平均するので、この色に近い値になる */
export const NOCK_RGB = [57, 255, 20] as const;

/** ブラウザで描いた、中央にノックの写った矢の写真(JPEG) */
export async function arrowJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(([r, g, b]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    // 畳の色の上に、黒い軸と、中央のノック
    context.fillStyle = "#b08a50";
    context.fillRect(0, 0, 600, 800);
    context.fillStyle = "#202020";
    context.fillRect(290, 400, 20, 400);
    context.fillStyle = `rgb(${r}, ${g}, ${b})`;
    context.beginPath();
    context.arc(300, 400, 40, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL("image/jpeg", 0.95);
  }, NOCK_RGB);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** 設定の欄の「矢の色登録」から、矢の写真を撮り、ノック(写真の中央)を押して登録する */
export async function registerNockColor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "矢の色登録" }).click();
  const dialog = page.getByRole("dialog", { name: "矢の色登録" });
  await dialog.locator("input[type=file]").setInputFiles({
    name: "arrow.jpg",
    mimeType: "image/jpeg",
    buffer: await arrowJpeg(page),
  });
  // 写真は枠に収めて真ん中に描くので、枠の真ん中が写真の中央(ノック)
  const frame = dialog.locator(".NockColorFrame");
  await expect(frame.locator("canvas")).toBeVisible();
  await frame.click();
  await dialog.getByRole("button", { name: "登録", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".NockColorSwatch")).toBeVisible();
}
