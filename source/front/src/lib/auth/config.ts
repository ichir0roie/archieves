/**
 * "mock" skips Amplify/Cognito entirely and runs the app as a fixed local
 * dev user (see mockUser.ts) - no amplify_outputs.json from a real sandbox,
 * no AWS credentials. "cognito" (default) uses the real Amplify
 * Authenticator against a provisioned Cognito user pool.
 */
export type AuthMode = "mock" | "cognito";

export const AUTH_MODE: AuthMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === "mock" ? "mock" : "cognito";

export function isMockAuth(): boolean {
  return AUTH_MODE === "mock";
}
