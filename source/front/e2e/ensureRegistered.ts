import type { Page } from "@playwright/test";

/**
 * archieves-api's AuthGate bounces any authenticated page but
 * /profile/settings to /profile/settings the first time the mock user has
 * no matching row, since /profile/settings itself registers on load.
 * Visiting it first keeps other tests' navigation deterministic when run
 * against a real archieves-api.
 */
export async function ensureRegistered(page: Page): Promise<void> {
  await page.goto("/profile/settings");
  await page.getByLabel("名前").waitFor({ state: "visible", timeout: 15_000 });
}
