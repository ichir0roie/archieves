import { expect, type Locator, type Page } from "@playwright/test";

const ROUTE_TIMEOUT = 15_000;

export interface GameSetup {
  bowType?: string;
  endSize?: number;
  roundSize?: number;
  gameSize?: number;
  targetType?: string;
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
    await page.getByLabel("1エンドの矢数").selectOption(String(setup.endSize));
  }
  if (setup.roundSize !== undefined) {
    await page.getByLabel("エンド数").selectOption(String(setup.roundSize));
  }
  if (setup.gameSize !== undefined) {
    await page.getByLabel("ラウンド数").selectOption(String(setup.gameSize));
  }

  await page.getByRole("button", { name: "記録開始" }).click();
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
 * 的の帯を押して矢を記録する。帯は同心円で内側の帯が上に重なるので、ボタンの中心でなく
 * 帯の幅の真ん中(内側の帯の外に当たる所)を押す。X は中心、外れは的の枠の隅。
 */
export async function shoot(page: Page, label: string, times: number) {
  const button = ringButton(page, label);
  // 矢をまとめて書き込む間は帯が無効のまま、書き終えると「記録済み」の帯が消えて的の大きさが
  // 変わる。有効になってから位置を測らないと、古い大きさで隣の帯を押し続ける
  await expect(button).toBeEnabled();
  const box = await settledBoundingBox(button);

  let position: { x: number; y: number };
  if (label === "M") {
    position = { x: 6, y: 6 };
  } else if (label === "X") {
    position = { x: box.width / 2, y: box.height / 2 };
  } else {
    const point = Number(label);
    const outer = box.width / 2;
    // 外側の半径に対する内側の帯の半径の割合。10 の内側は X で、10 の帯の半分
    const innerRatio = point === 10 ? 0.5 : (10 - point) / (11 - point);
    position = { x: outer + (outer + outer * innerRatio) / 2, y: outer };
  }

  for (let i = 0; i < times; i++) {
    const before = await recordedArrows(page).count();
    await button.click({ position });
    await expect(recordedArrows(page)).toHaveCount(before + 1, { timeout: 10_000 });
  }
}
