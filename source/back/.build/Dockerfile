# Runs unchanged both locally (docker run -p 8080:8080 ...) and on AWS
# Lambda: the AWS Lambda Web Adapter extension translates API Gateway
# events into plain HTTP requests against the uvicorn server below, so the
# app itself never needs a Lambda-specific handler (no Mangum required).
# Base image is the AWS-managed Lambda Python image, so ENTRYPOINT must be
# overridden to launch uvicorn directly instead of the default Lambda
# runtime entrypoint (CMD alone would be read as a `module.handler` name).
# https://github.com/awslabs/aws-lambda-web-adapter
FROM public.ecr.aws/lambda/python:3.14

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic.ini .
COPY alembic ./alembic

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
