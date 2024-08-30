import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';

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

    // create a security group for aurora db
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: vpc, // use the vpc created above
      allowAllOutbound: true, // allow outbound traffic to anywhere
    })

    // allow inbound traffic from anywhere to the db
    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432), // allow inbound traffic on port 5432 (postgres)
      'allow inbound traffic from anywhere to the db on port 5432'
    )

    // Generate random username and password for PostgreSQL
    const generateRandomString = (length: number, isUsername: boolean = false): string => {
      const randomString = Math.random().toString(36).substring(2, 2 + length);
      return isUsername ? randomString.replace(/[^a-zA-Z0-9_]/g, '').replace(/^/, 'u') : randomString; // Ensure username starts with a letter
    };

    const dbUsername = generateRandomString(8, true); // Random username of length 8
    const dbPassword = generateRandomString(12); // Random password of length 12

    // Create an Aurora PostgreSQL DB cluster
    const dbCluster = new rds.DatabaseCluster(this, 'DbCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_3,
      }),
      instanceProps: {
        vpc,
        instanceType: new ec2.InstanceType('serverless'),
        autoMinorVersionUpgrade: true,
        publiclyAccessible: true,
        securityGroups: [dbSecurityGroup],
        vpcSubnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PUBLIC, // use the public subnet created above for the db
        }),
      },
      port: 5432, // use port 5432 instead of 3306
      credentials: rds.Credentials.fromPassword(dbUsername, cdk.SecretValue.unsafePlainText(dbPassword)), // Use generated username and password
      clusterIdentifier: 'webui-db-cluster',
      defaultDatabaseName: 'webui',
    });

    // add capacity to the db cluster to enable scaling
    cdk.Aspects.of(dbCluster).add({
      visit(node) {
        if (node instanceof rds.CfnDBCluster) {
          node.serverlessV2ScalingConfiguration = {
            minCapacity: 0.5, // min capacity is 0.5 vCPU
            maxCapacity: 1, // max capacity is 1 vCPU (default)
          }
        }
      },
    })

    // Output the PostgreSQL connection string
    const connectionString = `postgresql://${dbUsername}:${dbPassword}@${dbCluster.clusterEndpoint.hostname}:${dbCluster.clusterEndpoint.port}/webui`;

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
        "DEFAULT_MODELS": sageMakerEndpointName.valueAsString,
        "DEFAULT_USER_ROLE": "user",
        "DATABASE_URL": connectionString,
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
    // Add a dependency so that the WebUI service only starts after the Pipelines Backend and DB are running
    webUIContainer.node.addDependency(pipelinesBackendService);
    webUIContainer.node.addDependency(dbCluster);


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

    // Output the database endpoint
    new cdk.CfnOutput(this, 'PostgresConnectionString', {
      value: connectionString,
      description: 'The connection string for the PostgreSQL database',
    });
  }
}
