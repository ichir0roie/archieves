# archieves API の使い方(Claude などの AI 向け)

archieves はアーチェリーのスコアを記録するアプリです。この API で、トークンを発行した本人のスコアを読み、
スコアに「AIコメント」(指摘・改善点)を書けます。

## 接続

- ベース URL は環境変数 `ARCHIEVES_API_URL`(例: `https://<サイト>/api/v1`)
- トークンは次のどちらかで付く
  - Claude Code on the web の network secret(勧める): 環境のプロキシが、このサイトへの要求に `Authorization: Bearer <トークン>` を付ける。トークンはセッションの中に無いので、Authorization を付けずに送る
  - 環境変数 `ARCHIEVES_TOKEN`: すべての要求に `Authorization: Bearer $ARCHIEVES_TOKEN` を付ける
- 例(network secret): `curl -sS "$ARCHIEVES_API_URL/games/sheets?limit=30"`
- 例(環境変数): `curl -sS -H "Authorization: Bearer $ARCHIEVES_TOKEN" "$ARCHIEVES_API_URL/games/sheets?limit=30"`
- 全エンドポイントの形は `$ARCHIEVES_API_URL/openapi.json`(大きいので、要るところだけ読む)
- `host_not_allowed` などプロキシに断られたら、環境のネットワークの設定(許可するドメインか network secret のホスト)にこのサイトが無い

## トークンでできること

- 本人の記録を読む(GET): ゲーム・ラウンド・エンド・矢・コメント・AIコメント・日記・統計
- 本人のゲームに AIコメントを書く(`PUT /games/{game_id}/ai-comment`)
- ほかは 403: 記録の書き換え・削除、設定、他人のデータ、トークンの発行
- 401 はトークンが無い・違う・期限切れ(サイトの「ログインしてください」の応答も、トークンが付いていない)。本人に設定画面で発行し直し、環境に入れ直してもらう

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

「今日」「昨日」は日本時間で決める。日付は `recorded_at`(ゲームの日付)で、`GET /games/sheets` の `recorded_on`・`until` もそれを見る。

## 記録の読み方

`GET /games/sheets` と `GET /games/{game_id}/sheet` は、ゲームごとに次の形を返す。

- ゲーム: `id`・`recorded_at`(日付)・`bow_type`(弓の種類)・`arrow_diameter_mm`・`all_in`(インサイドアウト: 線にかかった矢を低い方の点にする)・`comment`(本人のメモ)・`ai_comment`(前に書いた AIコメント。無ければ null)・`rounds`
- ラウンド: `number`・`distance_m`(距離)・`target_type`(的の種類。`122cm`・`80cm` など)・`end_size`(1 エンドの矢の数)・`comment`・`ends`
- エンド: `number`・`comment`・`points`
- 矢(points): `score` は 11 が X(10 点に数え、X の本数にも数える)、10〜1 はその点、0 が M(外れ)。`x_cm`・`y_cm` は的の中心からの位置(cm)で、右と下が正。null は位置を記録していない矢。`x`・`y` は的に対する割合(左上が 0、中心が 0.5)

合計点は X を 10 として足す。

## AIコメントを書く

- `PUT /games/{game_id}/ai-comment`、`Content-Type: application/json`、本文 `{"body": "..."}`
- 本文は 1〜4000 字。同じゲームに書き直すと上書きする。書いた人として、トークンの名前が画面に出る
- 画面はマークダウンを解釈しない。`##` や `**` は使わず、【見出し】と「・」の箇条書きの、ただの文で書く
- その日にゲームが複数あるときは、本人の指定が無ければ、その日の最後のゲーム(`GET /games/sheets?recorded_on=...` の先頭)に書く

### 例: その日のスコアに指摘と改善点を書く

1. その日の記録: `GET /games/sheets?recorded_on=YYYY-MM-DD`
2. その日までの直近 30 ゲーム: `GET /games/sheets?until=YYYY-MM-DD&limit=30`
3. その日を直近 30 ゲームと比べる。合計点・エンドごとのばらつき・X/10/M の本数・矢の位置の偏り(上下左右・まとまり)・距離や的の違い・本人のメモを見て、【良かった点】【指摘】【次の練習で試すこと】をまとめる。根拠にした数字を添える
4. `PUT /games/{その日の最後のゲームの id}/ai-comment` で書く
