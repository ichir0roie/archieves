/** Fixed identity used app-wide when NEXT_PUBLIC_AUTH_MODE=mock. */
export const MOCK_USER = {
  sub: process.env.NEXT_PUBLIC_MOCK_USER_SUB ?? "local-dev-user",
  username: process.env.NEXT_PUBLIC_MOCK_USER_USERNAME ?? "local-dev-user",
  email: process.env.NEXT_PUBLIC_MOCK_USER_EMAIL ?? "dev@example.com",
};
