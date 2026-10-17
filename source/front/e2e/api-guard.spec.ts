import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// API が要る(.claude/docs/testing.md の「E2E」)。route handler(src/app/api/v1/[...path]/route.ts)の守り

test("クッキーのログインでの書き込みは、よそのサイトから送られたものを断る", async ({ page }) => {
  await ensureRegistered(page);
  const data = { body: `E2E の日記 ${Date.now()}` };

  const crossSite = await page.request.post("/api/v1/diaries", { data, headers: { "sec-fetch-site": "cross-site" } });
  expect(crossSite.status()).toBe(403);
  const sameSite = await page.request.post("/api/v1/diaries", { data, headers: { "sec-fetch-site": "same-site" } });
  expect(sameSite.status()).toBe(403);

  // 読むだけの要求は、よそのサイトからでも通す(書き換えないので)
  const read = await page.request.get("/api/v1/diaries?limit=1", { headers: { "sec-fetch-site": "cross-site" } });
  expect(read.status()).toBe(200);
  // 同じサイトの画面からの書き込みは通す
  const sameOrigin = await page.request.post("/api/v1/diaries", { data, headers: { "sec-fetch-site": "same-origin" } });
  expect(sameOrigin.status()).toBe(201);
});

test("/api/v1 の外を指すパスは流さない", async ({ request }) => {
  const response = await request.get("/api/v1/%2e%2e/%2e%2e/docs");
  expect(response.status()).toBe(404);
});

test("API の応答は CDN やブラウザに溜めさせない", async ({ page, request }) => {
  await ensureRegistered(page);
  for (const response of [await page.request.get("/api/v1/users/me"), await request.get("/api/v1/health")]) {
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
