import { App, Tags } from "aws-cdk-lib";
import { ArchievesApiStack } from "../lib/api-stack.js";
import { ArchievesCiStack } from "../lib/ci-stack.js";
import { describeDbInstance, loadDeployConfig, stageConfig } from "../lib/config.js";

// アカウントとリージョンは、cdk を動かす人の AWS CLI のプロファイルから取る
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };
const config = loadDeployConfig();

const app = new App();
Tags.of(app).add("project", "archieves");

const prod = stageConfig("prod", config);
const dev = stageConfig("dev", config);
const db = describeDbInstance(config.db.instanceIdentifier);

// 関数は ECR にその環境の tag(main / develop)のイメージがある前提で作るので、ArchievesCi を先に deploy して
// push してから ArchievesApi・ArchievesApiDev を deploy する
new ArchievesCiStack(app, "ArchievesCi", { env, github: config.github, stages: [prod, dev] });
new ArchievesApiStack(app, "ArchievesApi", {
  env,
  stage: prod,
  db,
  functionSubnetIds: config.functionSubnetIds,
});
// develop 環境。本番と同じ RDS のインスタンスの、別の db(<name>-dev)に、別の db のロールで繋ぐ
new ArchievesApiStack(app, "ArchievesApiDev", {
  env,
  stage: dev,
  db,
  functionSubnetIds: config.functionSubnetIds,
});
