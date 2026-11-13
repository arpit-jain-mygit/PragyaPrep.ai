# State lives in the management account's state bucket. infra/scripts/new-account.sh passes the settings in.
terraform {
  backend "s3" {}
}
