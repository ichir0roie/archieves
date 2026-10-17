import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { isMockAuth } from "@/lib/auth/config";
import { MOCK_USER } from "@/lib/auth/mockUser";
import { runWithAmplifyServerContext } from "@/lib/auth/server";
import { T } from "@/lib/text/server";
import outputs from "../../../../../amplify_outputs.json";

// ブラウザからの /api/v1/* を archieves-api へ流す。ブラウザは API の在りかも合言葉も知らない。
// 合言葉(x-archieves-api-key)はここで付ける。利用者は Cognito のクッキーのセッションから ID トークンを引き、
// ここで署名を確かめる(本番の API は VPC の中にいて Cognito の公開鍵を取りに行けないため)。
//   本番(Lambda の関数 URL): 確かめた利用者を x-archieves-user-* で渡し(API は AUTH_MODE=proxy)、要求に SigV4 の署名を付ける
//   手元の API: ID トークンをそのまま Authorization に載せる(API の AUTH_MODE=cognito がもう一度確かめる)
// 本人が発行したトークン(Claude Code など AI)で Authorization: Bearer arc_... と来た要求(と、URL にトークンを入れた
// MCP の /api/v1/mcp/arc_...)は、クッキーを見ずにトークンを x-archieves-access-token に載せ替えて流し、API が db で
// 確かめる(本番では Authorization を SigV4 が使う)
export const dynamic = "force-dynamic";

const API_URL = (process.env.ARCHIEVES_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const API_KEY = process.env.ARCHIEVES_API_KEY;
const API_KEY_HEADER = "x-archieves-api-key";
// API の app/core/security.py の USER_*_HEADER と同じ。値は URL エンコードする
const USER_HEADERS = {
  sub: "x-archieves-user-sub",
  username: "x-archieves-user-username",
  email: "x-archieves-user-email",
} as const;
// API の app/core/security.py の ACCESS_TOKEN_HEADER と、app/core/access_token.py の TOKEN_PREFIX と同じ
const ACCESS_TOKEN_HEADER = "x-archieves-access-token";
const ACCESS_TOKEN_PREFIX = "arc_";
// ログインの前に叩かれるもの(死活の確かめ)
const PUBLIC_PATHS = new Set(["health"]);
// ログインしていなくても通す API(スコアの公開ページ)。ログインしていれば利用者を渡し、API が公開範囲を当てる
const OPTIONAL_USER_PREFIX = "public/";
// 書き換えをしないメソッド。クッキーのログインでも、よそのサイトからの要求を止めない
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "location"];

// Lambda の関数 URL は認証が AWS_IAM なので、Amplify の SSR のコンピュートロールで SigV4 の署名を付ける。手元の API には付けない
const lambdaUrlRegion = /\.lambda-url\.([a-z0-9-]+)\.on\.aws$/.exec(new URL(API_URL).hostname)?.[1];
const signer = lambdaUrlRegion
  ? new SignatureV4({
      service: "lambda",
      region: lambdaUrlRegion,
      credentials: defaultProvider(),
      sha256: Sha256,
      applyChecksum: true,
    })
  : null;

// 公開鍵は取ったものをこのプロセスの中で使い回す。mock では使わない
const verifier = isMockAuth()
  ? null
  : CognitoJwtVerifier.create({
      userPoolId: outputs.auth.user_pool_id,
      tokenUse: "id",
      clientId: outputs.auth.user_pool_client_id,
    });

type Context = { params: Promise<{ path: string[] }> };

type VerifiedUser = {
  token: string;
  sub: string;
  username: string | null;
  email: string | null;
};

async function verifiedUser(): Promise<VerifiedUser | null> {
  if (verifier === null) {
    // API の AUTH_MODE=mock はトークンの中身を見ず、ヘッダーがあることだけを求める
    return { token: `mock-token-${MOCK_USER.sub}`, ...MOCK_USER };
  }
  try {
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (contextSpec) => fetchAuthSession(contextSpec),
    });
    const token = session.tokens?.idToken?.toString();
    if (!token) {
      console.warn("クッキーに Cognito の ID トークンが無い");
      return null;
    }
    const claims = await verifier.verify(token);
    return {
      token,
      sub: claims.sub,
      username: typeof claims["cognito:username"] === "string" ? claims["cognito:username"] : null,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  } catch (e) {
    // 署名・期限・クライアントが合わないトークンは、サインインしていない扱いにする。
    // 公開鍵の取得の失敗などもここに来るので、理由は残す
    console.warn("Cognito のトークンを確かめられなかった", e);
    return null;
  }
}

/** Authorization: Bearer arc_... で来たなら、そのトークン。Cognito の ID トークンなどは null */
function accessToken(request: NextRequest): string | null {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  return token?.startsWith(ACCESS_TOKEN_PREFIX) ? token : null;
}

