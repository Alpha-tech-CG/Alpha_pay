# --- ElastiCache Redis ---
# L'API et les files BullMQ ont besoin de Redis (cache FX, blacklist des refresh
# tokens, sessions OTP, workers). Managé, chiffré au repos + en transit, AUTH token.

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = module.vpc.private_subnets
  tags       = local.common_tags
}

resource "aws_security_group" "redis" {
  name   = "${local.name_prefix}-redis-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    description     = "Redis depuis les tasks ECS uniquement"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = local.common_tags
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Redis ${var.environment} — cache + BullMQ"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  port                 = 6379

  # 1 nœud hors prod ; primaire + réplica avec failover automatique en prod.
  num_cache_clusters         = var.environment == "prod" ? 2 : 1
  automatic_failover_enabled = var.environment == "prod"
  multi_az_enabled           = var.environment == "prod"

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  apply_immediately        = var.environment != "prod"

  tags = local.common_tags
}

# URL de connexion (rediss:// — TLS) stockée en secret, lue par la task ECS.
resource "aws_secretsmanager_secret" "redis_url" {
  name = "paybrain/${var.environment}/redis-url"
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:${var.redis_auth_token}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
}

# Autorise la task ECS à lire UNIQUEMENT ce secret (additif, least-privilege).
data "aws_iam_policy_document" "ecs_task_redis_read" {
  statement {
    sid       = "ReadRedisUrlSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.redis_url.arn]
  }
}

resource "aws_iam_policy" "ecs_task_redis_read" {
  name   = "paybrain-${var.environment}-ecs-task-redis-read"
  policy = data.aws_iam_policy_document.ecs_task_redis_read.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_redis_read" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task_redis_read.arn
}

output "redis_primary_endpoint" {
  description = "Endpoint primaire Redis (à injecter comme REDIS_URL via le secret redis-url)."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}
