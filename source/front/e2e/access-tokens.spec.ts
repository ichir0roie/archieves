import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// API が要る(.claude/docs/testing.md の「E2E」)。発行できる数に上限があり、db は E2E をまたいで残るので、
// 前に落ちて残ったこの spec のトークンを先に消す
const NAME_PREFIX = "E2E トークン";

async function revokeLeftovers(page: Page) {
  const listed = await page.request.get("/api/v1/access-tokens");
  expect(listed.ok()).toBeTruthy();
  for (const token of await listed.json()) {
    if (token.name.startsWith(NAME_PREFIX)) {
      await page.request.delete(`/api/v1/access-tokens/${token.id}`);
    }
  }
}

async function statusOf(request: APIRequestContext, method: "GET" | "DELETE", path: string, token: string) {
  const response = await request.fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.status();
}

test("発行したトークンで本人の記録を読め、書き込み・他人を見る画面・失効のあとは通らない", async ({ page, request }) => {
  await ensureRegistered(page);
  await revokeLeftovers(page);
  const game = await recordGame(page);

  await page.goto("/settings");
  const panel = page.locator(".AccessTokens");
  const name = `${NAME_PREFIX} ${Date.now()}`;
  await panel.getByLabel("名前").fill(name);
  await panel.getByRole("group", { name: "有効期限" }).getByRole("button", { name: "30日" }).click();
  await panel.getByRole("button", { name: "トークンを発行する" }).click();

  const issued = panel.locator(".AccessTokenIssued");
  // Claude Code on the web の環境に入れる、network secret の値・ホストと環境変数
  const token = await issued.getByLabel("トークン(network secret の値)").inputValue();
  expect(token).toMatch(/^arc_/);
  await expect(issued.getByLabel("network secret のホスト")).toHaveValue(new URL(page.url()).host);
  await expect(issued.getByLabel("環境変数")).toHaveValue(`ARCHIEVES_API_URL=${new URL(page.url()).origin}/api/v1`);
  await expect(panel.locator(".AccessTokenItem", { hasText: name })).toBeVisible();

  // request はブラウザのログインを持たない。トークンだけで route handler を通る
  const games = await request.get("/api/v1/games?limit=100000", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(games.status()).toBe(200);
  expect((await games.json()).map((g: { id: number }) => g.id)).toContain(Number(game.id));
  expect(await statusOf(request, "GET", `/api/v1/games/${game.id}/sheet`, token)).toBe(200);
  expect(await statusOf(request, "GET", "/api/v1/statistics/rounds/summary", token)).toBe(200);
  expect(await statusOf(request, "GET", "/api/v1/openapi.json", token)).toBe(200);
  expect(await statusOf(request, "GET", "/api/v1/guide", token)).toBe(200);
  expect(await statusOf(request, "DELETE", `/api/v1/games/${game.id}`, token)).toBe(403);
  expect(await statusOf(request, "GET", "/api/v1/access-tokens", token)).toBe(403);
  expect(await statusOf(request, "GET", "/api/v1/public/ranking", token)).toBe(403);
  // 一度しか見せないので、閉じたら平文は画面から消える
  await issued.getByRole("button", { name: "閉じる" }).click();
  await expect(issued).toHaveCount(0);

  await panel.locator(".AccessTokenItem", { hasText: name }).getByRole("button", { name: "失効させる" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "失効させる" }).click();
  await expect(panel.locator(".AccessTokenItem", { hasText: name })).toHaveCount(0);
  expect(await statusOf(request, "GET", "/api/v1/games", token)).toBe(401);
});
