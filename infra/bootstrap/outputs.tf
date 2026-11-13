# Values the other infra stacks need, so they can point their remote state at this bucket and table.

output "state_bucket" {
  description = "S3 bucket that stores Terraform state."
  value       = aws_s3_bucket.tfstate.bucket
}

output "lock_table" {
  description = "DynamoDB table used for Terraform state locks."
  value       = aws_dynamodb_table.tflock.name
}
