import { expect, type APIRequestContext } from "@playwright/test";

// playwright.config.ts と同じ既定(テスト用の API サーバー)
const API_URL = process.env.ARCHIEVES_API_URL ?? "http://127.0.0.1:8080";

/**
 * 他人の行を API に作る。画面のモックのログインは常に本人なので、API(AUTH_MODE=mock)へ直に
 * `mock-token-<sub>` で送り、別の sub の利用者として登録させる(app/core/security.py の mock_user)
 */
export async function createOtherUser(request: APIRequestContext, name: string): Promise<{ id: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer mock-token-e2e-other-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  if (process.env.ARCHIEVES_API_KEY) headers["x-archieves-api-key"] = process.env.ARCHIEVES_API_KEY;
  const response = await request.post(`${API_URL}/api/v1/users/me/ensure`, {
    headers,
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
