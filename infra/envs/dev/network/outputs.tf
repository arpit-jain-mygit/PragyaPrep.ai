# Values other dev stacks (database, app, load balancer) need from the network.

output "vpc_id" {
  description = "ID of the dev VPC."
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnets, for the load balancer."
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "Private subnets, for the app and database."
  value       = module.vpc.private_subnets
}

output "azs" {
  description = "Availability zones used by the subnets."
  value       = local.azs
}
