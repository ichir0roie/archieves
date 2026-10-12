# フロントエンドのステート管理ベストプラクティス

## 背景

`/game/score-card` で、画面を開くたびに Game
テーブルへの POST (`createGame`) が連続実行され、異常な Game レコードが
増殖する不具合が確認された。原因は
`src/modules/data/score/useScoreGame.ts` の

```
useEffect(() => {
  setupGame();
}, []);
```

が、`setupGame()` の非同期処理が完了する前に同じ副作用がもう一度呼ばれた
場合の対策を持たないまま `createGame()` という非冪等な POST を送っていた
ことにある。同じパターンが `src/app/score-view/page.tsx` の `setupGame()`
にも存在した。

以下は今回の修正にあたって収集した React / Next.js 公式ドキュメントの
該当箇所と、そこから導いたこのリポジトリでの方針。

## React 公式ドキュメント

### Effect は開発時に二重実行されうる (StrictMode)

[`<StrictMode>`](https://react.dev/reference/react/StrictMode) は
「純粋でないコード」を検出するため、開発時に限り
マウント → クリーンアップ → 再マウントを行い、Effect のセットアップと
クリーンアップを 1 回多く呼び出す。本番ビルドではこの二重実行は行われない。

> Strict Mode does not create the bugs, it reveals them, and removing it
> only hides the symptom while the impure render or missing cleanup stays
> in your code, ready to misbehave in production.

ポイントは「StrictMode がバグを作っているのではなく、既存のバグを早期に
可視化しているだけ」という点。`createGame()` のような非冪等な POST を
ガードなしで Effect 本体に置くこと自体が本質的な問題であり、StrictMode は
それを開発中に顕在化させたに過ぎない。

### データ取得 Effect の競合状態には ignore フラグで対処する

[Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) /
[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
では、Effect 内で fetch する際に発生する「後から送ったリクエストの
レスポンスが先に返るとは限らない」競合状態への対処として、クリーンアップ
関数で `ignore` フラグを立てて古いレスポンスの適用を防ぐ
"fetch-and-ignore" パターンが紹介されている。これは **レスポンスの
取り扱い** に関するガードであり、リクエスト自体の二重送信を防ぐものでは
ない点に注意が必要。副作用が POST のように「送信した時点で外部状態を
変える」ものである場合は、ignore フラグだけでは不十分で、送信そのものを
一度に制限するガードが別途必要になる。

一方、分析イベント送信のような「二重に送っても実害がない」副作用について
公式ドキュメントは、開発時に二重発火しても本番では 1 回しか実行されない
ため、通常はそのままで問題ないと説明している。今回の `createGame()` は
これに当てはまらない（実害があるレコード増殖を引き起こす）ため、明示的な
ガードが必要と判断した。

## Next.js 公式ドキュメント

[Getting Started: Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) は、
可能な限り Server Component 側でデータ取得を行い、`useEffect` +
`useState` によるクライアント側フェッチは避けるよう推奨している。
クライアント側でどうしても取得が必要な場合は SWR や React Query のような、
リクエストの重複排除 (dedupe) やキャッシュを内蔵したライブラリの利用を
勧めている。

このリポジトリは archieves-api という別サービスをクライアントから直接
叩く構成であり、認証情報の性質上ページ全体を Server Component 化するのは
今回のスコープを超える大きな変更になる。そのため今回は「Server
Component 化」までは行わず、既存のクライアント側 Effect 内の呼び出しに
対して、公式ドキュメントが示す設計原則（非冪等な副作用は 1 回だけ実行する
／古いレスポンスは無視する）を最小限のガードとして適用する方針とした。
将来的にデータ取得量が増える場合は SWR / React Query の導入を検討する
価値がある。

## このリポジトリで採用した方針

修正前に、実際にこの環境（Next.js 15.3.1 + Turbopack + React 19、
`next dev`）で StrictMode の二重 Effect 呼び出しが起きるかを
Playwright で検証したところ、初回マウントでは二重発火は再現しなかった
（`useEffect` 内の `console.log` が 1 回しか出力されない）。つまり今回の
不具合の引き金は、少なくとも開発時の StrictMode 単体ではない可能性が高い。
本番相当の環境では Amplify の `<Authenticator>` が認証状態の遷移に応じて
子要素を再マウントすることがあり、それ以外にもコンポーネントが何らかの
理由で複数回マウントされる経路は将来的に増えうる。「何が原因で複数回
マウントされるか」を局所的に潰すより、「複数回マウントされても副作用が
1 回しか実行されないようにする」ほうが頑健。そこで、**個々のコンポーネント
インスタンスに閉じない、モジュールスコープの単一実行ガード（mutex）**
を採用した。これは `AuthGate.tsx` の `ensureRegisteredInFlight` が既に
同じ目的で使っている実績のあるパターンで、今回はそれを
`useScoreGame`（`setupOrResumeGame`）と `score-view`
（`setupOrResumeGame`、`gameId` ごとにキー分け）に適用した。

1. **`createGame()` を含む「ゲームを作成 or 再開する」処理全体を、
   モジュールスコープの `Promise` でラップする。** 呼び出しが重なった
   場合、2 回目以降は新しい POST を送らず、進行中の `Promise` の結果を
   共有する。先行する呼び出しが完了（成功・失敗いずれでも）すると
   ガードは解除され、それより後の独立した呼び出し（例:
   ユーザーが再度ゲームを開始する）は通常どおり新しく実行される。
2. **マウント時の Effect 自体も `useRef` で「同一マウントでは 1 回だけ」に
   ガードする。** 1 のモジュールスコープ mutex が本質的な防御だが、
   StrictMode がこの先のバージョンや別環境で二重発火するケースに備えた、
   コストの低い追加の安全策として重ねている。
3. **同じ副作用がユーザー操作（再試行ボタンなど）から再度呼ばれる場合は、
   実行中フラグで多重実行を防ぐ。** ボタン連打時に無駄な
   `getCurrentAppUser()` 呼び出しが積み重なるのを防ぐ。
4. **GET のみの一覧取得 Effect は、ignore フラグでアンマウント後や
   クエリ変更後の古いレスポンス適用を防ぐ。** レコードが増えるわけでは
   ないため優先度は下げつつも、`setState` の警告や表示のちらつきを防ぐ
   ために揃えて適用する（`ranking`・`profile/matches`・
   `profile/settings`・`profile/[userId]`・`analysis` は既にこの形になって
   おり、`score-log` だけ欠けていたので揃えた）。
5. 上記 2・3 を毎回手書きしないよう、`src/hooks/useRunOnce.ts` に
   「マウントごとに 1 回だけ・多重呼び出しなしで」実行するための小さな
   フックを用意し、`useScoreGame` と `score-view` の両方から利用する。
