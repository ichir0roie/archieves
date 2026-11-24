import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { registerNockColor } from "./nockColor";
import { finishSheet, recordedArrows, shoot } from "./scoreEntry";

// 写真モード: エンドごとに写真を撮って進み(点数は付けない)、最後に写真を見ながら的で矢を入れて直す。
// 写真はその場でブラウザが処理して(的の補正と矢の推測)端末に置き、裏で API へ送る(テスト用の API は手元の置き場)

const ROUTE_TIMEOUT = 15_000;
const PROCESS_TIMEOUT = 30_000;

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

/** ブラウザで描いた的の JPEG(矢は無い) */
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
  // 写真モードは、ノックの色を登録するまで始められない
  await registerNockColor(page);
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".PhotoCaptureInput")).toBeVisible({ timeout: ROUTE_TIMEOUT });
}

/** 緑のノックの矢が 4 本刺さった的の写真(e2e/photoSamples.ts の four-arrows) */
function fourArrowsPng(): Buffer {
  return readFileSync(path.join(__dirname, "fixtures", "photos", "four-arrows.png"));
}

/** 置き場への送り(元の写真・表示の画像)。手元の置き場では、送る先のキーを道に載せる */
const FILE_UPLOAD = /\/photos\/\d+\/file(\?|$)/;

async function takePhoto(page: Page) {
  await page.locator(".PhotoCaptureInput input[type=file]").setInputFiles({
    name: "end.jpg",
    mimeType: "image/jpeg",
    buffer: await targetJpeg(page),
  });
}

test("a photo over the size limit is refused when taken and is not sent", async ({ page }) => {
  await startPhotoGame(page);
  const started: string[] = [];
  page.on("request", (request) => {
    if (/\/ends\/\d+\/photo$/.test(request.url())) started.push(request.url());
  });

  // JPEG はそのまま送るので、中身を読まずに大きさだけで断る(lib/photo/photoStore.ts の PHOTO_MAX_BYTES)
  await page.locator(".PhotoCaptureInput input[type=file]").setInputFiles({
    name: "huge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(30 * 1024 * 1024 + 1),
  });

  await expect(page.getByText("写真が大きすぎます。撮り直してください")).toBeVisible();
  await expect(page.locator(".PhotoEmpty")).toBeVisible();
  await expect(page.locator(".PhotoPending")).toHaveCount(0);
  expect(started).toEqual([]);
});

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
  const handles = page.locator(".PhotoAlignment svg circle.alignment-handle");
  await expect(handles).toHaveCount(4);
  const handle = await handles.first().boundingBox();
  if (!handle) throw new Error("alignment handle not laid out");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 10, { steps: 4 });
  await page.mouse.up();
  // 元の写真をブラウザで処理し直し、表示の画像を送ってから、結果を書く
  const realigned = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/photos\/\d+\/analysis$/.test(r.url()),
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

/** 入力の途中のゲームの id(保存したあと)。写真を送るときに記録を保存するので、撮ったあとなら付いている */
async function cachedGameId(page: Page): Promise<number> {
  const id = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("scoreSheet:"));
    return key ? (JSON.parse(localStorage.getItem(key) ?? "null")?.sheet?.id ?? null) : null;
  });
  if (typeof id !== "number") throw new Error("game is not saved yet");
  return id;
}

