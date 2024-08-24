import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';


// cdk deploy --parameters OpenWebUiEcsCdkStack:SageMakerEndpointName=meta-llama-3-8b-instruct


export class OpenWebUiEcsCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sageMakerEndpointName = new cdk.CfnParameter(this, 'SageMakerEndpointName', {
      type: 'String',
      description: 'Name of the SageMaker endpoint to invoke',
    });

    // Create a VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2, // Default is all AZs in region
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
    });

    // Create a log group for ECS services
    const logGroup = new logs.LogGroup(this, 'LogGroup');

    // Define the Web UI container
    const webUITaskDef = new ecs.FargateTaskDefinition(this, 'WebUITaskDef');
    const webUIContainer = webUITaskDef.addContainer('WebUiAppContainer', {
      image: ecs.ContainerImage.fromRegistry("ghcr.io/open-webui/open-webui:main"),
      memoryLimitMiB: 512,
      environment: {
        "WEBUI_AUTH": "False",
        "OPENAI_API_KEY": " 0p3n-w3bu!"
      },
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: 'WebUI',
      }),
    });

    webUIContainer.addPortMappings({
      containerPort: 8080, // The Web UI listens on port 8080
    });

    // Define the Pipelines Backend container
    const pipelinesBackendTaskDef = new ecs.FargateTaskDefinition(this, 'PipelinesBackendTaskDef');
    const pipelinesBackendContainer = pipelinesBackendTaskDef.addContainer('PipelinesBackendContainer', {
      image: ecs.ContainerImage.fromRegistry('ghcr.io/open-webui/pipelines:latest'),
      memoryLimitMiB: 512,
      environment: {
        "SAGEMAKER_ENDPOINT_NAME": sageMakerEndpointName.valueAsString,
        "PIPELINES_URLS": " https://raw.githubusercontent.com/philschmid/open-webui-sagemaker-example/main/pipelines/aws_sagemaker_pipeline.py"
      },
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: 'pipelinesBackend',
      }),
    });

    pipelinesBackendContainer.addPortMappings({
      containerPort: 9099,
    });

    // Create Fargate services
    const webUIAppService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'WebUiService', {
      cluster,
      taskDefinition: webUITaskDef,
      publicLoadBalancer: true,
      listenerPort: 80, // Make the load balancer listen on port 80
    });

    const pipelinesBackendService = new ecs.FargateService(this, 'pipelinesBackendService', {
      cluster,
      taskDefinition: pipelinesBackendTaskDef,
      assignPublicIp: true,
      desiredCount: 1,
    });

    // // Allow WebUI to call pipelines backend
    pipelinesBackendService.connections.allowFrom(webUIAppService.service, ec2.Port.tcp(9099));

    // Output the load balancer URL
    new cdk.CfnOutput(this, 'WebUI', {
      value: `http://${webUIAppService.loadBalancer.loadBalancerDnsName}`,
    });
  }
}