// 署名は問い合わせを RFC 3986 で符号化し直した形で計算するので、送る方も同じ形に揃える(`+` と `%20` の食い違いで署名が外れる)
function encodeQuery(params: URLSearchParams): string {
  const rfc3986 = (value: string) =>
    encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const pairs = [...params].map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

async function sign(target: URL, method: string, headers: Headers, body: Uint8Array | undefined): Promise<Headers> {
  if (signer === null) return headers;
  const query: Record<string, string[]> = {};
  for (const [key, value] of target.searchParams) (query[key] ??= []).push(value);
  const signed = await signer.sign({
    method,
    protocol: target.protocol,
    hostname: target.hostname,
    path: target.pathname,
    query,
    headers: { ...Object.fromEntries(headers), host: target.hostname },
    body,
  });
  // host は fetch が URL から付ける
  return new Headers(Object.entries(signed.headers).filter(([name]) => name.toLowerCase() !== "host"));
}

/** 本人のデータを返すので、CDN やブラウザに溜めさせない(API が付けたものはそのまま) */
function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * 流す先の API のパス(/api/v1 から下)。ヘッダーを付けられない MCP のクライアント(claude.ai・ChatGPT の
 * コネクタ)向けに、トークンを URL に入れた mcp/<トークン> も受け、パスからは外す(API のログに残さない)。
 * `.`・`..` の段は、/api/v1 の外を指させないよう null にする
 */
function apiPath(path: string[]): { joined: string; pathToken: string | null } | null {
  if (path.some((segment) => segment === "." || segment === "..")) return null;
  const pathToken = path.length === 2 && path[0] === "mcp" && path[1].startsWith(ACCESS_TOKEN_PREFIX) ? path[1] : null;
  return {
    joined: (pathToken === null ? path : ["mcp"]).map(encodeURIComponent).join("/"),
    pathToken,
  };
}

/**
 * クッキーのログインで来た書き込みが、よそのサイトの画面から送られたもの(CSRF)か。
 * ブラウザは Sec-Fetch-Site を付ける。付けないもの(ブラウザの外)はこのサイトのクッキーを持たないので止めない
 */
function isCrossSiteWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

type Caller = { kind: "token"; token: string } | { kind: "user"; user: VerifiedUser } | { kind: "anonymous" };

/**
 * だれとして API に流すか。トークン(AI)で来た要求はクッキーを見ず、ブラウザのログインに格上げしない
 * (どこまで通すかは API が決める)
 */
async function resolveCaller(request: NextRequest, joined: string, pathToken: string | null): Promise<Caller> {
  const token = pathToken ?? accessToken(request);
  if (token !== null) return { kind: "token", token };
  if (PUBLIC_PATHS.has(joined)) return { kind: "anonymous" };
  const user = await verifiedUser();
  return user === null ? { kind: "anonymous" } : { kind: "user", user };
}

async function forward(request: NextRequest, context: Context): Promise<Response> {
  const resolved = apiPath((await context.params).path);
  if (resolved === null) return json({ detail: T.api.notFound }, 404);
  const { joined, pathToken } = resolved;

  const caller = await resolveCaller(request, joined, pathToken);
  if (caller.kind === "user" && isCrossSiteWrite(request)) {
    return json({ detail: T.api.crossSite }, 403);
  }
  if (caller.kind === "anonymous" && !PUBLIC_PATHS.has(joined) && !joined.startsWith(OPTIONAL_USER_PREFIX)) {
    return json({ detail: T.api.signInRequired }, 401);
  }

  // ブラウザのヘッダーは写さず組み直す(利用者や合言葉のヘッダーを外から差し込ませない)
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (API_KEY) headers.set(API_KEY_HEADER, API_KEY);
  if (caller.kind === "token") {
    headers.set(ACCESS_TOKEN_HEADER, caller.token);
  } else if (caller.kind === "user") {
    if (signer === null) {
      headers.set("authorization", `Bearer ${caller.user.token}`);
    }
    for (const [claim, name] of Object.entries(USER_HEADERS) as [keyof typeof USER_HEADERS, string][]) {
      const value = caller.user[claim];
      if (value) headers.set(name, encodeURIComponent(value));
    }
  }

  const target = new URL(`${API_URL}/api/v1/${joined}`);
  target.search = encodeQuery(request.nextUrl.searchParams);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : undefined;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: await sign(target, request.method, headers, body),
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    return json({ detail: T.api.unreachable(e instanceof Error ? e.message : String(e)) }, 502);
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has("cache-control")) responseHeaders.set("cache-control", "no-store");
  // 本文は読み切らずに流す(204 / 304 の body は null)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
