terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# S3 Bucket for Claims Documents
resource "aws_s3_bucket" "claims_documents" {
  bucket = var.bucket_name

  tags = {
    Name        = "Roojai Claims Documents"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "PDPA"
  }
}

# Enable versioning for audit trail
resource "aws_s3_bucket_versioning" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption (AES-256)
resource "aws_s3_bucket_server_side_encryption_configuration" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy for PDPA retention
resource "aws_s3_bucket_lifecycle_configuration" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  rule {
    id     = "pdpa-retention-pii"
    status = "Enabled"

    filter {
      prefix = "claims/"
    }

    # Delete PII documents after 3 years (1095 days)
    expiration {
      days = 1095
    }

    # Delete non-current versions after 30 days
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "pdpa-retention-claim-records"
    status = "Enabled"

    filter {
      prefix = "claims/"
    }

    # Transition to Glacier after 1 year for cost optimization
    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    # Delete after 7 years (2555 days) per OIC regulations
    expiration {
      days = 2555
    }
  }
}

# CORS configuration for pre-signed URL uploads
resource "aws_s3_bucket_cors_configuration" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Bucket policy for ECS task role access
resource "aws_s3_bucket_policy" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowECSTaskAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.ecs_task_role_arn
        }
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.claims_documents.arn}/*"
      },
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.claims_documents.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "AES256"
          }
        }
      }
    ]
  })
}

# CloudWatch logging for S3 access
resource "aws_s3_bucket_logging" "claims_documents" {
  bucket = aws_s3_bucket.claims_documents.id

  target_bucket = var.logging_bucket_name
  target_prefix = "s3-access-logs/"
}

# Outputs
output "bucket_name" {
  value       = aws_s3_bucket.claims_documents.id
  description = "S3 bucket name for claims documents"
}

output "bucket_arn" {
  value       = aws_s3_bucket.claims_documents.arn
  description = "S3 bucket ARN"
}