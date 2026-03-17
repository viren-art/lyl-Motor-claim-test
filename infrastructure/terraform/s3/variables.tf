variable "aws_region" {
  description = "AWS region for S3 bucket"
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name for claims documents"
  type        = string
}

variable "ecs_task_role_arn" {
  description = "ARN of ECS task role for S3 access"
  type        = string
}

variable "allowed_origins" {
  description = "Allowed CORS origins for pre-signed URL uploads"
  type        = list(string)
  default     = ["https://roojai.com", "https://app.roojai.com"]
}

variable "logging_bucket_name" {
  description = "S3 bucket for access logs"
  type        = string
}