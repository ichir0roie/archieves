# ローカル環境からRDS(PostgreSQL)へのアクセス方法

前提: [postgresql_on_aws.md](postgresql_on_aws.md) の結論通り、RDSは`publicly accessible`を無効にした非公開構成。ここではローカル開発機からこの非公開RDSに繋ぐ方法を決める。



## 結論(決定): EC2 Instance Connect Endpoint (EICエンドポイント) を採用

- 踏み台EC2やNAT Gatewayを一切使わず、AWSマネージドの「EC2 Instance Connect Endpoint」経由でローカルからRDSへTCPトンネルを張る
- RDSは非公開のまま(セキュリティグループでEICエンドポイントからの5432番のみ許可)
- **追加コストは実質$0**(同一AZ内なら時間課金なし。AZを跨ぐ場合のみデータ転送料がわずかに発生)

## 比較検討(決定前のメモ)

| 方式 | 月額目安 | DBの露出 | 備考 |
| --- | --- | --- | --- |
| **EICエンドポイント + ローカルTCPトンネル(採用)** | $0 | 非公開のまま | 管理するEC2不要、時間課金なし |
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
  --group-name eic-endpoint-sg \
  --description "SG for EC2 Instance Connect Endpoint" \
  --vpc-id <VPC_ID> \
  --query GroupId --output text)
echo $EIC_SG
```

### 2. RDSのセキュリティグループにインバウンドルールを追加

EICエンドポイントのSGからの5432番のみ許可する。

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SG> \
  --protocol tcp --port 5432 \
  --source-group $EIC_SG
```

### 3. EICエンドポイントを作成

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

`State`が`create-complete`になったら`InstanceConnectEndpointId`を控える(以下`$EICE_ID`)。

### 4. RDSのプライベートIPを確認

`open-tunnel`は接続先をIPアドレスで指定する必要がある(ホスト名不可)。RDSのエンドポイント名を名前解決して控える。

```bash
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier <DB_INSTANCE_ID> \
  --query "DBInstances[0].Endpoint.Address" --output text)

dig +short $RDS_ENDPOINT
```


### 5. ローカルからトンネルを張る

```bash
aws ec2-instance-connect open-tunnel \
  --instance-connect-endpoint-id $EICE_ID \
  --private-ip-address <RDS_PRIVATE_IP> \
  --remote-port 5432 \
  --local-port 5432
```

コマンドを実行したターミナルはフォアグラウンドで待機し続ける(トンネルを維持する)。接続を切るには`Ctrl+C`。

### 6. 別ターミナルでpsql接続

```bash
psql -h localhost -p 5432 -U <DB_USER> -d <DB_NAME>
```

### 必要なIAM権限(ローカルで`aws`コマンドを叩くユーザー/ロール側)

- `ec2-instance-connect:OpenTunnel`
- `ec2:DescribeInstanceConnectEndpoints`(状態確認用)

## 運用上の注意

- EICエンドポイント自体は作りっぱなしで放置してよい(時間課金がないため、EC2踏み台のように止め忘れを気にする必要がない)
- `--max-tunnel-duration`のデフォルトは3600秒。長時間の作業ではトンネルが切れたら5の手順を再実行する
- チーム開発でメンバーが増えたら、IAMポリシーで`ec2-instance-connect:OpenTunnel`を必要な人だけに絞る
