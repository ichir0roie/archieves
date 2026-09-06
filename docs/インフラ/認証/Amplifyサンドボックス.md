# Amplifyサンドボックス（Cognito認証）のローカルセットアップ

front（archieves-front）はAmplify Gen2（`amplify/`配下）でCognito認証のみを
管理している。ゲーム・スコア等のデータはAmplifyを介さず、archieves-apiに
通常のHTTP APIとして読み書きする。

front・backそれぞれの`.env.example`にある`NEXT_PUBLIC_AUTH_MODE=mock` /
`AUTH_MODE=mock`（どちらもデフォルト）のままなら、AWSに一切接続せずに
ローカル動作する。詳細は各リポジトリのREADME「AWS auth: mock vs. real
Cognito」を参照。本ドキュメントは、実際のCognitoサインインフローを試す
（`cognito`モードに切り替える）ために必要な手順をまとめる。

リポジトリはサブモジュールとして取り込まれており、パスは`.gitmodules`
（現状 `source/front` / `source/back`）を参照。以下は front のパスを
カレントディレクトリとして進める。

## 手順

1. 依存関係をインストールする。

   ```sh
   npm install
   ```

2. サンドボックスを1回だけデプロイする（watchモードにしない）。

   ```sh
   npx ampx sandbox --once
   ```

   - `--identifier`省略時はOSのユーザー名が使われる。同じ識別子で過去に
     デプロイ済みなら既存スタックを更新（再利用）する。
   - 成功すると`amplify_outputs.json`が生成される。中の
     `auth.user_pool_id` / `auth.user_pool_client_id` / `auth.aws_region`
     を控えておく。

3. front の`.env`（`.env.example`をコピーして作成）を編集する。

   ```
   NEXT_PUBLIC_AUTH_MODE=cognito
   ```

4. back の`.env`（`.env.example`をコピーして作成）に、手順2で控えた値を
   設定する。

   ```
   AUTH_MODE=cognito
   AWS_REGION=<auth.aws_region>
   USERPOOL_ID=<auth.user_pool_id>
   APP_CLIENT_ID=<auth.user_pool_client_id>
   ```

## つまずきやすい点

### `Cannot find module 'constructs'` / `'@aws/lambda-invoke-store'`

`@aws-amplify/backend` / `aws-cdk-lib`がpeer dependencyとして要求する
`constructs`が`package.json`に直接の依存として書かれておらず、
`npm install`だけでは`node_modules`に入らないことがある
（依存解決の状態によっては`@aws/lambda-invoke-store`など他の入れ子依存も
同様に欠落する）。`npx ampx sandbox`が`Cannot find module`で即座に落ちる
場合は、`node_modules`を削除してクリーンに`npm install`し直すか、
欠けているパッケージを直接`npm install <package名>`で追加する。

### `Invalid AttributeDataType input` でUPDATEが失敗する

`amplify/auth/resource.ts`の`userAttributes`設定を変更してデプロイし直すと、
既存のUser Poolに対する属性変更としてCloudFormationのUPDATEが走るが、
**Cognito User Poolはユーザー属性スキーマを作成後に変更できない**ため
`Invalid AttributeDataType input, consider using the provided
AttributeDataType enum`のようなエラーでロールバックする。CLIも対話的に
「サンドボックスを再作成しますか（ユーザーデータは全削除されます）」と
確認してくる。

このリポジトリのサンドボックスは各開発者のローカル専用（識別子=OSユーザー
名）なので、登録済みテストユーザーが消えても問題なければ、削除して
作り直すのが早い。

```sh
npx ampx sandbox delete
npx ampx sandbox --once
```

## 参考URL

- Amplify Gen2 認証設定: <https://docs.amplify.aws/gen2/build-a-backend/auth>
- Cognito User Poolの属性: <https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html>
- AWS Lambda Web Adapter（backのLambda実行方式）: <https://github.com/awslabs/aws-lambda-web-adapter>
