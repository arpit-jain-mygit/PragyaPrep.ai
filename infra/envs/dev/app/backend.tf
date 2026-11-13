# Stores this stack's state in the S3 bucket from infra/bootstrap, with locking.
terraform {
  backend "s3" {
    bucket         = "pragyaprep-tfstate-552808407801"
    key            = "dev/app.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "pragyaprep-tflock"
    encrypt        = true
  }
}
