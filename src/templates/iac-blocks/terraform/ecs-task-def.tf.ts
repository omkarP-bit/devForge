export const ECS_TASK_DEF_BLOCK = `resource "aws_cloudwatch_log_group" "{{PROJECT_NAME}}" {
  name              = "/ecs/{{PROJECT_NAME}}"
  retention_in_days = 30
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "{{PROJECT_NAME}}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "{{PROJECT_NAME}}" {
  family                   = "{{PROJECT_NAME}}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "{{PROJECT_NAME}}"
    image     = "\${aws_ecr_repository.{{REPO_NAME}}.repository_url}:\${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.{{PROJECT_NAME}}.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = {
    Project     = "{{PROJECT_NAME}}"
    Environment = "{{ENVIRONMENT}}"
    ManagedBy   = "devforge"
  }
}

output "ecs_task_definition_arn" {
  value = aws_ecs_task_definition.{{PROJECT_NAME}}.arn
}
`;
