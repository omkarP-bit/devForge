export const ECS_DEPLOY_BOTO3 = `import boto3
import argparse
from botocore.exceptions import ClientError


def deploy(cluster: str, service: str, image_uri: str, region: str = "us-east-1") -> None:
    ecs = boto3.client("ecs", region_name=region)

    task_defs = ecs.describe_task_definition(taskDefinition=service)["taskDefinition"]
    containers = task_defs["containerDefinitions"]
    containers[0]["image"] = image_uri

    new_task = ecs.register_task_definition(
        family=task_defs["family"],
        taskRoleArn=task_defs.get("taskRoleArn", ""),
        executionRoleArn=task_defs["executionRoleArn"],
        networkMode=task_defs["networkMode"],
        containerDefinitions=containers,
        requiresCompatibilities=task_defs["requiresCompatibilities"],
        cpu=task_defs["cpu"],
        memory=task_defs["memory"],
    )
    new_arn = new_task["taskDefinition"]["taskDefinitionArn"]
    print(f"Registered task definition: {new_arn}")

    ecs.update_service(cluster=cluster, service=service, taskDefinition=new_arn)
    print(f"Updated service {service} in cluster {cluster}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cluster", default="{{CLUSTER_NAME}}")
    parser.add_argument("--service", default="{{PROJECT_NAME}}")
    parser.add_argument("--image", required=True)
    parser.add_argument("--region", default="{{AWS_REGION}}")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        print(f"[dry-run] Would deploy {args.image} to {args.cluster}/{args.service}")
    else:
        deploy(args.cluster, args.service, args.image, args.region)
`;
