# ElastiCache Redis Cluster for Policy Validation Caching

resource "aws_elasticache_subnet_group" "redis" {
  name       = "roojai-claims-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "Roojai Claims Redis Subnet Group"
    Environment = var.environment
    Project     = "roojai-claims"
  }
}

resource "aws_security_group" "redis" {
  name        = "roojai-claims-redis-sg"
  description = "Security group for Redis cache cluster"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS tasks"
    from_port       = 6379
    to_port         = 6379
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
    Name        = "Roojai Claims Redis Security Group"
    Environment = var.environment
    Project     = "roojai-claims"
  }
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "roojai-claims-redis-params"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = {
    Name        = "Roojai Claims Redis Parameters"
    Environment = var.environment
    Project     = "roojai-claims"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "roojai-claims-redis"
  replication_group_description = "Redis cluster for policy validation caching"
  
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_nodes
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  port                 = 6379
  
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  
  automatic_failover_enabled = var.environment == "production" ? true : false
  multi_az_enabled          = var.environment == "production" ? true : false
  
  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:07:00"
  
  notification_topic_arn = var.sns_topic_arn
  
  tags = {
    Name        = "Roojai Claims Redis Cluster"
    Environment = var.environment
    Project     = "roojai-claims"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "roojai-claims-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Redis CPU utilization is too high"
  alarm_actions       = [var.sns_topic_arn]

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "roojai-claims-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Redis memory utilization is too high"
  alarm_actions       = [var.sns_topic_arn]

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "roojai-claims-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1000"
  alarm_description   = "Redis evictions are too high"
  alarm_actions       = [var.sns_topic_arn]

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
}

# Outputs
output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}