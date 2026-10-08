# Runs unchanged both locally (docker run -p 8080:8080 ...) and on AWS
# Lambda: the AWS Lambda Web Adapter extension translates API Gateway
# events into plain HTTP requests against the uvicorn server below, so the
# app itself never needs a Lambda-specific handler (no Mangum required).
# Base image is the AWS-managed Lambda Python image, so ENTRYPOINT must be
# overridden to launch uvicorn directly instead of the default Lambda
# runtime entrypoint (CMD alone would be read as a `module.handler` name).
# CMD は ASGI アプリの指定だけにして、マイグレーションの Lambda(archieves-migrate)が
# 同じイメージで app.migration_app:app に差し替えられるようにする。
# https://github.com/awslabs/aws-lambda-web-adapter
FROM public.ecr.aws/lambda/python:3.14

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic.ini .
COPY alembic ./alembic

# Lambda Web Adapter が起動を確かめる道(合言葉なしで通す PUBLIC_PATHS と同じ。app/core/api_keys.py)
ENV PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/api/v1/health
EXPOSE 8080

ENTRYPOINT ["python", "-m", "uvicorn", "--host", "0.0.0.0", "--port", "8080"]
CMD ["app.main:app"]
