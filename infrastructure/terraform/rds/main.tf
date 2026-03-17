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

# RDS PostgreSQL Instance
resource "aws_db_instance" "claims_db" {
  identifier     = var.db_identifier
  engine         = "postgres"
  engine_version = "14.10"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds_encryption.arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password # Use AWS Secrets Manager in production

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.claims_db.name

  multi_az               = var.environment == "production" ? true : false
  publicly_accessible    = false
  backup_retention_period = 7
  backup_window          = "03:00-04:00" # Bangkok time 10:00-11:00
  maintenance_window     = "sun:04:00-sun:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  deletion_protection = var.environment == "production" ? true : false
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.db_identifier}-final-snapshot" : null

  tags = {
    Name        = "Roojai Claims Database"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "PDPA"
  }
}

# KMS Key for RDS Encryption
resource "aws_kms_key" "rds_encryption" {
  description             = "KMS key for RDS encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "RDS Encryption Key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "rds_encryption" {
  name          = "alias/roojai-claims-rds-${var.environment}"
  target_key_id = aws_kms_key.rds_encryption.key_id
}

# DB Subnet Group
resource "aws_db_subnet_group" "claims_db" {
  name       = "${var.db_identifier}-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "Roojai Claims DB Subnet Group"
    Environment = var.environment
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "${var.db_identifier}-sg"
  description = "Security group for Roojai Claims RDS instance"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "RDS Security Group"
    Environment = var.environment
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.db_identifier}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = [var.sns_topic_arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.claims_db.id
  }
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${var.db_identifier}-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "10737418240" # 10GB in bytes
  alarm_description   = "This metric monitors RDS free storage space"
  alarm_actions       = [var.sns_topic_arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.claims_db.id
  }
}

# Outputs
output "db_endpoint" {
  value       = aws_db_instance.claims_db.endpoint
  description = "RDS instance endpoint"
  sensitive   = true
}

output "db_name" {
  value       = aws_db_instance.claims_db.db_name
  description = "Database name"
}

output "db_port" {
  value       = aws_db_instance.claims_db.port
  description = "Database port"
}