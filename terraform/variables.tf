variable "aws_region" {
  default = "eu-west-1"
}

variable "db_username" {
  description = "PostgreSQL username"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password"
  sensitive   = true
}
