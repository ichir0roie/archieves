import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";
import { recordGame } from "./recordGame";

// API が要る(.claude/docs/testing.md の「E2E」)。トークンの発行には数の上限があり、db は E2E をまたいで
// 残るので、この spec のトークンは終わりに消す(落ちて残ったものは次の回の初めに消す)
const TOKEN_NAME = "E2E AIコメント";

test("Claude Code がトークンで書いた AIコメントをスコアの最後に出し、消すと枠ごと消える", async ({ page, request }) => {
  await ensureRegistered(page);
  for (const token of await (await page.request.get("/api/v1/access-tokens")).json()) {
    if (token.name === TOKEN_NAME) await page.request.delete(`/api/v1/access-tokens/${token.id}`);
  }
  const game = await recordGame(page);
  const issued = await (await page.request.post("/api/v1/access-tokens", { data: { name: TOKEN_NAME } })).json();
  const auth = { Authorization: `Bearer ${issued.token}` };

  try {
    const panel = page.locator(".AiComment");
    // 書く前は、AIコメントの枠を出さない(機能があることも見せない)
    await page.goto(`/score-view?gameId=${game.id}`);
    await expect(page.locator(".GameSummary")).toBeVisible();
    await expect(panel).toHaveCount(0);

    // Claude Code がする読み書き(ブラウザのログインを持たない request で、トークンだけを付ける)
    const sheets = await request.get("/api/v1/games/sheets?limit=30", { headers: auth });
    expect(sheets.status()).toBe(200);
    expect((await sheets.json()).map((s: { id: number }) => s.id)).toContain(Number(game.id));
    const body = `E2E の AIコメント ${Date.now()}\n- 後半のエンドで右上に散っています`;
    const written = await request.put(`/api/v1/games/${game.id}/ai-comment`, {
      headers: auth,
      data: { body },
    });
    expect(written.status()).toBe(200);

    await page.goto(`/score-view?gameId=${game.id}`);
    await expect(panel.locator(".AiCommentText")).toHaveText(body);
    await expect(panel).toContainText(TOKEN_NAME);

    await panel.getByRole("button", { name: "AIコメントを削除" }).click();
    // 無いときは枠ごと出さない
    await expect(panel).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/access-tokens/${issued.id}`);
  }
});
