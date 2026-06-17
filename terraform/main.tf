terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "paybrain-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "eu-west-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# --- VPC ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "paybrain-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = { Project = "PayBrain" }
}

# --- ECR ---
resource "aws_ecr_repository" "api" {
  name                 = "paybrain-api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Project = "PayBrain" }
}

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "paybrain-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = { Project = "PayBrain" }
}

# --- RDS PostgreSQL ---
resource "aws_db_instance" "postgres" {
  identifier        = "paybrain-db"
  engine            = "postgres"
  engine_version    = "17"
  instance_class    = "db.t3.micro"
  allocated_storage = 20

  db_name  = "paybrain"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  skip_final_snapshot = false
  deletion_protection = true
  multi_az            = false

  tags = { Project = "PayBrain" }
}

resource "aws_db_subnet_group" "main" {
  name       = "paybrain-db-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name   = "paybrain-rds-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name   = "paybrain-ecs-tasks-sg"
  vpc_id = module.vpc.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Secrets Manager ---
# Secrets séparés par sensibilité/usage (least privilege : chaque rôle ne
# peut lire que ce dont il a besoin, pas un blob unique fourre-tout).

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "paybrain/${var.environment}/db-credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = aws_db_instance.postgres.db_name
  })
}

# Rotation automatique tous les 30 jours. La Lambda de rotation PostgreSQL
# single-user est déployée via l'AWS Serverless Application Repository
# (app "SecretsManagerRDSPostgreSQLRotationSingleUser") plutôt que packagée
# ici, pour rester sur le binaire maintenu par AWS plutôt qu'un artefact
# applicatif à reconstruire à chaque rotation de runtime.
# Rotation désactivée pour le 1er déploiement (Option A, cf. docs/DEPLOYMENT.md) :
# la Lambda SAR de rotation n'est pas encore déployée. Réactiver ensuite.
# resource "aws_secretsmanager_secret_rotation" "db_credentials" {
#   secret_id           = aws_secretsmanager_secret.db_credentials.id
#   rotation_lambda_arn = var.db_rotation_lambda_arn
#   rotation_rules {
#     automatically_after_days = 30
#   }
# }

resource "aws_secretsmanager_secret" "jwt_pepper" {
  name = "paybrain/${var.environment}/jwt-pepper"
}

resource "aws_secretsmanager_secret" "connector_hmac_secrets" {
  name = "paybrain/${var.environment}/connector-hmac-secrets"
}

resource "aws_secretsmanager_secret" "clerk_keys" {
  name = "paybrain/${var.environment}/clerk-keys"
}

resource "aws_secretsmanager_secret" "sms_email_keys" {
  name = "paybrain/${var.environment}/sms-email-keys"
}

# Rotation manuelle (90 jours) pour les secrets non-DB : pas de Lambda
# automatique, suivie via un calendrier dans Linear (cf. ALP-139).

# --- IAM least privilege : la task ECS ne peut lire QUE les secrets ci-dessus,
# rien d'autre dans Secrets Manager. ---
data "aws_iam_policy_document" "ecs_task_secrets_read" {
  statement {
    sid       = "ReadPaybrainSecretsOnly"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db_credentials.arn,
      aws_secretsmanager_secret.jwt_pepper.arn,
      aws_secretsmanager_secret.connector_hmac_secrets.arn,
      aws_secretsmanager_secret.clerk_keys.arn,
      aws_secretsmanager_secret.sms_email_keys.arn,
    ]
  }
}

resource "aws_iam_policy" "ecs_task_secrets_read" {
  name   = "paybrain-${var.environment}-ecs-task-secrets-read"
  policy = data.aws_iam_policy_document.ecs_task_secrets_read.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_secrets_read" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task_secrets_read.arn
}

resource "aws_iam_role" "ecs_task" {
  name = "paybrain-${var.environment}-ecs-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

