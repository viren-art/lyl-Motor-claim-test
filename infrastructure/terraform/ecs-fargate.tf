# ECS Cluster for Roojai Claims API
resource "aws_ecs_cluster" "claims_api" {
  name = "roojai-claims-api-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "roojai-claims-api-cluster"
    Environment = var.environment
    Project     = "roojai-claims"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "claims_api" {
  family                   = "roojai-claims-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"  # 1 vCPU
  memory                   = "2048"  # 2 GB
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "claims-api"
      image     = "${aws_ecr_repository.claims_api.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "GPT4_API_URL"
          value = "https://api.openai.com/v1"
        },
        {
          name  = "CLAUDE_API_URL"
          value = "https://api.anthropic.com/v1"
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${aws_secretsmanager_secret.database_url.arn}"
        },
        {
          name      = "GPT4_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.gpt4_api_key.arn}"
        },
        {
          name      = "CLAUDE_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.claude_api_key.arn}"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.claims_api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/api/v1/monitoring/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name        = "roojai-claims-api-task"
    Environment = var.environment
  }
}

# ECS Service with Auto Scaling
resource "aws_ecs_service" "claims_api" {
  name            = "roojai-claims-api-service"
  cluster         = aws_ecs_cluster.claims_api.id
  task_definition = aws_ecs_task_definition.claims_api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip =