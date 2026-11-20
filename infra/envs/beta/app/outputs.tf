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

output "web_url" {
  description = "Where the website is. Share this address."
  value       = local.site_url
}

output "web_bucket" {
  description = "The bucket the website files are copied to (infra/scripts/deploy-web.sh does this)."
  value       = aws_s3_bucket.web.bucket
}

output "web_distribution_id" {
  description = "CloudFront distribution. Its cache is cleared after each website deploy."
  value       = aws_cloudfront_distribution.web.id
}
