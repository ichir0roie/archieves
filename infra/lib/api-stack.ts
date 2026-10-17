import { execFileSync } from "node:child_process";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { type ExistingDb, repositoryName, type StageConfig } from "./config.js";
import { grantInvokeViaFunctionUrl } from "./lambda-url.js";

interface ArchievesApiStackProps extends StackProps {
  stage: StageConfig;
  db: ExistingDb;
  // 置くサブネット。省けば RDS の DB サブネットグループのもの
  functionSubnetIds?: string[];
}

// API(source/back、FastAPI)の Lambda を RDS と同じ VPC の中に置く。NAT も Secrets Manager・SSM の VPC エンドポイントも置かず、
// db へは IAM データベース認証のトークン(Lambda の中で署名する)で繋ぐ。そのため Cognito の公開鍵も取りに行けず、
// 利用者の確かめはフロントのサーバーが行う(API は AUTH_MODE=proxy。app/core/security.py)。
// 関数 URL は AWS_IAM で、Amplify の SSR のコンピュートロール(ここで作る)だけが呼べる
export class ArchievesApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ArchievesApiStackProps) {
    super(scope, id, props);
    const { db, stage } = props;
    const { api, migration, parameterPrefix } = stage;

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcId: db.vpcId });
    const functionSecurityGroup = new ec2.SecurityGroup(this, "FunctionSecurityGroup", {
      vpc,
      description: `${api.functionName} Lambda`,
      allowAllOutbound: true,
    });
    const dbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, "DbSecurityGroup", db.securityGroupId, {
      mutable: true,
    });
    dbSecurityGroup.addIngressRule(functionSecurityGroup, ec2.Port.tcp(db.port), `${api.functionName} Lambda`);

    const repository = ecr.Repository.fromRepositoryName(this, "ApiRepository", repositoryName);
    const subnetIds = props.functionSubnetIds ?? db.subnetIds;
    const vpcSubnets: ec2.SubnetSelection = {
      subnets: subnetIds.map((subnetId, i) => ec2.Subnet.fromSubnetId(this, `Subnet${i}`, subnetId)),
    };

    const connection = (user: string) => ({
      DB_HOST: db.endpoint,
      DB_PORT: String(db.port),
      DB_USER: user,
      DB_NAME: stage.dbName,
      DB_IAM_AUTH: "true",
    });
    const dbRole = (user: string) => {
      const role = new iam.Role(this, `${user}Role`, {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole")],
      });
      role.addToPolicy(new iam.PolicyStatement({
        actions: ["rds-db:connect"],
        resources: [`arn:aws:rds-db:${this.region}:${this.account}:dbuser:${db.resourceId}/${user}`],
      }));
      return role;
    };
    // Lambda が自動で作るロググループは保存期間が無期限で CloudFormation の外にあるので、こちらで作って短く切る
    const logGroup = (name: string) => new logs.LogGroup(this, name, {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // CI が差し替えたイメージは、template の ImageUri(repo:main)が変わらない限り cdk deploy で戻らない
    const fn = new lambda.DockerImageFunction(this, "Function", {
      functionName: api.functionName,
      code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: api.imageTag }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: api.memorySize,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: api.reservedConcurrentExecutions,
      role: dbRole(stage.appDatabaseUser),
      logGroup: logGroup("FunctionLogGroup"),
      vpc,
      vpcSubnets,
      securityGroups: [functionSecurityGroup],
      environment: {
        ...connection(stage.appDatabaseUser),
        ENV: stage.stage,
        AUTH_MODE: "proxy",
        DB_POOL_SIZE: String(api.dbPoolSize),
        API_KEYS: `web=${readApiKey(parameterPrefix, "web")}`,
      },
    });
    // 署名の無い要求は関数が起きる前に Lambda が弾くので、URL を叩かれ続けても料金もログも生まれない。
    // 署名の上に合言葉(x-archieves-api-key。app/core/api_keys.py)も要るので、ロールを持つ別のものが呼んでも通らない
    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });
    let amplifyComputeRoleArn: string;
    if (stage.amplifyComputeRole === "own") {
      // Amplify のアプリは CDK の外にあるので、このロールは aws amplify update-app --compute-role-arn で付ける
      const amplifyComputeRole = new iam.Role(this, "AmplifyComputeRole", {
        assumedBy: new iam.ServicePrincipal("amplify.amazonaws.com"),
        description: `Amplify SSR (source/front) calls ${api.functionName} function URL`,
      });
      grantInvokeViaFunctionUrl(amplifyComputeRole, fn.functionArn);
      amplifyComputeRoleArn = amplifyComputeRole.roleArn;
    } else {
      // ほかのスタックのロールは変えず、関数の側(リソースポリシー)で、そのロールに関数 URL 越しの呼び出しだけを許す
      amplifyComputeRoleArn = ssm.StringParameter.valueForStringParameter(this, stage.amplifyComputeRole.parameterName);
      const principal = new iam.ArnPrincipal(amplifyComputeRoleArn);
      fn.addPermission("AmplifyInvokeFunctionUrl", {
        principal,
        action: "lambda:InvokeFunctionUrl",
        functionUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
      });
      fn.addPermission("AmplifyInvokeViaFunctionUrl", {
        principal,
        action: "lambda:InvokeFunction",
        invokedViaFunctionUrl: true,
      });
    }

    // マイグレーションだけを流す関数。表の持ち主のロール(archieves_migrator)で IAM データベース認証で繋ぐ。
    // URL は持たせず、CI(.github/workflows/deploy-api.yml)が直に invoke する
    const migrationFunction = new lambda.DockerImageFunction(this, "MigrationFunction", {
      functionName: migration.functionName,
      code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: api.imageTag, cmd: migration.command }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: migration.memorySize,
      timeout: Duration.minutes(15),
      // 二つのマイグレーションが同時に流れないようにする
      reservedConcurrentExecutions: 1,
      role: dbRole(stage.migrationDatabaseUser),
      logGroup: logGroup("MigrationFunctionLogGroup"),
      vpc,
      vpcSubnets,
      securityGroups: [functionSecurityGroup],
      environment: {
        ...connection(stage.migrationDatabaseUser),
        ENV: stage.stage,
      },
    });

    // Amplify の環境変数と GitHub の設定に写す値。手で控えなくても SSM から引ける
    new ssm.StringParameter(this, "FunctionUrlParameter", {
      parameterName: `${parameterPrefix}/api/function-url`,
      stringValue: url.url,
    });
    new ssm.StringParameter(this, "AmplifyComputeRoleParameter", {
      parameterName: `${parameterPrefix}/amplify/compute-role-arn`,
      stringValue: amplifyComputeRoleArn,
    });
    new CfnOutput(this, "FunctionUrl", { value: url.url });
    new CfnOutput(this, "AmplifyComputeRoleArn", { value: amplifyComputeRoleArn });
    new CfnOutput(this, "MigrationFunctionName", { value: migrationFunction.functionName });
  }
}

// 合言葉の値は SSM の SecureString に置き、git には入れない。deploy のときに読んで Lambda の環境変数に渡す
// (VPC の中の Lambda は、エンドポイント無しでは SSM を読めないため)
function readApiKey(parameterPrefix: string, caller: "web"): string {
  return execFileSync("aws", [
    "ssm", "get-parameter", "--name", `${parameterPrefix}/api-keys/${caller}`, "--with-decryption",
    "--query", "Parameter.Value", "--output", "text",
  ], { encoding: "utf-8" }).trim();
}
