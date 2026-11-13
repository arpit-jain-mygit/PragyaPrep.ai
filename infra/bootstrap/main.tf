# Bootstrap: creates the S3 bucket that stores Terraform state, and the DynamoDB table that
# stops two people (or two runs) from changing the same infrastructure at once.
# This stack uses local state, because it creates the place where remote state will live.
# Run it with: AWS_PROFILE=pragyaprep-dev terraform apply

provider "aws" {
  region = var.region

  # Tags added to every resource, so costs and ownership are easy to find later.
  default_tags {
    tags = {
      project    = "pragyaprep"
      managed_by = "terraform"
      stack      = "bootstrap"
    }
  }
}

# Reads the AWS account this run is using, so the bucket name is unique to this account.
data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

# ---- State bucket ----

resource "aws_s3_bucket" "tfstate" {
  bucket = "pragyaprep-tfstate-${local.account_id}"

  # Stops an accidental `terraform destroy` from deleting the state of every environment.
  lifecycle {
    prevent_destroy = true
  }
}

# Keeps old versions of the state file, so a bad change can be rolled back.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypts the state file at rest. State can contain secret values.
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Blocks all public access. The state bucket must never be public.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---- Lock table ----

# Terraform writes a lock row here while it runs. Other runs wait until the row is removed.
resource "aws_dynamodb_table" "tflock" {
  name         = "pragyaprep-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}
