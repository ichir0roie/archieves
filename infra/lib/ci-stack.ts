import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { type DeployConfig, repositoryName, type StageConfig } from "./config.js";
import { grantInvokeViaFunctionUrl } from "./lambda-url.js";

// API のイメージの置き場と、GitHub Actions が引き受けるロール(本番と develop 環境で一つずつ)。ロールは
// その環境のブランチの push だけが引き受けられ、できることは archieves-api の ECR への push(と、push や関数の
// 差し替えに要るイメージの読み取り)と、その環境の API・マイグレーションの関数のコードの差し替え、マイグレーションの
// 関数の呼び出し(イメージに入っているバージョンまでマイグレーションを流すだけ)、差し替えたあとの確かめに関数 URL を
// 呼ぶことだけにする(cdk deploy はさせない。db への道も持たせない)
interface ArchievesCiStackProps extends StackProps {
  github: DeployConfig["github"];
  stages: StageConfig[];
}

export class ArchievesCiStack extends Stack {
  constructor(scope: Construct, id: string, props: ArchievesCiStackProps) {
    super(scope, id, props);
    const { github, stages } = props;
    const subClaimPrefix = github.subClaimPrefix ?? `repo:${github.repository}`;

    const repository = new ecr.Repository(this, "ApiRepository", {
      repositoryName,
      removalPolicy: RemovalPolicy.RETAIN,
      // イメージは、優先度の高いルールのうち当てはまる一つでだけ数えられる。関数が指す main・develop の tag の
      // イメージを先に拾い、「新しい 30 個」で消されないようにする(develop の push が続いても本番のイメージを残す)
      lifecycleRules: [
        { rulePriority: 1, description: "tag の無いイメージは 1 日で消す", tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: Duration.days(1) },
        ...stages.map((stage, i) => ({
          rulePriority: 2 + i,
          description: `${stage.api.imageTag} の tag のイメージは残す`,
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: [stage.api.imageTag],
          maxImageCount: 1,
        })),
        { rulePriority: 10, description: "新しい 30 個を残す", maxImageCount: 30 },
      ],
    });

    // GitHub の OIDC プロバイダはアカウントに一つしか作れず、別のプロジェクトのスタックが作ってあるので引いて使う
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    const functionArn = (name: string) => `arn:aws:lambda:${this.region}:${this.account}:function:${name}`;
    for (const stage of stages) {
      // 本番のロールの論理 ID は、環境を分ける前のまま(作り直させない)
      const id = stage.stage === "prod" ? "GitHubDeployRole" : "GitHubDeployRoleDev";
      const deployRole = new iam.Role(this, id, {
        roleName: stage.deployRoleName,
        assumedBy: new iam.WebIdentityPrincipal(providerArn, {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": `${subClaimPrefix}:ref:refs/heads/${stage.branch}`,
          },
        }),
      });
      // buildx の push は既にある目録を読み(BatchGetImage)、関数の差し替えもイメージを読むので、push だけでは足りない
      repository.grantPullPush(deployRole);
      deployRole.addToPolicy(new iam.PolicyStatement({
        actions: ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
        resources: [functionArn(stage.api.functionName), functionArn(stage.migration.functionName)],
      }));
      deployRole.addToPolicy(new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [functionArn(stage.migration.functionName)],
      }));
      grantInvokeViaFunctionUrl(deployRole, functionArn(stage.api.functionName));
      new CfnOutput(this, stage.stage === "prod" ? "DeployRoleArn" : "DeployRoleArnDev", { value: deployRole.roleArn });
    }

    new CfnOutput(this, "RepositoryUri", { value: repository.repositoryUri });
  }
}
