output "account_ids" {
  description = "Account ID of each member account, by name."
  value       = { for name, account in aws_organizations_account.member : name => account.id }
}
