import { cookies } from "next/headers";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { isMockAuth } from "@/lib/auth/config";
import { MOCK_USER } from "@/lib/auth/mockUser";
import { runWithAmplifyServerContext } from "@/lib/auth/server";
import { T } from "@/lib/text/server";

// ブラウザからの /api/v1/* を archieves-api へ流す。ブラウザは API の在りかも合言葉も知らない。
// 合言葉(x-archieves-api-key)はここで付け、利用者は Cognito のクッキーのセッションから
// ID トークンを引いて Authorization に載せる(API がそれを確かめる)
export const dynamic = "force-dynamic";

const API_URL = process.env.ARCHIEVES_API_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.ARCHIEVES_API_KEY;
const API_KEY_HEADER = "x-archieves-api-key";
// ログインの前に叩かれるもの(死活の確かめ)
const PUBLIC_PATHS = new Set(["health"]);
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "cache-control", "location"];

type Context = { params: Promise<{ path: string[] }> };

async function idToken(): Promise<string | null> {
  if (isMockAuth()) {
    // API の AUTH_MODE=mock はトークンの中身を見ず、ヘッダーがあることだけを求める
    return `mock-token-${MOCK_USER.sub}`;
  }
  try {
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (contextSpec) => fetchAuthSession(contextSpec),
    });
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}

async function forward(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const joined = path.map(encodeURIComponent).join("/");
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (API_KEY) headers.set(API_KEY_HEADER, API_KEY);

  if (!PUBLIC_PATHS.has(joined)) {
    const token = await idToken();
    if (token === null) {
      return Response.json({ detail: T.api.signInRequired }, { status: 401 });
    }
    headers.set("authorization", `Bearer ${token}`);
  }

  const target = `${API_URL}/api/v1/${joined}${new URL(request.url).search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    return Response.json(
      { detail: T.api.unreachable(e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // 204 / 304 は本文を持てない(Response の作成で落ちる)
  const body = upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
