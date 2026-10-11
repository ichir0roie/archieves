# Archieves - アーチェリーのスコア記録アプリ

アーチェリーの点数を、スマホで的をタッチするだけで記録できる web アプリです。
紙のスコアシートの代わりに射場でそのまま使え、矢の当たった位置まで残るので、
あとからグルーピングや点数の推移を振り返れます。

An archery score tracker for the web. Tap the target face on your phone to record each arrow,
then review your groupings, end totals and progress over time.

![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-Amplify_%2F_Lambda-FF9900?logo=amazonwebservices&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

## できること

| 機能 | 内容 |
| --- | --- |
| 的をタッチして記録 | 的の絵の上で矢の当たった所を押すと、点数と位置が一緒に残る。押しているあいだは指の上にズームが出て、線の際も狙って置ける |
| 的と弓の設定 | 122cm・80cm・40cm の的、距離、エンドの本数、リカーブ・コンパウンド・ベアボウの弓の種類を選べる。コンパウンドのインナー10 にも対応 |
| スコアの見返し | ゲームごとの合計点、X・10 の本数、矢の当たった位置の分布を見返せる |
| 統計 | 点数の推移や平均をグラフで追える |
| 練習の日記 | その日の調子や気づきを、スコアと並べて書き残せる |
| ランキング・プロフィール | 所属の仲間と点数を比べたり、自分の記録を見せたりできる。公開の範囲は自分で決められる |
| 電波の弱い射場でも | 入力中の記録は端末に置き、保存のときにまとめて送る。途中で通信が切れても消えない |
| 記録の持ち出し | 自分の記録を SQLite のファイルでダウンロードでき、他のアプリや AI でも読める |
| 日本語・英語 | 画面の言語を切り替えられる |

## 使い方

1. ブラウザでアプリを開き、アカウントを作ってサインインする
2. ホーム画面に追加する(インストール)
   - iPhone・iPad(Safari): 共有ボタンから「ホーム画面に追加」
   - Android(Chrome): メニューから「アプリをインストール」または「ホーム画面に追加」
   - パソコン(Chrome・Edge): アドレスバーのインストールのアイコン
3. 「ゲーム開始」で的・距離・本数を選び、射つたびに的をタッチして記録する

ホーム画面から開くとブラウザの枠が消え、ふつうのアプリと同じように全画面で使えます。

## こんな人に

- 紙のスコアシートを付けたあと、表計算に打ち直している人
- 点数だけでなく、矢がどこに集まっているかを見て練習を組み立てたい人
- 部活・サークル・クラブの仲間と、記録を気軽に見せ合いたい人

## 開発者向け

### リポジトリの構成

フロントエンドとバックエンドを一つのリポジトリ(モノレポ)で持っています。

| 場所 | 中身 |
| --- | --- |
| [source/front](source/front) | フロントエンド。Next.js(App Router)・React 19。認証は Amplify(Cognito) |
| [source/back](source/back) | バックエンド。FastAPI・SQLAlchemy・PostgreSQL。Lambda Web Adapter で AWS Lambda に載せる |
| [infra](infra) | AWS の構成(CDK) |
| [docs](docs) | 要件・設計の検討 |

### セットアップ

```sh
git clone https://github.com/ichir0roie/archieves.git
```

フロント・バックのそれぞれの手順は [source/front/README.md](source/front/README.md) と
[source/back/README.md](source/back/README.md) にあります。
手元では認証をモック(`AUTH_MODE=mock`)にすると、AWS の資格情報なしで動かせます。

### ブランチ

`develop` を基点に作業用のブランチを切り、`develop` へマージします。

### ドキュメント

要件・設計の検討は [docs](docs) にあります(一覧は [docs/README.md](docs/README.md))。

## ライセンス

[MIT](LICENSE)
