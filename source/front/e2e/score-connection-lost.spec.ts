import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { shoot, startGame } from "./scoreEntry";

// スマホで画面を消す・アプリを切り替えると、裏で書いている矢の要求が途中で切られる(Failed to fetch)

const ROUTE_TIMEOUT = 15_000;
const ARROW_POSTS = "**/api/v1/ends/*/points";

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

/** 3 本目の矢の登録を切る。lost なら API に届いて書けたあとで、応答だけを失う */
async function dropThirdArrow(page: Page, lost: boolean) {
  let posts = 0;
  await page.route(ARROW_POSTS, async (route) => {
    posts += 1;
    if (posts !== 3) return route.continue();
    if (lost) await route.fetch();
    return route.abort("internetdisconnected");
  });
}

/** 終了してスコア表を開き、1 エンド目の行の点数を返す */
async function finishAndReadFirstEnd(page: Page) {
  await page.getByRole("button", { name: "終了" }).click();
  await expect(page).toHaveURL(/\/score-view\?gameId=/, { timeout: ROUTE_TIMEOUT });
  return page.locator("table tbody tr").first();
}

for (const lost of [false, true]) {
  test(`a dropped arrow write is resent once back online (response lost: ${lost})`, async ({ page }) => {
    await startGame(page, { endSize: 6, roundSize: 6, gameSize: 1 });
    await dropThirdArrow(page, lost);

    await shoot(page, "10", 6);
    const alert = page.locator(".score-entry [role=alert]");
    await expect(alert).toContainText("まだ送れていない矢があります", { timeout: ROUTE_TIMEOUT });

    await page.unroute(ARROW_POSTS);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(alert).toHaveCount(0, { timeout: ROUTE_TIMEOUT });

    // 応答を失った矢を二重に登録しない
    const row = await finishAndReadFirstEnd(page);
    await expect(row.getByText("10", { exact: true })).toHaveCount(6);
    await expect(row.getByText("60", { exact: true })).toHaveCount(2);
  });
}
