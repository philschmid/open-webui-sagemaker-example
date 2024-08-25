import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class OpenWebUiEcsCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sageMakerEndpointName = new cdk.CfnParameter(this, 'SageMakerEndpointName', {
      type: 'String',
      description: 'Name of the SageMaker endpoint to invoke',
    });

    // Create a VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
    });

    // Create a log group for ECS services
    const logGroup = new logs.LogGroup(this, 'LogGroup');

    // Define the IAM role for Pipelines Backend
    const pipelinesBackendRole = new iam.Role(this, 'PipelinesBackendRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Attach the necessary SageMaker permissions to the role
    pipelinesBackendRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sagemaker:InvokeEndpoint'
      ],
      resources: [
        `arn:aws:sagemaker:${this.region}:${this.account}:endpoint/${sageMakerEndpointName.valueAsString}`
      ],
    }));

    // Create Security Groups
    const webUISecurityGroup = new ec2.SecurityGroup(this, 'WebUISecurityGroup', {
      vpc,
      description: 'Allow traffic to Web UI service',
      allowAllOutbound: true,
    });
    webUISecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080), 'Allow HTTP traffic to Web UI');

    const pipelinesBackendSecurityGroup = new ec2.SecurityGroup(this, 'PipelinesBackendSecurityGroup', {
      vpc,
      description: 'Allow traffic to Pipelines Backend service',
      allowAllOutbound: true,
    });
    pipelinesBackendSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9099), 'Allow HTTP traffic to Pipelines Backend');

    // Define the Pipelines Backend container
    const pipelinesBackendTaskDef = new ecs.FargateTaskDefinition(this, 'PipelinesBackendTaskDef', {
      taskRole: pipelinesBackendRole,
    });

    const pipelinesBackendContainer = pipelinesBackendTaskDef.addContainer('PipelinesBackendContainer', {
      image: ecs.ContainerImage.fromRegistry('ghcr.io/open-webui/pipelines:latest'),
      memoryLimitMiB: 512,
      environment: {
        "SAGEMAKER_ENDPOINT_NAME": sageMakerEndpointName.valueAsString,
        "PIPELINES_URLS": "https://raw.githubusercontent.com/philschmid/open-webui-sagemaker-example/main/pipelines/aws_sagemaker_pipeline.py",
      },
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: 'pipelinesBackend',
      }),
    });

    pipelinesBackendContainer.addPortMappings({
      containerPort: 9099,
    });

    // Create the Pipelines Backend service and attach it to the load balancer
    const pipelinesBackendService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'PipelinesBackendService', {
      cluster,
      serviceName: 'pipelines-backend',
      taskDefinition: pipelinesBackendTaskDef,
      publicLoadBalancer: true,
      listenerPort: 80,
      securityGroups: [pipelinesBackendSecurityGroup],
    });


    // Define the Web UI container
    const webUITaskDef = new ecs.FargateTaskDefinition(this, 'WebUITaskDef');
    const webUIContainer = webUITaskDef.addContainer('WebUiAppContainer', {
      image: ecs.ContainerImage.fromRegistry("ghcr.io/open-webui/open-webui:main"),
      memoryLimitMiB: 512,
      environment: {
        "WEBUI_AUTH": "False",
        "OPENAI_API_KEY": "0p3n-w3bu!",
        "OPENAI_API_BASE_URL": `http://${pipelinesBackendService.loadBalancer.loadBalancerDnsName}`,
      },
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: 'WebUI',
      }),
    });

    webUIContainer.addPortMappings({
      containerPort: 8080,
    });
    // Add a dependency so that the WebUI service only starts after the Pipelines Backend is running
    webUIContainer.node.addDependency(pipelinesBackendService);


    // Create the Web UI service and attach it to the load balancer
    const webUIAppService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'WebUiService', {
      cluster,
      serviceName: 'web-ui',
      taskDefinition: webUITaskDef,
      publicLoadBalancer: true,
      listenerPort: 80,
      securityGroups: [webUISecurityGroup],
    });



    // Allow WebUI to call pipelines backend (from the Web UI security group to the Pipelines Backend security group)
    pipelinesBackendSecurityGroup.addIngressRule(webUISecurityGroup, ec2.Port.tcp(9099), 'Allow WebUI to access Pipelines Backend');

    // Output the load balancer URLs
    new cdk.CfnOutput(this, 'WebUI', {
      value: `http://${webUIAppService.loadBalancer.loadBalancerDnsName}`,
    });

    new cdk.CfnOutput(this, 'PipelinesBackend', {
      value: `http://${pipelinesBackendService.loadBalancer.loadBalancerDnsName}`,
    });
  }
}
