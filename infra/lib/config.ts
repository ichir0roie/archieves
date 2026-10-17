import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// 構築ごとの設定。アカウント・リソースの ID は git に入れず、infra/aws.json に置く(形は infra/aws.example.json)
export interface DeployConfig {
  // subClaimPrefix は GitHub の OIDC の sub の前半。immutable subject を使うリポジトリは sub が
  // `repo:<owner>@<ID>/<repo>@<ID>` で始まるので、`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` の
  // sub_claim_prefix を置く。無ければ `repo:<repository>`
  // branch は本番(main)、devBranch は develop 環境に流すブランチ(省けば develop)
  github: { repository: string; branch: string; devBranch?: string; subClaimPrefix?: string };
  // name は本番の db。develop 環境は同じインスタンスの `<name>-dev` を使う
  db: { instanceIdentifier: string; name: string };
  // Lambda を置くサブネット。省けば RDS の DB サブネットグループのもの
  functionSubnetIds?: string[];
}

export function loadDeployConfig(): DeployConfig {
  let raw: string;
  try {
    raw = readFileSync(new URL("../aws.json", import.meta.url), "utf-8");
  } catch {
    throw new Error("infra/aws.json が無い。infra/aws.example.json を写して埋める");
  }
  const config = JSON.parse(raw) as DeployConfig;
  if (!config.github?.repository || !config.github?.branch || !config.db?.instanceIdentifier || !config.db?.name) {
    throw new Error("infra/aws.json に github.repository・github.branch・db.instanceIdentifier・db.name が要る");
  }
  return config;
}

export interface ExistingDb {
  vpcId: string;
  endpoint: string;
  port: number;
  securityGroupId: string;
  resourceId: string;
  subnetIds: string[];
}

// CDK には RDS のインスタンスを引く仕組みが無いので、synth のときに AWS CLI で引く
export function describeDbInstance(instanceIdentifier: string): ExistingDb {
  const [instance] = JSON.parse(execFileSync("aws", [
    "rds", "describe-db-instances", "--db-instance-identifier", instanceIdentifier,
    "--query", "DBInstances", "--output", "json",
  ], { encoding: "utf-8" }));
  if (!instance.IAMDatabaseAuthenticationEnabled) {
    throw new Error(`${instanceIdentifier} の IAM データベース認証を有効にしてから使う`);
  }
  return {
    vpcId: instance.DBSubnetGroup.VpcId,
    endpoint: instance.Endpoint.Address,
    port: instance.Endpoint.Port,
    securityGroupId: instance.VpcSecurityGroups[0].VpcSecurityGroupId,
    resourceId: instance.DbiResourceId,
    subnetIds: instance.DBSubnetGroup.Subnets.map((s: { SubnetIdentifier: string }) => s.SubnetIdentifier),
  };
}

// API のイメージの置き場。本番と develop 環境で一つを使い分ける(tag で分ける)
export const repositoryName = "archieves-api";

// 本番(prod)と develop 環境(dev)。どちらも同じ RDS のインスタンスに、別の db・別の db のロールで繋ぐ。
// db のロールを分けるのは、dev の Lambda の IAM データベース認証で本番の db に入れないようにするため
export type Stage = "prod" | "dev";

export interface StageConfig {
  stage: Stage;
  // GitHub Actions がデプロイするブランチ
  branch: string;
  dbName: string;
  // SSM のパラメータの頭。合言葉・関数 URL・Amplify のロールを置く
  parameterPrefix: string;
  // GitHub Actions が引き受けるロールの名前
  deployRoleName: string;
  // API のイメージは CI(.github/workflows/deploy-api.yml)が <sha> と imageTag の tag で push する。CDK は imageTag を指すだけで建てない
  api: {
    functionName: string;
    imageTag: string;
    // 一人〜数人で使う前提の大きさ。足りなければここを上げる
    memorySize: number;
    // 呼ぶ側が暴れても、費用と db の接続数がこれ以上に膨らまないようにする(接続は関数ごとに DB_POOL_SIZE まで)
    reservedConcurrentExecutions: number;
    dbPoolSize: number;
  };
  // マイグレーションだけを流す関数。API と同じイメージを、コマンドだけ差し替えて動かす(app/migration_app.py)。
  // CI がブランチへの push ごとに、API より先にイメージを差し替えて呼ぶ
  migration: { functionName: string; command: string[]; memorySize: number };
  // Amplify の SSR のコンピュートロール。own はこのスタックで作る(アプリの単位で付ける本番のもの)。
  // 文字列なら、そのロールの ARN を置いた SSM のパラメータの名前で、そのロールに関数 URL の呼び出しを許すだけにする。
  // Amplify Gen 2 がブランチにバックエンドを結び付ける処理(BranchLinker)は、ブランチの単位のロールの iam:PassRole を
  // 持たずに落ちるので、develop のブランチにはロールを付けず、アプリの単位のロール(本番のもの)を使い回す
  amplifyComputeRole: "own" | { parameterName: string };
  // アプリが使う db のロール。行の読み書きだけを許す(infra/sql/archieves_roles.sql)
  appDatabaseUser: string;
  // マイグレーションを流す db のロール。表の持ち主(infra/sql/archieves_roles.sql)
  migrationDatabaseUser: string;
}

export function stageConfig(stage: Stage, config: DeployConfig): StageConfig {
  const migrationCommand = ["app.migration_app:app"];
  if (stage === "prod") {
    return {
      stage,
      branch: config.github.branch,
      dbName: config.db.name,
      parameterPrefix: "/archieves",
      deployRoleName: "github-archieves-deploy",
      api: {
        functionName: "archieves-api",
        imageTag: "main",
        memorySize: 512,
        reservedConcurrentExecutions: 10,
        dbPoolSize: 2,
      },
      migration: { functionName: "archieves-migrate", command: migrationCommand, memorySize: 512 },
      amplifyComputeRole: "own",
      appDatabaseUser: "archieves_app",
      migrationDatabaseUser: "archieves_migrator",
    };
  }
  return {
    stage,
    branch: config.github.devBranch ?? "develop",
    dbName: `${config.db.name}-dev`,
    parameterPrefix: "/archieves/dev",
    deployRoleName: "github-archieves-deploy-dev",
    api: {
      functionName: "archieves-api-dev",
      imageTag: "develop",
      memorySize: 512,
      // 確かめに使うだけなので、db の接続を本番より食わせない
      reservedConcurrentExecutions: 3,
      dbPoolSize: 2,
    },
    migration: { functionName: "archieves-migrate-dev", command: migrationCommand, memorySize: 512 },
    // 本番のスタックが置く、アプリの単位のロールの ARN
    amplifyComputeRole: { parameterName: "/archieves/amplify/compute-role-arn" },
    appDatabaseUser: "archieves_dev_app",
    migrationDatabaseUser: "archieves_dev_migrator",
  };
}
