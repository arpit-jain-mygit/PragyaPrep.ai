# Account factory: creates member accounts in AWS Organizations and gives the SSO user admin access to each.
# Run with the management account's credentials, through infra/scripts/new-account.sh.

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project    = "pragyaprep"
      managed_by = "terraform"
      stack      = "org"
    }
  }
}

data "aws_organizations_organization" "this" {}

# The Identity Center instance, the existing admin permission set, and the user to give access to.
data "aws_ssoadmin_instances" "this" {}

locals {
  sso_instance_arn  = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]
}

data "aws_ssoadmin_permission_set" "admin" {
  instance_arn = local.sso_instance_arn
  name         = var.permission_set_name
}

data "aws_identitystore_user" "admin" {
  identity_store_id = local.identity_store_id

  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = var.sso_user_name
    }
  }
}

# One member account per entry. AWS also creates the role OrganizationAccountAccessRole in each,
# which the management account can use as a fallback.
resource "aws_organizations_account" "member" {
  for_each = var.member_accounts

  name      = each.key
  email     = each.value.email
  parent_id = data.aws_organizations_organization.this.roots[0].id

  # Removing an entry only takes the account out of the organization. It does not close the account,
  # because closing is slow to undo. Close accounts yourself in the console if you want that.
  close_on_deletion = false

  lifecycle {
    # AWS sets these once at creation, and they can't be changed afterwards.
    ignore_changes = [role_name, iam_user_access_to_billing]
  }
}

# Gives the SSO user admin access to each member account, so `aws sso login` shows it in the portal.
resource "aws_ssoadmin_account_assignment" "admin" {
  for_each = aws_organizations_account.member

  instance_arn       = local.sso_instance_arn
  permission_set_arn = data.aws_ssoadmin_permission_set.admin.arn

  principal_id   = data.aws_identitystore_user.admin.user_id
  principal_type = "USER"

  target_id   = each.value.id
  target_type = "AWS_ACCOUNT"
}
