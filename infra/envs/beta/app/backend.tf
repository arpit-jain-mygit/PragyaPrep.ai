# Stores this stack's state in S3 with DynamoDB locking.
# The bucket, key, region and lock table are passed in by infra/scripts/deploy.sh, so the same code
# works in any AWS account. Nothing account-specific is written here.
terraform {
  backend "s3" {}
}
