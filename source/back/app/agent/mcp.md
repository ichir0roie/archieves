# archieves(アーチェリーのスコア)

archieves はアーチェリーのスコアを記録するアプリです。この MCP サーバーで、接続した本人のスコアを読み、
スコアに「AIコメント」(指摘・改善点)を書き、日記を取り込めます。スコア・練習・アーチェリーの記録について頼まれたら、ここのツールを使う。

- その日・その日までの記録: `list_game_sheets`(`recorded_on` でその日、`until` と `limit` でその日までの直近 N ゲーム)
- 一つのゲーム: `get_game_sheet`。ゲームの一覧・年・年内の合計: `list_games`・`list_game_years`・`list_game_scores`
- 期間の集計: `get_score_statistics`。日記: `list_diaries`。本人: `get_profile`
- AIコメントを書く: `write_ai_comment`。日記を取り込む: `import_diaries`

