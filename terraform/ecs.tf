# --- Service applicatif : ALB + ECS Fargate (ALP-122) ---
# Complète l'infra cœur (main.tf) pour faire tourner l'API derrière un load
# balancer. Après `terraform apply`, pousser l'image dans ECR puis forcer un
# nouveau déploiement du service.

# Secret d'environnement applicatif : JSON de toutes les variables, chargé au
# boot par loadSecretsFromAws() (AWS_SECRETS_MANAGER_SECRET_ID, cf. ALP-139).
resource "aws_secretsmanager_secret" "app_env" {
  name = "paybrain/${var.environment}/env"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/paybrain-api"
  retention_in_days = 30
}

# --- IAM : rôle d'exécution ECS (pull ECR + logs) ---
resource "aws_iam_role" "ecs_execution" {
  name = "paybrain-${var.environment}-ecs-execution-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- ALB ---
resource "aws_security_group" "alb" {
  name   = "paybrain-alb-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Project = "PayBrain" }
}

# L'ALB doit pouvoir joindre les tâches ECS sur le port applicatif (3000).
resource "aws_security_group_rule" "ecs_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks.id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_lb" "api" {
  name               = "paybrain-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  tags               = { Project = "PayBrain" }
}

resource "aws_lb_target_group" "api" {
  name        = "paybrain-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip" # Fargate (awsvpc)

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
  tags = { Project = "PayBrain" }
}

# HTTP (80). Si un certificat ACM est fourni, redirige vers HTTPS ; sinon
# transmet directement (utile tant que le domaine/cert n'existe pas).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = var.acm_certificate_arn == "" ? "forward" : "redirect"

    target_group_arn = var.acm_certificate_arn == "" ? aws_lb_target_group.api.arn : null

    dynamic "redirect" {
      for_each = var.acm_certificate_arn == "" ? [] : [1]
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

# HTTPS (443), créé seulement si un certificat ACM est fourni.
resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn == "" ? 0 : 1
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# Associe le Web ACL WAF (waf.tf) à l'ALB.
resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.api.arn
}

# --- ECS task definition + service ---
resource "aws_ecs_task_definition" "api" {
  family                   = "paybrain-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "paybrain-api"
    image     = "${aws_ecr_repository.api.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "AWS_SECRETS_MANAGER_SECRET_ID", value = aws_secretsmanager_secret.app_env.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "paybrain-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "paybrain-api"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
}

output "alb_dns_name" {
  description = "DNS public de l'ALB — à pointer en CNAME depuis api.paybrain.cg"
  value       = aws_lb.api.dns_name
}
