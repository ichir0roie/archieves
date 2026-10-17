# archieves API の使い方(AI 向け)

archieves はアーチェリーのスコアを記録するアプリです。この API で、トークンを発行した本人のスコアを読み、
スコアに「AIコメント」(指摘・改善点)を書けます。MCP に対応した AI なら、`$ARCHIEVES_API_URL/mcp` に繋ぐ方が楽です(ツールとして使える)。

## 接続

- ベース URL は環境変数 `ARCHIEVES_API_URL`(例: `https://<サイト>/api/v1`)
- トークンは次のどちらかで付く
  - 環境のプロキシ(Claude Code on the web の network secret など)が、このサイトへの要求に `Authorization: Bearer <トークン>` を付ける。トークンはセッションの中に無いので、Authorization を付けずに送る
  - 環境変数 `ARCHIEVES_TOKEN`: すべての要求に `Authorization: Bearer $ARCHIEVES_TOKEN` を付ける
- 例(プロキシが付ける): `curl -sS "$ARCHIEVES_API_URL/games/sheets?limit=30"`
- 例(環境変数): `curl -sS -H "Authorization: Bearer $ARCHIEVES_TOKEN" "$ARCHIEVES_API_URL/games/sheets?limit=30"`
- 全エンドポイントの形は `$ARCHIEVES_API_URL/openapi.json`(大きいので、要るところだけ読む)
- 401 はトークンが無い・違う・期限切れ(サイトの「サインインしてください」の応答も、トークンが付いていない)。本人にアプリの設定画面で発行し直し、環境に入れ直してもらう
- `host_not_allowed` などプロキシに断られたら、環境のネットワークの設定にこのサイトが無い

## よく使うエンドポイント

| 目的 | 要求 |
| --- | --- |
| 本人 | `GET /users/me` |
| ある日のゲームの記録を丸ごと | `GET /games/sheets?recorded_on=YYYY-MM-DD` |
| ある日までの直近 N ゲームの記録を丸ごと(新しい順、N は 1〜100、既定 30) | `GET /games/sheets?until=YYYY-MM-DD&limit=N` |
| 一つのゲームの記録 | `GET /games/{game_id}/sheet` |
| ゲームの一覧(記録の中身なし) | `GET /games?year=YYYY&limit=10000` |
| ゲームのある年 | `GET /games/years` |
| 年内のゲームごとの合計点・平均 | `GET /games/scores?year=YYYY` |
| 期間の集計(最小・最大・平均・中央値) | `GET /statistics/rounds/summary?start=YYYY-MM-DD&end=YYYY-MM-DD`(`/ends/summary`・`/points/summary` も) |
| 日記 | `GET /diaries?year=YYYY&limit=N` |
| AIコメントを書く | `PUT /games/{game_id}/ai-comment`、`Content-Type: application/json`、本文 `{"body": "..."}` |

