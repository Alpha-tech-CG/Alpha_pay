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
  setting { name = "containerInsights" value = "enabled" }
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
  egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
}

# --- Secrets Manager ---
resource "aws_secretsmanager_secret" "app_secrets" {
  name = "paybrain/prod/env"
}
