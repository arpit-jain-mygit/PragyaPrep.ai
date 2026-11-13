# Dev network: one VPC across two availability zones (AZs), with public subnets for the load
# balancer and private subnets for the app, database and anything not public.
# Run with: AWS_PROFILE=pragyaprep-dev terraform plan

provider "aws" {
  region = var.region

  # Tags added to every resource, so costs and ownership are easy to find.
  default_tags {
    tags = {
      project     = "pragyaprep"
      environment = "dev"
      managed_by  = "terraform"
      stack       = "network"
    }
  }
}

# The two AZs in this region, so the subnets land in known zones.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# The community VPC module is a widely used, well-tested wrapper around the raw VPC resources.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "pragyaprep-dev"
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets  = var.public_subnet_cidrs
  private_subnets = var.private_subnet_cidrs

  # Public subnets get a route to the internet gateway, so the load balancer can be reached.
  map_public_ip_on_launch = false

  # Private subnets reach the internet (for package downloads, AWS APIs) through a NAT gateway.
  enable_nat_gateway = true

  # One NAT gateway instead of one per AZ. It's cheaper for dev, and a single point of failure
  # is acceptable there. Prod will switch this off.
  single_nat_gateway     = true
  one_nat_gateway_per_az = false

  enable_dns_hostnames = true
  enable_dns_support   = true
}
