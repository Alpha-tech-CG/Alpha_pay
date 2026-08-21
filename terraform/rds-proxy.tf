# --- RDS Proxy (pooling de connexions, équivalent managé de PgBouncer) ---
#
# Sous forte concurrence (objectif ~1000 req simultanées), le pool Prisma PAR
# instance épuiserait vite les connexions Postgres. RDS Proxy mutualise et met en
# file les connexions (transaction pooling) : N tasks ECS partagent un pool borné
# vers RDS au lieu d'ouvrir chacune ses propres connexions.
#
# ⚠️ Déploiement : pointer DATABASE_URL de l'app sur `rds_proxy_endpoint` (au lieu
# de l'adresse RDS directe), avec un connection_limit modéré par instance et
# sslmode=require (le proxy exige TLS).

resource "aws_security_group" "rds_proxy" {
  name   = "${local.name_prefix}-rds-proxy-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    description     = "Postgres depuis les tasks ECS uniquement"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Le proxy établit les connexions réelles vers RDS : on autorise sa SG en entrée
# sur la SG RDS (additif, ne touche pas la règle ECS existante).
resource "aws_security_group_rule" "rds_from_proxy" {
  type                     = "ingress"
  description              = "Postgres depuis RDS Proxy"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.rds_proxy.id
}

# Rôle IAM assumé par le proxy pour lire les credentials DB (least-privilege :
# uniquement le secret db-credentials).
data "aws_iam_policy_document" "rds_proxy_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_proxy" {
  name               = "${local.name_prefix}-rds-proxy-role"
  assume_role_policy = data.aws_iam_policy_document.rds_proxy_assume.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "rds_proxy_secret" {
  statement {
    sid       = "ReadDbCredentials"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_credentials.arn]
  }
}

resource "aws_iam_role_policy" "rds_proxy_secret" {
  name   = "${local.name_prefix}-rds-proxy-secret"
  role   = aws_iam_role.rds_proxy.id
  policy = data.aws_iam_policy_document.rds_proxy_secret.json
}

resource "aws_db_proxy" "postgres" {
  name                   = "${local.name_prefix}-db-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_subnet_ids         = module.vpc.private_subnets
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  require_tls            = true
  idle_client_timeout    = 1800

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials.arn
  }

  tags = local.common_tags
}

resource "aws_db_proxy_default_target_group" "postgres" {
  db_proxy_name = aws_db_proxy.postgres.name

  connection_pool_config {
    # Borne le pool à 75 % des connexions max de RDS ; le reste reste dispo pour
    # les tâches d'admin/migration hors proxy.
    max_connections_percent      = 75
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "postgres" {
  db_proxy_name          = aws_db_proxy.postgres.name
  target_group_name      = aws_db_proxy_default_target_group.postgres.name
  db_instance_identifier = aws_db_instance.postgres.identifier
}

output "rds_proxy_endpoint" {
  description = "Endpoint du RDS Proxy — pointer DATABASE_URL dessus (pooling de connexions, sslmode=require)."
  value       = aws_db_proxy.postgres.endpoint
}
