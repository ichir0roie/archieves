import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// 構築ごとの設定。アカウント・リソースの ID は git に入れず、infra/aws.json に置く(形は infra/aws.example.json)
export interface DeployConfig {
  // subClaimPrefix は GitHub の OIDC の sub の前半。immutable subject を使うリポジトリは sub が
  // `repo:<owner>@<ID>/<repo>@<ID>` で始まるので、`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` の
  // sub_claim_prefix を置く。無ければ `repo:<repository>`
  github: { repository: string; branch: string; subClaimPrefix?: string };
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

export const parameterPrefix = "/archieves";

// API のイメージは CI(.github/workflows/deploy-api.yml)が <sha> と main の tag で push する。CDK は main を指すだけで建てない
export const api = {
  functionName: "archieves-api",
  repositoryName: "archieves-api",
  imageTag: "main",
  // 一人〜数人で使う前提の大きさ。足りなければここを上げる
  memorySize: 512,
  // 呼ぶ側が暴れても、費用と db の接続数がこれ以上に膨らまないようにする(接続は関数ごとに DB_POOL_SIZE まで)
  reservedConcurrentExecutions: 10,
  dbPoolSize: 2,
};

// マイグレーションだけを流す関数。API と同じイメージを、コマンドだけ差し替えて動かす(app/migration_app.py)。
// CI が main へのマージごとに、API より先にイメージを差し替えて呼ぶ
export const migration = {
  functionName: "archieves-migrate",
  command: ["app.migration_app:app"],
  memorySize: 512,
};

// アプリが使う db のロール。行の読み書きだけを許す(infra/sql/archieves_roles.sql)
export const appDatabaseUser = "archieves_app";
// マイグレーションを流す db のロール。表の持ち主(infra/sql/archieves_roles.sql)
export const migrationDatabaseUser = "archieves_migrator";
