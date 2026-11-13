# Stores this stack's state in S3 with DynamoDB locking.
# The bucket, key, region and lock table are passed in with -backend-config, so the same code
# works in any AWS account. Nothing account-specific is written here.
# This stack is not deployed right now (Lambda needs no VPC), but it is kept for when a private network is needed.
terraform {
  backend "s3" {}
}
