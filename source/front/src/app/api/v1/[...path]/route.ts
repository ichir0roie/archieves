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
// ログインの前に叩かれるもの(死活の確かめ)
const PUBLIC_PATHS = new Set(["health"]);
// ログインしていなくても通す API(スコアの公開ページ)。ログインしていれば利用者を渡し、API が公開範囲を当てる
const OPTIONAL_USER_PREFIX = "public/";
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

async function forward(request: NextRequest, context: Context): Promise<Response> {
  const { path } = await context.params;
  const joined = path.map(encodeURIComponent).join("/");
  // ブラウザのヘッダーは写さず組み直す(利用者や合言葉のヘッダーを外から差し込ませない)
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (API_KEY) headers.set(API_KEY_HEADER, API_KEY);

  const user = PUBLIC_PATHS.has(joined) ? null : await verifiedUser();
  if (user === null && !PUBLIC_PATHS.has(joined) && !joined.startsWith(OPTIONAL_USER_PREFIX)) {
    return Response.json({ detail: T.api.signInRequired }, { status: 401 });
  }
  if (user !== null) {
    if (signer === null) {
      headers.set("authorization", `Bearer ${user.token}`);
    }
    for (const [claim, name] of Object.entries(USER_HEADERS) as [keyof typeof USER_HEADERS, string][]) {
      const value = user[claim];
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
  // 本文は読み切らずに流す(204 / 304 の body は null)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
