# Inputs for the account factory. member_accounts comes from accounts.auto.tfvars.json,
# which infra/scripts/new-account.sh keeps up to date.

variable "region" {
  description = "Region where IAM Identity Center is enabled."
  type        = string
  default     = "ap-south-1"
}

variable "member_accounts" {
  description = "Member accounts to create, keyed by account name. Each needs a unique email address."
  type = map(object({
    email = string
  }))
  default = {}
}

variable "sso_user_name" {
  description = "Identity Center user who gets admin access to every member account."
  type        = string
  default     = "pragyaprep"
}

variable "permission_set_name" {
  description = "Existing Identity Center permission set to assign."
  type        = string
  default     = "AdministratorAccess"
}
