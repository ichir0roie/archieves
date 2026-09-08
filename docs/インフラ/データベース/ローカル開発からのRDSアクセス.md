# ローカル環境からRDS(PostgreSQL)へのアクセス方法

前提: [postgresql_on_aws.md](postgresql_on_aws.md) の結論通り、RDSは`publicly accessible`を無効にした非公開構成。ここではローカル開発機からこの非公開RDSに繋ぐ方法を決める。

## 結論(決定): 踏み台EC2(SSHのみ) + EC2 Instance Connect Endpoint (EICE) 経由のSSHローカルフォワーディングを採用

> **2026-09-08 訂正**: 当初はEICEの`open-tunnel`でRDSの5432番へ直接トンネルする方式を採用としていたが、実際に試したところ`InvalidParameter: The specified RemotePort is not valid. Specify either 22 or 3389 as the RemotePort`で失敗した。これはIAM権限の不足ではなく、2023年6月のAWS仕様変更により`open-tunnel`のリモートポートが22(SSH)・3389(RDP)以外受け付けなくなったことによるハード制限(rootユーザーでも回避不可)。そのため、SSHのみ許可した小型EC2を踏み台として一台用意し、EICE経由でその22番にSSHしたうえでSSHのローカルフォワーディング機能でRDSの5432番へ中継する方式に変更した。

- 踏み台EC2(`t4g.nano`, SSHのみ許可, 非公開サブネット)を1台用意し、EICE経由でSSH接続する
- EICE自体は踏み台EC2の22番へのSSHにのみ使う(RDSへの直接トンネルはAWS仕様上不可)
- `aws ec2-instance-connect ssh`コマンドが、一時SSH鍵の発行・EICE経由の接続・ローカルフォワーディングを一括で行ってくれる(事前のキーペア配布不要)
- RDSは非公開のまま(セキュリティグループで踏み台EC2のSGからの5432番のみ許可)
- **追加コストは踏み台EC2の稼働分のみ**(`t4g.nano`で月額目安$2〜3+EBS。同一AZ内ならEICEのデータ転送料は発生しない)

## 比較検討(決定前のメモ)

| 方式 | 月額目安 | DBの露出 | 備考 |
| --- | --- | --- | --- |
| ~~EICエンドポイントでRDSへ直接トンネル~~ | ~~$0~~ | ~~非公開のまま~~ | **2026-09-08時点でAWS仕様上不可能と判明(下記訂正参照)。当初案として検討したが不採用に変更** |
| **踏み台EC2(SSHのみ)+ EICE経由SSHローカルフォワーディング(採用)** | 約$2〜3/月 | 非公開のまま | 踏み台EC2はSSHのみ許可、パッチ管理は必要だが攻撃面は小さい |
| パブリックRDS + SGで自宅IPのみ許可 | $0 | インターネットに露出(IP+SSL制限あり) | 一番セットアップは楽だが自宅IP固定が前提、DBを直接ネットに出すリスクがある |
| 小型EC2踏み台 + SSMポートフォワード | 約$3〜8/月 | 非公開 | パブリックサブネット+パブリックIPならVPC Endpoint不要。EC2のパッチ管理が発生 |
| AWS Client VPN | 約$72/月〜(subnet association $0.10〜0.15/h + 接続$0.05/h) | 非公開 | 個人利用にはオーバースペック・高すぎるため不採用 |

## 構築手順

### 前提条件

- RDS PostgreSQLがVPC内に作成済み(非公開、DBサブネットグループは2AZ以上)
- RDSのセキュリティグループのIDを控えておく(例: `sg-xxxxxxxx`、以下`$RDS_SG`)
- RDSが属するVPC ID・サブネットIDを控えておく

### 1. EICエンドポイント用セキュリティグループを作成

アウトバウンドはデフォルト(全許可)のままでよい。専用SGを1つ作る。

```bash
EIC_SG=$(aws ec2 create-security-group \
  --group-name eic-endpoint \
  --description "SG for EC2 Instance Connect Endpoint" \
  --vpc-id <VPC_ID> \
  --query GroupId --output text)
echo $EIC_SG
```

### 2. EICエンドポイントを作成

