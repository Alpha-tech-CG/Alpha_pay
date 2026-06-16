variable "aws_region" {
  default = "eu-west-1"
}

variable "environment" {
  description = "Environnement (prod, staging, dev) — utilisé pour préfixer les noms de secrets/rôles"
  default     = "prod"
}

variable "db_rotation_lambda_arn" {
  description = "ARN de la Lambda de rotation RDS PostgreSQL single-user, déployée via l'AWS Serverless Application Repository (app SecretsManagerRDSPostgreSQLRotationSingleUser)"
  type        = string
}

variable "db_username" {
  description = "PostgreSQL username"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password"
  sensitive   = true
}
