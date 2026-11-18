import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { finishSheet, recordedArrows, shoot } from "./scoreEntry";

// 写真モード: エンドごとに写真を撮って進み(点数は付けない)、最後に写真を見ながら的で矢を入れて直す。
// 写真は端末に置いてから裏で送り、API が表示の画像を作る(テスト用の API は手元の置き場)

const ROUTE_TIMEOUT = 15_000;
const PROCESS_TIMEOUT = 30_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

/** ブラウザで描いた的の JPEG。API の Pillow が読める本物の画像にする */
async function targetJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#789070";
    context.fillRect(0, 0, 600, 800);
    for (const [radius, color] of [
      [250, "#fafafa"],
      [200, "#141414"],
      [150, "#2878e6"],
      [100, "#e62828"],
      [50, "#ffd700"],
    ] as const) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(300, 400, radius, 0, Math.PI * 2);
      context.fill();
    }
    return canvas.toDataURL("image/jpeg", 0.9);
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function startPhotoGame(page: Page) {
  await page.goto("/game/setup");
  await page.getByLabel("1エンドの矢数").fill("6");
  await page.getByLabel("エンド数").fill("2");
  await page.getByLabel("ラウンド数").fill("1");
  await page.getByRole("group", { name: "入れ方" }).getByRole("button", { name: "写真" }).click();
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".PhotoCaptureInput")).toBeVisible({ timeout: ROUTE_TIMEOUT });
}

async function takePhoto(page: Page) {
  await page.locator(".PhotoCaptureInput input[type=file]").setInputFiles({
    name: "end.jpg",
    mimeType: "image/jpeg",
    buffer: await targetJpeg(page),
  });
}

test("photos are taken per end, then reviewed on the target and listed with the game", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await startPhotoGame(page);

  // 撮影では点数を付けず、写真を撮って進むだけ
  await expect(page.locator(".PhotoPhaseBadge")).toHaveText("撮影");
  await expect(page.getByRole("button", { name: "1矢戻る" })).toHaveCount(0);
  await takePhoto(page);
  await expect(page.locator(".PhotoStatus.processed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  await expect(page.locator(".PhotoPreview img")).toBeVisible();
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  await expect(page.locator(".PhotoEmpty")).toBeVisible();

  // 補正は最初のエンドから。写真は隅に出て、押すと大きく見られる
  await page.locator(".PhotoToReview").click();
  await expect(page.locator(".PhotoPhaseBadge")).toHaveText("補正");
  await expect(page.locator(".TargetCircleInput .TargetFace")).toBeVisible();
  await expect(page.locator(".RoundTotalsBar .EndTotalCell.current .number")).toHaveText("1");
  await page.locator(".TargetPhotoThumb").click();
  await expect(page.locator(".PhotoViewer img")).toBeVisible();
  await page.locator(".PhotoViewerClose").click();
  await expect(page.locator(".PhotoViewer")).toHaveCount(0);

  // 的を手で合わせ直す: 元の写真に 4 点と輪が出て、点を動かして保存すると補正し直す
  await page.locator(".TargetAlignButton").click();
  const handles = page.locator(".PhotoAlignment svg circle");
  await expect(handles).toHaveCount(4);
  const handle = await handles.first().boundingBox();
  if (!handle) throw new Error("alignment handle not laid out");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 10, { steps: 4 });
  await page.mouse.up();
  const realigned = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/photos\/\d+\/alignment$/.test(r.url()),
  );
  await page.locator(".PhotoAlignmentSave").click();
  expect((await realigned).status()).toBe(200);
  await expect(page.locator(".PhotoAlignment")).toHaveCount(0);

  await shoot(page, "10", 6);
  await expect(recordedArrows(page).first()).toHaveText("10");

  // 満ちたエンドでは、矢の近くを押して引きずると、その矢を動かす(外へ動かして点を下げる)。
  // 6 本は同じ所に重なっているので、上に描いた最後の矢を掴む
  const mark = await page.locator(".TargetFace .arrow-mark").last().boundingBox();
  if (!mark) throw new Error("arrow mark not laid out");
  const x = mark.x + mark.width / 2;
  const y = mark.y + mark.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 150, { steps: 6 });
  await page.mouse.up();
  await expect(recordedArrows(page)).toHaveCount(6);
  await expect(recordedArrows(page).last()).not.toHaveText("10");
  await expect(recordedArrows(page).first()).toHaveText("10");

  const saved = await finishSheet(page);

  // スコアの画面から、元の写真の一覧と、写真を見ての補正へ行ける
  await page.locator(".GamePhotosLink").click();
  await expect(page).toHaveURL(new RegExp(`/score-view/photos\\?gameId=${saved.id}$`), {
    timeout: ROUTE_TIMEOUT,
  });
  await expect(page.locator(".GamePhoto")).toHaveCount(1);
  await expect(page.locator(".GamePhoto")).toContainText("ラウンド 1 エンド 1");
  await expect(page.locator(".GamePhoto img")).toBeVisible();

  await page.goBack();
  await page.locator(".ReviewWithPhotosButton").click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".PhotoPhaseBadge")).toHaveText("補正");
  await expect(page.locator(".TargetPhotoThumb")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(recordedArrows(page)).toHaveCount(6);
});

test("the input mode chosen at setup is kept for the next game", async ({ page }) => {
  await startPhotoGame(page);

  await page.goto("/game/setup");

  await expect(
    page.getByRole("group", { name: "入れ方" }).getByRole("button", { name: "写真" }),
  ).toHaveAttribute("aria-pressed", "true");
});