RDSと同一VPC内のサブネットであればどこでもよい(パブリック/プライベート問わず、インターネット到達性は不要)。同一AZのサブネットを選ぶとデータ転送料も発生しない。

```bash
aws ec2 create-instance-connect-endpoint \
  --subnet-id <SUBNET_ID> \
  --security-group-ids $EIC_SG \
  --tag-specifications 'ResourceType=instance-connect-endpoint,Tags=[{Key=Name,Value=rds-access-eice}]'
```

作成完了まで数十秒かかる。状態確認:

```bash
aws ec2 describe-instance-connect-endpoints \
  --query "InstanceConnectEndpoints[].{Id:InstanceConnectEndpointId,State:State}" \
  --output table
```

### 3. 踏み台EC2用セキュリティグループを作成し、SSHのみ許可

EICエンドポイントSGからの22番のみ許可する。

```bash
BASTION_SG=$(aws ec2 create-security-group \
  --group-name rds-bastion-sg \
  --description "SSH bastion for RDS access via EICE" \
  --vpc-id <VPC_ID> \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $BASTION_SG \
  --protocol tcp --port 22 \
  --source-group $EIC_SG
```

### 4. RDSのセキュリティグループに踏み台EC2からのインバウンドルールを追加

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SG> \
  --protocol tcp --port 5432 \
  --source-group $BASTION_SG
```

### 5. 踏み台EC2を起動

SSHのみ動作すればよいので最小構成(`t4g.nano`, Amazon Linux 2023 ARM, 非公開サブネット, キーペア不要)。

```bash
AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --query "Parameter.Value" --output text)

aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t4g.nano \
  --subnet-id <SUBNET_ID> \
  --security-group-ids $BASTION_SG \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=rds-bastion}]'
```

`InstanceId`を控える(以下`$BASTION_ID`)。

### 6. ローカルからSSHローカルフォワーディングでトンネルを張る

`aws ec2-instance-connect ssh`が一時鍵の発行・EICE経由接続・ローカルフォワーディングをまとめて行う。

```bash
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier <DB_INSTANCE_ID> \
  --query "DBInstances[0].Endpoint.Address" --output text)

aws ec2-instance-connect ssh \
  --instance-id $BASTION_ID \
  --connection-type eice \
  --local-forwarding "5432:${RDS_ENDPOINT}:5432"
```

コマンドを実行したターミナルはSSHセッションとして待機し続ける(トンネルを維持する)。接続を切るには`Ctrl+C`または`exit`。

### 7. 別ターミナルでpsql接続

```bash
psql -h localhost -p 5432 -U <DB_USER> -d <DB_NAME>
```

### 必要なIAM権限(ローカルで`aws`コマンドを叩くユーザー/ロール側)

- `ec2-instance-connect:SendSSHPublicKey`
- `ec2-instance-connect:OpenTunnel`(踏み台EC2の22番向けのみ。RDSの5432番等、22/3389以外のポートには使えない)
- `ec2:DescribeInstanceConnectEndpoints`(状態確認用)
- `ec2:DescribeInstances`(踏み台EC2の情報取得用)

## 運用上の注意

- EICエンドポイント自体は作りっぱなしで放置してよい(時間課金がないため、EC2踏み台のように止め忘れを気にする必要がない)
- 踏み台EC2は稼働時間分課金されるため、長期間使わない場合は`aws ec2 stop-instances`で停止しておく(EBS分の料金のみ残る)
- 踏み台EC2はSSHのみ許可しているため攻撃面は小さいが、OSパッチ(`dnf update`)は定期的に当てる
- `--max-tunnel-duration`(EICE側)のデフォルトは3600秒。長時間の作業ではセッションが切れたら6の手順を再実行する
- チーム開発でメンバーが増えたら、IAMポリシーで`ec2-instance-connect:SendSSHPublicKey`/`OpenTunnel`を必要な人だけに絞る

## 実行スクリプト

[scripts/rds-tunnel.sh.example](../../../scripts/rds-tunnel.sh.example)を参照。`cp`して環境固有の値(`BASTION_INSTANCE_ID`等)を埋めた`scripts/rds-tunnel.sh`は`.gitignore`対象。
