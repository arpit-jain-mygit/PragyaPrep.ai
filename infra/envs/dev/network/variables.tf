# Inputs for the dev network stack. Defaults are the dev values; prod will pass its own.

variable "region" {
  description = "AWS region for the dev environment."
  type        = string
  default     = "ap-south-1"
}

variable "vpc_cidr" {
  description = "IP address range for the dev VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "One public subnet per AZ, for the load balancer."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "One private subnet per AZ, for the app and database."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}
