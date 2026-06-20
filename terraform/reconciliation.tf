# Rapports de rapprochement réglementaires : versionnés, chiffrés et verrouillés
# en mode gouvernance pendant cinq ans (ALP-140).
resource "aws_s3_bucket" "reconciliation_reports" {
  bucket              = "${local.name_prefix}-reconciliation-reports"
  object_lock_enabled = true
  tags                = local.common_tags
}

resource "aws_s3_bucket_versioning" "reconciliation_reports" {
  bucket = aws_s3_bucket.reconciliation_reports.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reconciliation_reports" {
  bucket = aws_s3_bucket.reconciliation_reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "reconciliation_reports" {
  bucket                  = aws_s3_bucket.reconciliation_reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_object_lock_configuration" "reconciliation_reports" {
  bucket = aws_s3_bucket.reconciliation_reports.id
  rule {
    default_retention {
      mode  = "GOVERNANCE"
      years = 5
    }
  }
  depends_on = [aws_s3_bucket_versioning.reconciliation_reports]
}

resource "aws_iam_role_policy" "ecs_reconciliation_reports" {
  name = "${local.name_prefix}-reconciliation-reports"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:PutObjectRetention",
      ]
      Resource = "${aws_s3_bucket.reconciliation_reports.arn}/*"
    }]
  })
}

output "reconciliation_reports_bucket" {
  value = aws_s3_bucket.reconciliation_reports.bucket
}
