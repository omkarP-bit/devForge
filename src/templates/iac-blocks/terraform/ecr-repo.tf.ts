export const ECR_REPO_BLOCK = `resource "aws_ecr_repository" "{{REPO_NAME}}" {
  name                 = "{{REPO_NAME}}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project     = "{{PROJECT_NAME}}"
    Environment = "{{ENVIRONMENT}}"
    ManagedBy   = "devforge"
  }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.{{REPO_NAME}}.repository_url
}
`;
