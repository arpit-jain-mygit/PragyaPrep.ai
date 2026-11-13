# Dev app: DynamoDB table, content bucket, secrets, and the Lambda API behind a Function URL.
# Run with: AWS_PROFILE=pragyaprep-dev terraform plan

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project     = "pragyaprep"
      environment = "dev"
      managed_by  = "terraform"
      stack       = "app"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id    = data.aws_caller_identity.current.account_id
  function_name = "pragyaprep-dev-api"
  ssm_prefix    = "/pragyaprep/dev"
}

# ---- Data: one DynamoDB table (see backend/app/repo.py for the key layout) ----

resource "aws_dynamodb_table" "main" {
  name         = "pragyaprep-dev"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  # Point-in-time recovery lets us roll back the table to any second in the last 35 days.
  point_in_time_recovery {
    enabled = true
  }
}

# ---- Files: videos and PDFs ----

resource "aws_s3_bucket" "content" {
  bucket = "pragyaprep-content-dev-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "content" {
  bucket                  = aws_s3_bucket.content.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "content" {
  bucket = aws_s3_bucket.content.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Browsers upload straight to this bucket, so it must allow the app's origins to POST to it.
resource "aws_s3_bucket_cors_configuration" "content" {
  bucket = aws_s3_bucket.content.id

  cors_rule {
    allowed_methods = ["GET", "POST", "PUT"]
    allowed_origins = var.cors_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Cleans up half-finished uploads after a day, so they don't cost money forever.
resource "aws_s3_bucket_lifecycle_configuration" "content" {
  bucket = aws_s3_bucket.content.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ---- Secrets: stored encrypted in SSM, read by the Lambda at startup ----

resource "aws_ssm_parameter" "secret_key" {
  name  = "${local.ssm_prefix}/secret_key"
  type  = "SecureString"
  value = var.secret_key
}

resource "aws_ssm_parameter" "admin_password" {
  name  = "${local.ssm_prefix}/admin_password"
  type  = "SecureString"
  value = var.admin_password
}

resource "aws_ssm_parameter" "google_client_secret" {
  name = "${local.ssm_prefix}/google_client_secret"
  type = "SecureString"
  # SSM can't store an empty value. Google sign-in stays off while the client ID is empty.
  value = var.google_client_secret == "" ? "not-set" : var.google_client_secret
}

# ---- Lambda: the API ----

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "pragyaprep-dev-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Only what the API needs: this table, this bucket, and this stack's secrets.
data "aws_iam_policy_document" "api" {
  statement {
    sid = "Table"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }

  statement {
    sid       = "ContentBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.content.arn]
  }

  # Signed links are checked against this role, so the role needs the same rights they grant.
  statement {
    sid       = "ContentObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.content.arn}/*"]
  }

  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/*"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "pragyaprep-dev-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# Created here, not left to Lambda, so logs are kept for 14 days and not forever.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = local.function_name
  role             = aws_iam_role.api.arn
  runtime          = "python3.12"
  handler          = "app.lambda_handler.handler"
  architectures    = ["arm64"]
  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)
  memory_size      = 512
  timeout          = 15

  environment {
    variables = {
      PRAGYA_TABLE_NAME       = aws_dynamodb_table.main.name
      PRAGYA_BUCKET_NAME      = aws_s3_bucket.content.bucket
      PRAGYA_AWS_REGION       = var.region
      PRAGYA_SSM_PREFIX       = local.ssm_prefix
      PRAGYA_ADMIN_LOGIN_ID   = var.admin_login_id
      PRAGYA_FRONTEND_URL     = var.frontend_url
      PRAGYA_CORS_ORIGINS     = jsonencode(var.cors_origins)
      PRAGYA_GOOGLE_CLIENT_ID = var.google_client_id
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.api_logs,
    aws_iam_role_policy.api,
  ]
}

# A public HTTPS address for the API. The app itself checks logins, so the URL can be open.
# CORS is handled by the FastAPI app, not here, so headers don't get added twice.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "public_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Newer Function URLs also need InvokeFunction. Anonymous callers still can't invoke it directly,
# because direct invocation requires signed AWS credentials.
resource "aws_lambda_permission" "public_invoke" {
  statement_id  = "AllowPublicInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "*"
}
