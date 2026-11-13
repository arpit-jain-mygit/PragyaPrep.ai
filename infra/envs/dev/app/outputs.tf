# Values needed by the frontend and by later steps.

output "api_url" {
  description = "Base URL of the API. The frontend calls this."
  value       = aws_lambda_function_url.api.function_url
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "content_bucket" {
  value = aws_s3_bucket.content.bucket
}
