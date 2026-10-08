import { App, Tags } from "aws-cdk-lib";
import { ArchievesApiStack } from "../lib/api-stack.js";
import { ArchievesCiStack } from "../lib/ci-stack.js";
import { describeDbInstance, loadDeployConfig } from "../lib/config.js";

// アカウントとリージョンは、cdk を動かす人の AWS CLI のプロファイルから取る
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };
const config = loadDeployConfig();

const app = new App();
Tags.of(app).add("project", "archieves");

// 関数は ECR に main の tag のイメージがある前提で作るので、ArchievesCi を先に deploy して push してから ArchievesApi を deploy する
new ArchievesCiStack(app, "ArchievesCi", { env, github: config.github });
new ArchievesApiStack(app, "ArchievesApi", {
  env,
  db: { ...describeDbInstance(config.db.instanceIdentifier), name: config.db.name },
  functionSubnetIds: config.functionSubnetIds,
});