test("shooting shows the estimate marks and points to review after the last end's photo", async ({
  page,
}) => {
  await startPhotoGame(page);

  await takePhoto(page);
  await expect(page.locator(".PhotoStatus.processed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  // 補正できた写真には、推測の印を重ねる枠を出す(描いた的には矢が無いので印は 0)
  await expect(page.locator(".PhotoEstimateMarks")).toBeAttached();
  await expect(page.locator(".PhotoEstimateMarks .photo-estimate-mark")).toHaveCount(0);
  // まだ撮るエンドが残っているうちは、補正へを目立たせない
  await expect(page.locator(".PhotoToReview")).not.toHaveClass(/success/);

  // 撮り終えたエンドでは「次のエンドを撮る」で、次のエンドへ進んでそのままカメラを開く
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "次のエンドを撮る" }).click();
  await (await chooser).setFiles({
    name: "end.jpg",
    mimeType: "image/jpeg",
    buffer: await targetJpeg(page),
  });
  await expect(page.locator(".RoundTotalsBar .EndTotalCell.current .number")).toHaveText("2");
  await expect(page.locator(".PhotoStatus.processed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  // 最後のエンドは先が無いので、撮り直すだけにして、補正へを目立たせる
  await expect(page.getByRole("button", { name: "次のエンドを撮る" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撮り直す" })).toBeVisible();
  await expect(page.locator(".PhotoToReview")).toHaveClass(/success/);
});

test("a photo whose result could not be saved does not hold back the next one and is saved later", async ({
  page,
}) => {
  await startPhotoGame(page);
  // 結果の書き込みだけを落とす(API の一時的な不具合など)
  await page.route("**/api/v1/photos/*/analysis", (route) =>
    route.fulfill({ status: 502, body: "Bad Gateway" }),
  );

  await takePhoto(page);
  await expect(page.locator(".PhotoStatus.processFailed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  const secondUpload = page.waitForResponse(
    (r) => r.request().method() === "PUT" && FILE_UPLOAD.test(r.url()),
  );
  await takePhoto(page);
  // 1 枚目の結果を書けないままでも、2 枚目は置き場まで送る
  expect((await secondUpload).status()).toBe(204);

  // 撮った画面を離れても、ゲームの元の写真の一覧を開けば、元の写真を処理し直して結果を書く
  const gameId = await cachedGameId(page);
  await page.unroute("**/api/v1/photos/*/analysis");
  await page.goto(`/score-view/photos?gameId=${gameId}`);
  await expect(page.locator(".GamePhoto")).toHaveCount(2);
  await expect(page.locator(".GamePhoto img")).toHaveCount(2, { timeout: PROCESS_TIMEOUT });
});

test("the arrows are estimated on the device right after the photo, even without a connection", async ({
  page,
}) => {
  await startPhotoGame(page);
  // 電波が無い(受け付けが届かない)
  await page.route("**/api/v1/ends/*/photo", (route) => route.abort("internetdisconnected"));

  await page.locator(".PhotoCaptureInput input[type=file]").setInputFiles({
    name: "end.png",
    mimeType: "image/png",
    buffer: fourArrowsPng(),
  });

  // 送れなくても、端末で補正した画像に推測の印を重ねて、推測した本数を出す
  await expect(page.locator(".PhotoStatus.sendFailed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  await expect(page.locator(".PhotoEstimateMarks .photo-estimate-mark")).toHaveCount(4);
  await expect(page.locator(".PhotoStatus")).toContainText("推測した矢 4 本");
  await expect(page.locator(".PhotoPending")).toBeVisible();

  // 電波が戻ったら送り、結果を書く
  await page.unroute("**/api/v1/ends/*/photo");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".PhotoStatus.processed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  await expect(page.locator(".PhotoEstimateMarks .photo-estimate-mark")).toHaveCount(4);
  await expect(page.locator(".PhotoPending")).toHaveCount(0);
});

test("a photo game reopened from the score view goes back to shooting", async ({ page }) => {
  await startPhotoGame(page);
  await takePhoto(page);
  await expect(page.locator(".PhotoStatus.processed")).toBeVisible({ timeout: PROCESS_TIMEOUT });
  const gameId = await cachedGameId(page);

  await page.goto(`/score-view?gameId=${gameId}`);
  await page.getByRole("button", { name: "編集(入力画面に戻る)" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });

  // 写真を撮ったエンドの次を、撮影で開く
  await expect(page.locator(".PhotoPhaseBadge")).toHaveText("撮影");
  await expect(page.locator(".RoundTotalsBar .EndTotalCell.current .number")).toHaveText("2");
  await expect(page.locator(".PhotoEmpty")).toBeVisible();
});

test("the input mode chosen at setup is kept for the next game", async ({ page }) => {
  await startPhotoGame(page);

  await page.goto("/game/setup");

  await expect(
    page.getByRole("group", { name: "入れ方" }).getByRole("button", { name: "写真" }),
  ).toHaveAttribute("aria-pressed", "true");
});
