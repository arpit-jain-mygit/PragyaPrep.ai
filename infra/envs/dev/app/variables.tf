# Inputs for the dev app stack. Secrets are passed as TF_VAR_* environment variables, never written to files.

variable "region" {
  description = "AWS region for the dev app."
  type        = string
  default     = "ap-south-1"
}

variable "secret_key" {
  description = "Signs login tokens. Use a long random string (32+ characters)."
  type        = string
  sensitive   = true
}

variable "admin_password" {
  description = "Password for the first admin account."
  type        = string
  sensitive   = true
}

variable "admin_login_id" {
  description = "Login ID of the first admin account."
  type        = string
  default     = "admin"
}

variable "google_client_id" {
  description = "Google OAuth client ID. Leave empty to keep Google sign-in off."
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "frontend_url" {
  description = "Where the browser goes after Google sign-in."
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
