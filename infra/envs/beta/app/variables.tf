# Inputs for the beta app stack. Secrets are passed as TF_VAR_* environment variables, never written to files.

variable "region" {
  description = "AWS region for the beta app."
  type        = string
  default     = "ap-south-1"
}

variable "secret_key" {
  description = "Signs login tokens. Use a long random string (32+ characters)."
  type        = string
  sensitive   = true
}

variable "email_sender" {
  description = "The address login codes are sent from. It must be verified in Amazon SES."
  type        = string
}

variable "email_backend" {
  description = "How email is sent: 'ses' (Amazon SES) or 'smtp' (the email_sender's own account, for example Gmail with an app password stored in SSM as /pragyaprep/beta/smtp_password)."
  type        = string
  default     = "ses"
}

variable "ses_verified_emails" {
  description = "Other addresses to verify in SES. While SES is in sandbox mode, mail can only go to verified addresses."
  type        = list(string)
  default     = []
}

variable "frontend_url" {
  description = "Where the website lives."
  type        = string
  default     = "http://localhost:4200"
}

variable "cors_origins" {
  description = "Browser origins allowed to call the API and upload to S3."
  type        = list(string)
  default     = ["http://localhost:4200"]
}

variable "package_path" {
  description = "Lambda zip built by backend/scripts/build_lambda.sh."
  type        = string
  default     = "../../../../backend/build/lambda.zip"
}
