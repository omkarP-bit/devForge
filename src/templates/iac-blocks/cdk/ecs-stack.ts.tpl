export const ECS_CDK_STACK = `import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface EcsStackProps extends cdk.StackProps {
  repository: ecr.IRepository;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, '{{PROJECT_NAME}}Vpc', { maxAzs: 2 });

    const cluster = new ecs.Cluster(this, '{{CLUSTER_NAME}}', {
      clusterName: '{{CLUSTER_NAME}}',
      vpc,
      containerInsights: true,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, '{{PROJECT_NAME}}Task', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    taskDef.addContainer('{{PROJECT_NAME}}Container', {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, '{{IMAGE_TAG}}'),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: '{{PROJECT_NAME}}' }),
    });

    const service = new ecs.FargateService(this, '{{PROJECT_NAME}}Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, '{{PROJECT_NAME}}ALB', {
      vpc,
      internetFacing: true,
    });

    const listener = lb.addListener('Listener', { port: 80 });
    listener.addTargets('ECS', {
      port: 3000,
      targets: [service],
      healthCheck: { path: '/health' },
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: lb.loadBalancerDnsName,
    });
  }
}
`;
