# Stores this stack's state in the S3 bucket created by infra/bootstrap, and locks it in DynamoDB.
# Backend blocks can't use variables, so the bucket name is written out in full.
terraform {
  backend "s3" {
    bucket         = "pragyaprep-tfstate-552808407801"
    key            = "dev/network.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "pragyaprep-tflock"
    encrypt        = true
  }
}
