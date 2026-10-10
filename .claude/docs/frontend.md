# フロントエンド(`source/front`)

Next.js(App Router)・React 19。スマホで使う前提の画面が多い。

## 形

| 置き場所 | 中身 |
| --- | --- |
| `src/app/` | ページ。どれも `"use client"` で、データはブラウザから API を叩いて読む |
| `src/components/` | コンポーネント。`atoms/`・`auth/`(`AuthGate`)・`templates/<画面の種類>/` |
| `src/lib/api/` | API の呼び出し(`client.ts`)と型(`schemas.ts`・生成した `openapi.d.ts`) |
| `src/lib/auth/` | ログインの形(`mock` / `cognito`)とモックの利用者 |
| `src/modules/` | 画面に依らない処理とナビ。点数の入力の状態は `src/lib/score/scoreManager.ts` |
| `src/hooks/` | 共有の hook |
| `amplify/` | Amplify Gen 2 の Cognito の定義(認証だけ。データは API が持つ) |
| `e2e/` | Playwright の spec(`.claude/docs/testing.md` の「E2E」) |

## API

- 呼び出しは `src/lib/api/client.ts` の関数にまとめる(エンドポイント一つに関数一つ)。ページから `fetch` を直に書かない
- 失敗は `ApiError` になる。画面には `toErrorDetails()` を `ApiErrorAlert` に渡して出す
- 型は手で書かない。`src/lib/api/openapi.d.ts` は API の OpenAPI から `npm run types` で作り、`schemas.ts` は名前を付け直すだけにする(`export type GameRead = Schemas['GameRead']`)。API を変えたら作り直す(`.claude/docs/backend.md` の「OpenAPI とフロントの型」)
- 応答に無い欄が要る画面の状態は、生成した型を広げた型を画面の側で作る。`schemas.ts` に手書きの型を戻さない
- 向け先は `NEXT_PUBLIC_API_BASE_URL`(既定 `http://localhost:8000/api/v1`)

## ログイン

- `NEXT_PUBLIC_AUTH_MODE=mock` なら Amplify を通さず `NEXT_PUBLIC_MOCK_USER_*` の利用者としてログインした扱いにし、`Bearer mock-token-<sub>` を送る。API の `AUTH_MODE=mock` と揃える
- `cognito` なら Amplify の `Authenticator` でログインし、ID トークンを送る
- `AuthGate.tsx` は `amplify_outputs.json` を import するので、`predev`・`pretypecheck`・`pretest:e2e` が `amplify_outputs.example.json` から写す(`scripts/ensure-amplify-outputs.mjs`)。本物は `npx ampx sandbox` が書く(git には入れない)

## 状態

- GET の読み込みは `src/hooks/useLoad.ts`(`{ data, loading, error }`。deps が変わると読み直し、古い応答は捨てる)。ページに `useState` + `useEffect` + `cancelled` を書き写さない。SWR などは使っていない
- 非冪等な POST を StrictMode で二度送らないよう、`useRunOnce` を使う
- 点数の入力は `ScoreManager`(可変のクラス)が持ち、`useScoreGame` が React の状態に写す。考え方は `source/front/docs/state-management-best-practices.md`
- 画面をまたいで残す値は `localStorage` / `sessionStorage`(`src/modules/functions/localStorage.ts`)

## 見た目

- MUI と Tailwind を併せて使う。MUI のコンポーネントの見た目は Tailwind の class で上書きする(`className="!py-3 ..."`)
- グラフはライブラリを使わず SVG で書く(`RoundScoreChart.tsx`)

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
