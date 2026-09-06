# archieves

## リポジトリ構成

- [archieves](https://github.com/ichir0roie/archieves.git)（このリポジトリ）: ドキュメント・全体管理
- [archieves-front](https://github.com/ichir0roie/archieves-front.git)（`front` サブモジュール）: フロントエンド
- [archieves-back](https://github.com/ichir0roie/archieves-back.git)（`back` サブモジュール）: バックエンド

## 初期セットアップ

`front`, `back` はサブモジュールとして設定されている。クローン時にまとめて取得する。

```sh
git clone --recurse-submodules https://github.com/ichir0roie/archieves.git
```

既にクローン済みの場合は以下でサブモジュールを取得する。

```sh
git submodule update --init --recursive
```

`front`, `back` はいずれも `develop` ブランチを追跡する。最新に更新する場合は以下を実行する。

```sh
git submodule update --remote
```

## ブランチ運用

`develop` ブランチを基点に作業用ブランチを作成して作業する。作業後のマージ先も `develop`。

## ドキュメント

要件・設計に関する情報は [docs](docs) 配下を参照する。
