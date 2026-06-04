import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class CdkBaseStack extends cdk.Stack {
  public readonly inputBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly eventBridgeRule: events.Rule;
  public readonly stateMachine: sfn.StateMachine;
  public readonly metadataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Input S3 Bucket - receives raw audio uploads
    this.inputBucket = new s3.Bucket(this, 'SleepAudioInputBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // Output S3 Bucket - stores processed audio
    this.outputBucket = new s3.Bucket(this, 'SleepAudioOutputBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // DynamoDB Table - stores audio pipeline metadata
    this.metadataTable = new dynamodb.Table(this, 'SleepAudioMetadataTable', {
      partitionKey: {
        name: 'audioId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Step Functions State Machine - orchestrates audio processing workflow
    // Log group for state machine execution logs
    const stateMachineLogGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB PutItem Task - writes initial metadata record
    // Using DynamodbPutItem L2 construct for type-safe DynamoDB integration
    const putMetadataTask = new tasks.DynamoPutItem(this, 'PutMetadataTask', {
      table: this.metadataTable,
      item: {
        audioId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
        status: tasks.DynamoAttributeValue.fromString('PROCESSING'),
        inputBucket: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.bucket')),
        inputKey: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
        createdAt: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        updatedAt: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
      },
      resultPath: '$.metadataResult',
    });

    // Polly Task - synthesizes speech from text (placeholder parameters)
    const pollyTask = new tasks.CallAwsService(this, 'PollyTask', {
      service: 'polly',
      action: 'startSpeechSynthesisTask',
      parameters: {
        OutputFormat: 'mp3',
        OutputS3BucketName: this.outputBucket.bucketName,
        Text: 'Placeholder text for sleep audio narration',
        VoiceId: 'Joanna',
      },
      iamResources: ['*'],
      resultPath: '$.pollyResult',
    });

    // State machine definition: Start -> Put Metadata -> Polly Task -> End
    const definition = putMetadataTask.next(pollyTask);

    this.stateMachine = new sfn.StateMachine(this, 'SleepAudioPipelineStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      logs: {
        destination: stateMachineLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: false,
    });

    // Grant the state machine permission to write to the output bucket
    this.outputBucket.grantWrite(this.stateMachine);

    // EventBridge Rule - triggers on S3 Object Created events
    this.eventBridgeRule = new events.Rule(this, 'S3ObjectCreatedRule', {
      description: 'Triggers processing workflow when audio files are uploaded to input bucket',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [this.inputBucket.bucketName],
          },
        },
      },
      enabled: true,
    });

    // Add Step Functions state machine as target
    // Use InputTransformer to pass S3 event data (bucket and key) to state machine
    this.eventBridgeRule.addTarget(
      new targets.SfnStateMachine(this.stateMachine, {
        input: events.RuleTargetInput.fromObject({
          bucket: events.EventField.fromPath('$.detail.bucket.name'),
          key: events.EventField.fromPath('$.detail.object.key'),
        }),
      })
    );
  }
}
