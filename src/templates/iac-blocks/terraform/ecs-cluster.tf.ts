export const ECS_CLUSTER_BLOCK = `resource "aws_ecs_cluster" "{{CLUSTER_NAME}}" {
  name = "{{CLUSTER_NAME}}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Project     = "{{PROJECT_NAME}}"
    Environment = "{{ENVIRONMENT}}"
    ManagedBy   = "devforge"
  }
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.{{CLUSTER_NAME}}.arn
}
`;
