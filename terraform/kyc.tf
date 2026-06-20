# Documents KYC : chiffrement, accès privé et rétention réglementaire de dix ans (ALP-142).
resource "aws_s3_bucket" "kyc_documents" {
  bucket              = "${local.name_prefix}-kyc-documents"
  object_lock_enabled = true
  tags                = local.common_tags
}

resource "aws_s3_bucket_versioning" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_public_access_block" "kyc_documents" {
  bucket                  = aws_s3_bucket.kyc_documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_object_lock_configuration" "kyc_documents" {
  bucket = aws_s3_bucket.kyc_documents.id
  rule { default_retention { mode = "GOVERNANCE" years = 10 } }
  depends_on = [aws_s3_bucket_versioning.kyc_documents]
}

resource "aws_iam_role_policy" "ecs_kyc_documents" {
  name = "${local.name_prefix}-kyc-documents"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:PutObject", "s3:GetObject", "s3:PutObjectRetention"]
      Resource = "${aws_s3_bucket.kyc_documents.arn}/*"
    }]
  })
}

output "kyc_documents_bucket" { value = aws_s3_bucket.kyc_documents.bucket }
