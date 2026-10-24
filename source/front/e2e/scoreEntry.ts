import { expect, type Locator, type Page } from "@playwright/test";
import {
  DEFAULT_ARROW_DIAMETER_MM,
  DEFAULT_TARGET_TYPE_ID,
  arrowDiameterPx as toArrowDiameterPx,
  resolveTargetType,
} from "../src/lib/score/scoreConfig";

const ROUTE_TIMEOUT = 15_000;

const DEFAULT_TARGET_SIZE_CM = resolveTargetType(DEFAULT_TARGET_TYPE_ID).sizeCm;

export interface GameSetup {
  bowType?: string;
  endSize?: number;
  roundSize?: number;
  gameSize?: number;
  targetType?: string;
  /** 矢の直径(mm)。省くと既定の 5mm */
  arrowDiameterMm?: number;
}

/** 設定の画面を通って、的をタッチする入力の画面に着く。 */
export async function startGame(page: Page, setup: GameSetup = {}) {
  await page.goto("/game/setup");
  if (setup.bowType) {
    await page.getByRole("group", { name: "弓の種類" }).getByRole("button", { name: setup.bowType }).click();
  }
  if (setup.targetType) {
    await page.getByRole("button", { name: setup.targetType }).click();
  }
  if (setup.endSize !== undefined) {
    await page.getByLabel("1エンドの矢数").fill(String(setup.endSize));
  }
  if (setup.roundSize !== undefined) {
    await page.getByLabel("エンド数").fill(String(setup.roundSize));
  }
  if (setup.gameSize !== undefined) {
    await page.getByLabel("ラウンド数").fill(String(setup.gameSize));
  }
  if (setup.arrowDiameterMm !== undefined) {
    await page.getByLabel("矢の直径").fill(String(setup.arrowDiameterMm));
  }

  await page.getByRole("button", { name: "的で入力" }).click();
  await expect(page).toHaveURL(/\/game\/score-card$/, { timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".ScoreProgress")).toBeVisible({ timeout: ROUTE_TIMEOUT });
  await expect(page.locator(".TargetCircleInput .TargetFace")).toBeVisible({
    timeout: ROUTE_TIMEOUT,
  });
}

/** 的の帯のボタン。点数表の文字("10"・"X"・"M")で引く。 */
export function ringButton(page: Page, label: string) {
  if (label === "M") return page.getByRole("button", { name: "外れ", exact: true });
  const point = label === "X" ? 11 : Number(label);
  return page.getByRole("button", { name: `${point}点`, exact: true });
}

/** 記入画面が矢として扱う円の直径(px)。的(1 点の帯の外径)の大きさとの比で mm を直す */
export async function arrowDiameterPx(
  page: Page,
  arrowDiameterMm = DEFAULT_ARROW_DIAMETER_MM,
  targetSizeCm = DEFAULT_TARGET_SIZE_CM,
) {
  const face = await settledBoundingBox(ringButton(page, "1"));
  return toArrowDiameterPx(arrowDiameterMm, targetSizeCm, face.width);
}

/** 画面に並ぶ、今のエンドの矢。 */
export function recordedArrows(page: Page) {
  return page.locator(".EndView .ArrowValue");
}

/**
 * 帯の位置が落ち着くのを待ってから返す。「このエンドは記録済み」の帯が出入りすると的の枠が
 * 縮み伸びして帯が動き、読んだ直後の位置を押すと隣の帯に当たることがある。
 */
async function settledBoundingBox(button: Locator) {
  let previous = await button.boundingBox();
  for (let i = 0; i < 20; i++) {
    await button.page().waitForTimeout(100);
    const current = await button.boundingBox();
    if (
      previous &&
      current &&
      previous.x === current.x &&
      previous.y === current.y &&
      previous.width === current.width
    ) {
      return current;
    }
    previous = current;
  }
  if (!previous) throw new Error("ring not laid out");
  return previous;
}

/**
 * 的の帯を押して矢を記録する。帯は同心円なので、ボタンの中心でなく、矢の縁が帯の幅の真ん中
 * (内側の帯の外に当たる所)に来る所を狙う。X は中心、外れは的の枠の隅。
 */
export async function shoot(page: Page, label: string, times: number) {
  const button = ringButton(page, label);
  // 矢をまとめて書き込む間は帯が無効のまま、書き終えると「記録済み」の帯が消えて的の大きさが
  // 変わる。有効になってから位置を測らないと、古い大きさで隣の帯を狙い続ける
  await expect(button).toBeEnabled();
  const box = await settledBoundingBox(button);

  // 狙う点(帯の中の位置)。外れは的の枠の隅
  let aim: { x: number; y: number };
  if (label === "M") {
    const face = await page.locator(".TargetCircleInput .TargetFace").boundingBox();
    if (!face) throw new Error("target not laid out");
    aim = { x: face.x + 6, y: face.y + 6 };
  } else if (label === "X") {
    aim = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } else {
    const point = Number(label);
    const outer = box.width / 2;
    // 80cm・40cm の的でも既定の 122cm で見積もる。40cm の的でもずれは 2px に満たず、帯の幅に収まる
    const arrowRadius = (await arrowDiameterPx(page)) / 2;
    // 外側の半径に対する内側の帯の半径の割合。10 の内側は X で、10 の帯の半分
    const innerRatio = point === 10 ? 0.5 : (10 - point) / (11 - point);
    // 矢の縁(中心から矢の半径だけ内側)が帯の真ん中に来るよう、中心は半径のぶん外に置く
    aim = {
      x: box.x + outer + (outer + outer * innerRatio) / 2 + arrowRadius,
      y: box.y + outer,
    };
  }

  for (let i = 0; i < times; i++) {
    const before = await recordedArrows(page).count();
    await page.mouse.click(aim.x, aim.y);
    // エンドが満ちても次のエンドへは進まない(nextEnd で進む)
    await expect(recordedArrows(page)).toHaveCount(before + 1, { timeout: 10_000 });
  }
}

/** 今のエンドの番号。上の段には出さないので、エンドごとの点数の帯で強調したマスから読む */
export function currentEndNumber(page: Page): Locator {
  return page.locator(".RoundTotalsBar .EndTotalCell.current .number");
}

/** 「1エンド進む」を押し、ラウンドかエンドの位置が変わるのを待つ。 */
export async function nextEnd(page: Page) {
  const round = page.locator(".ScoreProgress");
  const end = currentEndNumber(page);
  const before = `${await round.innerText()}|${await end.innerText()}`;
  await page.getByRole("button", { name: "1エンド進む", exact: true }).click();
  await expect
    .poll(async () => `${await round.innerText()}|${await end.innerText()}`)
    .not.toBe(before);
}

/**
 * 読み込み直す。入力の画面の記録は手元のキャッシュにあり、保存しなくても読み込み直しで戻る。
 * 画面は beforeunload で引き止めるが、Playwright の reload はそれを通らない。
 */
export async function reloadPage(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.reload();
}

/** 入力の画面の「終了」を押し、送った PUT /games/sheet の応答(保存したゲーム)を返す。結果の画面に移るまで待つ。 */
export async function finishSheet(page: Page) {
  const response = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().endsWith("/api/v1/games/sheet"),
  );
  await page.getByRole("button", { name: "終了" }).click();
  const saved = (await (await response).json()) as { id: number };
  await expect(page).toHaveURL(new RegExp(`/score-view/?\\?gameId=${saved.id}$`), {
    timeout: ROUTE_TIMEOUT,
  });
  return saved;
}
