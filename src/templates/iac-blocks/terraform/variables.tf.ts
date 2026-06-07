export const VARIABLES_BLOCK = `variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "{{PROJECT_NAME}}"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "{{ENVIRONMENT}}"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}
`;
