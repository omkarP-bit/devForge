export const ECR_CREATE_BOTO3 = `import boto3
import json
from botocore.exceptions import ClientError


def create_ecr_repository(repo_name: str, region: str = "us-east-1") -> dict:
    client = boto3.client("ecr", region_name=region)
    try:
        response = client.create_repository(
            repositoryName=repo_name,
            imageScanningConfiguration={"scanOnPush": True},
            imageTagMutability="MUTABLE",
            tags=[
                {"Key": "ManagedBy", "Value": "devforge"},
                {"Key": "Project", "Value": repo_name},
            ],
        )
        repo_uri = response["repository"]["repositoryUri"]
        print(f"Created ECR repository: {repo_uri}")

        client.put_lifecycle_policy(
            repositoryName=repo_name,
            lifecyclePolicyText=json.dumps({
                "rules": [{
                    "rulePriority": 1,
                    "description": "Keep last 10 images",
                    "selection": {
                        "tagStatus": "any",
                        "countType": "imageCountMoreThan",
                        "countNumber": 10,
                    },
                    "action": {"type": "expire"},
                }]
            }),
        )
        return response["repository"]
    except ClientError as e:
        if e.response["Error"]["Code"] == "RepositoryAlreadyExistsException":
            print(f"Repository {repo_name} already exists")
            existing = client.describe_repositories(repositoryNames=[repo_name])
            return existing["repositories"][0]
        raise


if __name__ == "__main__":
    create_ecr_repository("{{REPO_NAME}}", "{{AWS_REGION}}")
`;
