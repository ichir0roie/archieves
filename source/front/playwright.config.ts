import { defineConfig, devices } from "@playwright/test";

// ユーザが起こしている next dev(:3100, .next)と別のポート・ビルド先で起こす。
// 同じだと reuseExistingServer がそちらを使い回し、API の向け先も古いままになる
const webPort = Number(process.env.ARCHIEVES_E2E_WEB_PORT ?? 13100);
// 既定はテスト用の API サーバー(source/back/debug/test_env/run_test_api_server.py)
const apiUrl = process.env.ARCHIEVES_API_URL ?? "http://127.0.0.1:8080";

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
    // next dev は route を初めて開いたときにコンパイルし、並べて走る spec の間で Fast Refresh の作り直し
    // (数秒)を待たされて画面の移りが切れる。ビルドしたものを next start で出して、それを無くす
    command: `npm run build && npm run start -- --port ${webPort}`,
    url: `http://localhost:${webPort}`,
    // 使い回すと、コードを直す前にビルドしたものに当たる
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ARCHIEVES_WEB_DIST_DIR: ".next-test",
      ARCHIEVES_API_URL: apiUrl,
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_MOCK_USER_SUB: "local-dev-user",
      NEXT_PUBLIC_MOCK_USER_USERNAME: "local-dev-user",
      NEXT_PUBLIC_MOCK_USER_EMAIL: "dev@example.com",
    },
  },
});
