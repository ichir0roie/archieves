import { expect, test } from "@playwright/test";
import { ensureRegistered } from "./ensureRegistered";

// Needs archieves-api running (see .claude/docs/testing.md's "E2E").
// 自分がランキングに載るかは公開範囲の保存が要るので、profile-settings.spec.ts で確かめる

test.beforeEach(async ({ page }) => {
  await ensureRegistered(page);
});

/** 画面の操作が API の絞り込みに渡ることを、送った要求で確かめる */
function rankingRequest(page: import("@playwright/test").Page) {
  return page.waitForRequest((request) => request.url().includes("/public/ranking"));
}

test("the ranking starts on this month's total score", async ({ page }) => {
  const request = rankingRequest(page);
  await page.goto("/ranking");

  const url = new URL((await request).url());
  expect(url.searchParams.get("metric")).toBe("total_score");
  expect(url.searchParams.get("start")).toMatch(/^\d{4}-\d{2}-01$/);
  expect(url.searchParams.get("end")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(url.searchParams.has("bow_type")).toBe(false);
  expect(url.searchParams.has("distance_m")).toBe(false);
});

test("each axis of the ranking is sent to the API", async ({ page }) => {
  // 開いたときの読み込みを先に待つ。待たないと、下の待ち受けが年間の要求の代わりにそれを拾う
  const initial = rankingRequest(page);
  await page.goto("/ranking");
  await initial;

  let request = rankingRequest(page);
  await page.getByRole("group", { name: "期間" }).getByRole("button", { name: "年間" }).click();
  let url = new URL((await request).url());
  expect(url.searchParams.get("start")).toMatch(/^\d{4}-01-01$/);
  expect(url.searchParams.get("end")).toMatch(/^\d{4}-12-31$/);

  request = rankingRequest(page);
  await page.getByRole("group", { name: "期間" }).getByRole("button", { name: "全期間" }).click();
  url = new URL((await request).url());
  expect(url.searchParams.has("start")).toBe(false);
  expect(url.searchParams.has("end")).toBe(false);

  request = rankingRequest(page);
  await page.getByRole("group", { name: "順位の基準" }).getByRole("button", { name: "矢平均" }).click();
  url = new URL((await request).url());
  expect(url.searchParams.get("metric")).toBe("average_point_score");

  request = rankingRequest(page);
  await page.getByRole("group", { name: "弓の種類" }).getByRole("button", { name: "ベアボウ" }).click();
  url = new URL((await request).url());
  expect(url.searchParams.get("bow_type")).toBe("barebow");

  request = rankingRequest(page);
  await page.getByLabel("距離").click();
  await page.getByRole("button", { name: "70m", exact: true }).click();
  url = new URL((await request).url());
  expect(url.searchParams.get("distance_m")).toBe("70");
});
