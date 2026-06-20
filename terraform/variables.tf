variable "aws_region" {
  default = "eu-west-1"
}

variable "environment" {
  description = "Environnement (prod, staging, dev) — utilisé pour préfixer les noms de secrets/rôles"
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment doit etre dev, staging ou prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR isole de l'environnement"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "Classe RDS de l'environnement"
  type        = string
  default     = "db.t3.micro"
}

variable "api_desired_count" {
  description = "Nombre de tasks API"
  type        = number
  default     = 1
}

variable "api_cpu" {
  description = "CPU Fargate de l'API"
  type        = number
  default     = 256
}

variable "api_memory" {
  description = "Memoire Fargate de l'API en MiB"
  type        = number
  default     = 512
}

variable "api_image_tag" {
  description = "Tag d'image initial; le pipeline remplace ensuite l'image par le SHA Git"
  type        = string
  default     = "latest"
}

variable "db_rotation_lambda_arn" {
  description = "ARN de la Lambda de rotation RDS PostgreSQL single-user (AWS SAR). Vide tant que la rotation n'est pas activée (Option A)."
  type        = string
  default     = ""
}

variable "webhook_ip_allowlist_mtn" {
  description = "Plages IP (CIDR) des callbacks MTN MoMo — à confirmer auprès de MTN (cf. docs/IP_ALLOWLIST.md)"
  type        = list(string)
  default     = []
}

variable "webhook_ip_allowlist_airtel" {
  description = "Plages IP (CIDR) des callbacks Airtel — à confirmer auprès d'Airtel"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN du certificat ACM pour HTTPS sur l'ALB. Vide = listener HTTP only (avant d'avoir le domaine)."
  type        = string
  default     = ""
}

variable "db_username" {
  description = "PostgreSQL username"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL password"
  sensitive   = true
}
