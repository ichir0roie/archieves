import { expect, test, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordedArrows, saveSheet, shoot, startGame } from "./scoreEntry";

// 記録は手元に溜め、保存・終了のときに PUT /games/sheet で一度に送る。スマホで画面を消す・
// アプリを切り替えると、その要求が途中で切られる(Failed to fetch)

const ROUTE_TIMEOUT = 15_000;
const SHEET = "**/api/v1/games/sheet";

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

/** 次の保存を一度だけ切る。lost なら API に届いて書けたあとで応答だけを失い、書けたゲームの id を返す */
async function dropNextSave(page: Page, lost: boolean): Promise<{ savedId: number | null }> {
  const result: { savedId: number | null } = { savedId: null };
  await page.route(
    SHEET,
    async (route) => {
      if (lost) {
        const response = await route.fetch();
        result.savedId = (await response.json()).id;
      }
      await route.abort("internetdisconnected");
    },
    { times: 1 },
  );
  return result;
}

for (const lost of [false, true]) {
  test(`a failed save keeps the scores and saving again writes one game (response lost: ${lost})`, async ({
    page,
  }) => {
    await startGame(page, { endSize: 6, roundSize: 6, gameSize: 1 });
    await shoot(page, "10", 6);

    const dropped = await dropNextSave(page, lost);
    await page.locator(".ScoreSave").click();
    await expect(page.locator(".score-entry [role=alert]")).toBeVisible({ timeout: ROUTE_TIMEOUT });
    // 送れなかった記録は手元に残り、保存していない印のまま
    await expect(recordedArrows(page)).toHaveCount(6);
    await expect(page.locator(".ScoreSave")).toHaveText("保存");

    const saved = await saveSheet(page);
    await expect(page.locator(".score-entry [role=alert]")).toHaveCount(0);
    // 応答を失った保存が API に届いていても、同じゲームを上書きして二つ作らない
    if (dropped.savedId !== null) expect(saved.id).toBe(dropped.savedId);

    await page.getByRole("button", { name: "終了" }).click();
    await expect(page).toHaveURL(new RegExp(`/score-view/?\\?gameId=${saved.id}$`), {
      timeout: ROUTE_TIMEOUT,
    });
    const row = page.locator("table tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row.getByText("10", { exact: true })).toHaveCount(6);
  });
}
