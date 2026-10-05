import { defineConfig, devices } from "@playwright/test";

// ユーザが起こしている next dev(:3000, .next)と別のポート・ビルド先で起こす。
// 同じだと reuseExistingServer がそちらを使い回し、API の向け先も古いままになる
const webPort = Number(process.env.ARCHIEVES_E2E_WEB_PORT ?? 13000);
// 既定はテスト用の API サーバー(source/back/debug/test_env/run_test_api_server.py)
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${webPort}`,
    url: `http://localhost:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ARCHIEVES_WEB_DIST_DIR: ".next-test",
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_MOCK_USER_SUB: "local-dev-user",
      NEXT_PUBLIC_MOCK_USER_USERNAME: "local-dev-user",
      NEXT_PUBLIC_MOCK_USER_EMAIL: "dev@example.com",
    },
  },
});
