#!/bin/bash
# API のイメージを手元で建て、ECR の archieves-api に、その環境の tag(本番は main、develop 環境は develop)で push する。
# その環境の関数(ArchievesApi・ArchievesApiDev)を初めて作る前に一度だけ使う。
# 以降は GitHub Actions(.github/workflows/deploy-api.yml)が push する。リポジトリのルートから:
#   infra/lambda/push-image.sh           # main
#   infra/lambda/push-image.sh develop   # develop 環境
set -euo pipefail

tag=${1:-main}

registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(aws configure get region).amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry" >&2
docker buildx build --platform linux/arm64 --provenance=false \
  -f source/back/.build/Dockerfile -t "$registry/archieves-api:$tag" --push source/back
