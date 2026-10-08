import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { api, type DeployConfig, migration } from "./config.js";
import { grantInvokeViaFunctionUrl } from "./lambda-url.js";

// API のイメージの置き場と、GitHub Actions が引き受けるロール。ロールは指定のブランチの push だけが引き受けられ、
// できることは archieves-api の ECR への push(と、push や関数の差し替えに要るイメージの読み取り)と、
// archieves-api・archieves-migrate 関数のコードの差し替え、archieves-migrate の呼び出し(イメージに入っている
// バージョンまでマイグレーションを流すだけ)、差し替えたあとの確かめに関数 URL を呼ぶことだけにする
// (cdk deploy はさせない。db への道も持たせない)
interface ArchievesCiStackProps extends StackProps {
  github: DeployConfig["github"];
}

export class ArchievesCiStack extends Stack {
  constructor(scope: Construct, id: string, props: ArchievesCiStackProps) {
    super(scope, id, props);
    const { github } = props;
    const subClaimPrefix = github.subClaimPrefix ?? `repo:${github.repository}`;

    const repository = new ecr.Repository(this, "ApiRepository", {
      repositoryName: api.repositoryName,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { description: "tag の無いイメージは 1 日で消す", tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: Duration.days(1) },
        { description: "新しい 30 個を残す", maxImageCount: 30 },
      ],
    });

    // GitHub の OIDC プロバイダはアカウントに一つしか作れず、別のプロジェクトのスタックが作ってあるので引いて使う
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    const deployRole = new iam.Role(this, "GitHubDeployRole", {
      roleName: "github-archieves-deploy",
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `${subClaimPrefix}:ref:refs/heads/${github.branch}`,
        },
      }),
    });
    // buildx の push は既にある目録を読み(BatchGetImage)、関数の差し替えもイメージを読むので、push だけでは足りない
    repository.grantPullPush(deployRole);
    const functionArn = (name: string) => `arn:aws:lambda:${this.region}:${this.account}:function:${name}`;
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
      resources: [functionArn(api.functionName), functionArn(migration.functionName)],
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [functionArn(migration.functionName)],
    }));

    grantInvokeViaFunctionUrl(deployRole, functionArn(api.functionName));

    new CfnOutput(this, "RepositoryUri", { value: repository.repositoryUri });
    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
  }
}
