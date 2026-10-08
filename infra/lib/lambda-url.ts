import * as iam from "aws-cdk-lib/aws-iam";

// 関数 URL を AWS_IAM で呼ぶには、InvokeFunctionUrl と(2025 年 10 月から)InvokeFunction の両方が要る。
// InvokeFunction は関数 URL 越しに限り、関数を直に invoke する道には使わせない
export function grantInvokeViaFunctionUrl(role: iam.Role, functionArn: string): void {
  role.addToPolicy(new iam.PolicyStatement({
    actions: ["lambda:InvokeFunctionUrl"],
    resources: [functionArn],
    conditions: { StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" } },
  }));
  role.addToPolicy(new iam.PolicyStatement({
    actions: ["lambda:InvokeFunction"],
    resources: [functionArn],
    conditions: { Bool: { "lambda:InvokedViaFunctionUrl": "true" } },
  }));
}
