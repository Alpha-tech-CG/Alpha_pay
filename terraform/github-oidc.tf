data "aws_caller_identity" "current" {}

locals {
  github_oidc_enabled = var.github_repository != ""
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  count = local.github_oidc_enabled ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = local.common_tags
}

data "aws_iam_policy_document" "github_actions_assume_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  name               = "paybrain-${var.environment}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_deploy[0].json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "github_actions_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  statement {
    sid = "PushApiImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeRepositories",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.api.arn]
  }

  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "DeployEcsService"
    actions = [
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:RegisterTaskDefinition",
      "ecs:RunTask",
      "ecs:UpdateService",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "WaitForEcsTasks"
    actions   = ["ecs:ListTasks"]
    resources = [aws_ecs_cluster.main.arn]
  }

  statement {
    sid       = "PassEcsRoles"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]
  }
}

resource "aws_iam_policy" "github_actions_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  name   = "paybrain-${var.environment}-github-actions-deploy"
  policy = data.aws_iam_policy_document.github_actions_deploy[0].json
}

resource "aws_iam_role_policy_attachment" "github_actions_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  role       = aws_iam_role.github_actions_deploy[0].name
  policy_arn = aws_iam_policy.github_actions_deploy[0].arn
}

output "github_actions_deploy_role_arn" {
  description = "ARN a configurer dans le secret GitHub AWS_DEPLOY_ROLE_ARN."
  value       = local.github_oidc_enabled ? aws_iam_role.github_actions_deploy[0].arn : null
}
