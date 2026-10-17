# フロントエンド(`source/front`)

Next.js(App Router)・React 19。スマホで使う前提の画面が多い。

## 形

| 置き場所 | 中身 |
| --- | --- |
| `src/app/` | ページ。どれも `"use client"` で、データはブラウザから API を叩いて読む。`src/app/api/v1` は API へ流す route handler |
| `src/components/` | コンポーネント(階層は無く、一つのディレクトリに並べる)。ログインの門は `AuthGate.tsx` |
| `src/lib/api/` | API の呼び出し(`client.ts`)と型(`schemas.ts`・生成した `openapi.d.ts`) |
| `src/lib/auth/` | ログインの形(`mock` / `cognito`)とモックの利用者、今の利用者(`currentUser.ts`) |
| `src/lib/score/` | 点数の決まり(`scoreConfig.ts`)と点数の入力の状態(`scoreManager.ts`・`useScoreGame.ts`) |
| `src/lib/text/` | 画面の文言(`ja/`・`en/`)。コンポーネントに文言を直に書かない |
| `src/lib/` のほか | 画面をまたいで残す値(`storage.ts`)、メニューとホームの行き先(`destinations.ts`)など、画面に依らない処理 |
| `src/hooks/` | 共有の hook(`useLoad`・`useOnResume` など) |
| `amplify/` | Amplify Gen 2 の Cognito の定義(認証だけ。データは API が持つ) |
| `e2e/` | Playwright の spec(`.claude/docs/testing.md` の「E2E」) |

## API

- 呼び出しは `src/lib/api/client.ts` の関数にまとめる(エンドポイント一つに関数一つ)。ページから `fetch` を直に書かない
- 失敗は `ApiError` になる。画面には `toErrorDetails()` を `ApiErrorAlert` に渡して出す
- `client.ts` の `handleApiError` が、API のエラーをエラーの集積(`POST /error-reports`)に送り、ホームへ戻す(`ApiErrorRedirect`)。入力の不備(422)・重なり(409)は画面に残す。ログインの切れ(401)と登録の前の 404 は AuthGate に任せ、どちらもしない。画面が受けて扱うステータス(他人のプロフィールの 403 など)は、`request` に `expectedStatuses` を渡して外す
- 無いページ(`src/app/not-found.tsx`)も集積に送ってホームへ戻す
- 型は手で書かない。`src/lib/api/openapi.d.ts` は API の OpenAPI から `npm run types` で作り、`schemas.ts` は名前を付け直すだけにする(`export type GameRead = Schemas['GameRead']`)。API を変えたら作り直す(`.claude/docs/backend.md` の「OpenAPI とフロントの型」)
- 応答に無い欄が要る画面の状態は、生成した型を広げた型を画面の側で作る。`schemas.ts` に手書きの型を戻さない
- 向け先は `NEXT_PUBLIC_API_BASE_URL`(既定 `http://localhost:8000/api/v1`)

## ログイン

- `NEXT_PUBLIC_AUTH_MODE=mock` なら Amplify を通さず `NEXT_PUBLIC_MOCK_USER_*` の利用者としてログインした扱いにし、`Bearer mock-token-<sub>` を送る。API の `AUTH_MODE=mock` と揃える
- `cognito` なら Amplify の `Authenticator` でログインし、ID トークンを送る
- 本人が発行したトークン(設定の画面の `AccessTokens.tsx`)で `Authorization: Bearer arc_...` と来た要求は、route handler がクッキーを見ずに `x-archieves-access-token` へ載せ替えて流す(Claude Code などの AI が `<サイト>/api/v1/*` を読むため)。MCP の `mcp/<トークン>` も、トークンをヘッダーに載せ替えて `mcp` へ流す。どこまで通すかは API が決める(`.claude/docs/backend.md` の「認証」)
- 本人の記録の API は利用者の id を送らない(API がログインから本人を引く)。他人を見る画面(プロフィール・ランキング・スコアの公開ページ)は `/public/*` を読む
- スコアの公開ページ(`/score-share`。`src/lib/scoreShare.ts` の `isPublicPath`)はログインしていなくても開ける。`AuthGate` の `Authenticator` と登録の確かめ、メニュー(`Nav`)、エラーでホームへ戻すこと(`ApiErrorRedirect`)を外す。route handler は `public/*` の API を、ログインしていなければ利用者なしで流す
- `AuthGate.tsx` は `amplify_outputs.json` を import するので、`predev`・`pretypecheck`・`pretest:e2e` が `amplify_outputs.example.json` から写す(`scripts/ensure-amplify-outputs.mjs`)。本物は `npx ampx sandbox` が書く(git には入れない)

## 状態

- GET の読み込みは `src/hooks/useLoad.ts`(`{ data, loading, error }`。deps が変わると読み直し、古い応答は捨てる)。ページに `useState` + `useEffect` + `cancelled` を書き写さない。SWR などは使っていない
- 非冪等な POST を StrictMode で二度送らないよう、`useRunOnce`(`src/lib/useRunOnce.ts`)を使う
- 点数の入力は `ScoreManager`(可変のクラス)が持ち、`useScoreGame` が React の状態に写す。記録は手元のキャッシュ(形は `src/lib/score/scoreSheetCache.ts`、読み書きは `src/lib/storage.ts`。ログインの sub ごとに分ける)にだけ書き、保存・終了のときに `PUT /games/sheet` で丸ごと送る。考え方は `source/front/docs/state-management-best-practices.md`
- 画面をまたいで残す値は `localStorage`。読み書きは `src/lib/storage.ts` にまとめ、ページ・コンポーネントから直に触らない(言語は `src/lib/text/locale.ts`、メニューの位置は `src/lib/menuPosition.ts` が持つ)

## 見た目

- 見た目は `src/app/globals.css` の class で書く(UI のライブラリ・Tailwind は使わない)。ログインの画面だけ `@aws-amplify/ui-react` の `Authenticator`
- グラフはライブラリを使わず SVG で書く(`ScoreTrendChart.tsx`)

## コマンド

`source/front` で:

| コマンド | 中身 |
| --- | --- |
| `npm run dev` | `next dev --turbopack`(:3100)。API と一緒に起こすなら `source/back` の `python -m tools.dev` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` |
| `npm run types` | `../back/openapi.json` から `src/lib/api/openapi.d.ts` を作る |
| `npm run test:e2e` | Playwright。先にテスト用の API サーバーを起こす |

- `next dev` のビルド先は `ARCHIEVES_WEB_DIST_DIR`(既定 `.next`)。`next dev` はビルド先ごとに一つしか動かないので、テスト・確かめで二つ目を起こすときは `.next-test` にする
