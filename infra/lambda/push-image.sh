#!/bin/bash
# API のイメージを手元で建て、ECR の archieves-api に main の tag で push する。関数(ArchievesApi)を初めて作る前に一度だけ使う。
# 以降は GitHub Actions(.github/workflows/deploy-api.yml)が push する。リポジトリのルートから: infra/lambda/push-image.sh
set -euo pipefail

registry=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$(aws configure get region).amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry" >&2
docker buildx build --platform linux/amd64 --provenance=false \
  -f source/back/.build/Dockerfile -t "$registry/archieves-api:main" --push source/back
