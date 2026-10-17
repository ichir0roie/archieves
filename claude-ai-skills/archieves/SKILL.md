---
name: archieves
description: アーチェリーのスコアを記録するアプリ archieves の、本人の記録(ゲーム・ラウンド・エンド・矢・コメント・日記・統計)を読む・分析する・スコアに「AIコメント」を書くときに使う。「今日のスコアを見て」「直近の練習を振り返って」「AIコメントを書いて」など。
---

# archieves の記録を API で扱う

1. 環境変数 `ARCHIEVES_API_URL` があることを確かめる。無ければ、claude.ai/code の環境(environment)の設定に入れるよう本人に頼んで止める(archieves の設定の画面の「Claude Code のトークン」で、入れる値が分かる)
2. 作業の前に、API の案内を読む: `curl -sS "$ARCHIEVES_API_URL/guide"`
   - トークンが network secret で付く環境なら Authorization を付けない。環境変数 `ARCHIEVES_TOKEN` があるなら `-H "Authorization: Bearer $ARCHIEVES_TOKEN"` を付ける
3. 案内に従って、頼まれた作業をする。トークンでできるのは、本人の記録を読むことと、スコアに AIコメントを書くことだけ
