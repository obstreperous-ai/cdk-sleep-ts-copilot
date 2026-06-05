import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class CdkBaseStack extends cdk.Stack {
  public readonly inputBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly eventBridgeRule: events.Rule;
  public readonly stateMachine: sfn.StateMachine;
  public readonly metadataTable: dynamodb.Table;
  public readonly completedTopic: sns.Topic;
  public readonly failedTopic: sns.Topic;

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

    // KMS Key for SNS topic encryption
    const snsEncryptionKey = new kms.Key(this, 'SnsEncryptionKey', {
      enableKeyRotation: true,
      description: 'KMS key for encrypting SNS topics',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // SNS Topics for pipeline notifications
    this.completedTopic = new sns.Topic(this, 'SleepAudioPipelineCompletedTopic', {
      displayName: 'Sleep Audio Pipeline Completed',
      masterKey: snsEncryptionKey,
    });

    this.failedTopic = new sns.Topic(this, 'SleepAudioPipelineFailedTopic', {
      displayName: 'Sleep Audio Pipeline Failed',
      masterKey: snsEncryptionKey,
    });

    // Step Functions State Machine - orchestrates audio processing workflow
    // Log group for state machine execution logs
    const stateMachineLogGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB PutItem Task - writes initial metadata record
    // Using DynamodbPutItem L2 construct for type-safe DynamoDB integration
    // TODO: Consider using execution ID or bucket+key combination for unique audioId
    // to avoid collision if same key is uploaded to different buckets
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

    // DynamoDB UpdateItem Task - updates status to COMPLETED on success
    const updateCompletedStatusTask = new tasks.DynamoUpdateItem(this, 'UpdateCompletedStatusTask', {
      table: this.metadataTable,
      key: {
        audioId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
      },
      updateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      expressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      expressionAttributeValues: {
        ':status': tasks.DynamoAttributeValue.fromString('COMPLETED'),
        ':updatedAt': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
      },
      resultPath: '$.updateResult',
    });

    // SNS Publish Task - sends success notification
    const publishSuccessTask = new tasks.SnsPublish(this, 'PublishSuccessTask', {
      topic: this.completedTopic,
      message: sfn.TaskInput.fromObject({
        status: 'COMPLETED',
        audioId: sfn.JsonPath.stringAt('$.key'),
        inputBucket: sfn.JsonPath.stringAt('$.bucket'),
        inputKey: sfn.JsonPath.stringAt('$.key'),
        completedAt: sfn.JsonPath.stringAt('$$.State.EnteredTime'),
      }),
      resultPath: '$.snsResult',
    });

    // DynamoDB UpdateItem Task - updates status to FAILED on error
    const updateFailedStatusTask = new tasks.DynamoUpdateItem(this, 'UpdateFailedStatusTask', {
      table: this.metadataTable,
      key: {
        audioId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
      },
      updateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #error = :error',
      expressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#error': 'error',
      },
      expressionAttributeValues: {
        ':status': tasks.DynamoAttributeValue.fromString('FAILED'),
        ':updatedAt': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':error': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.jsonToString(sfn.JsonPath.objectAt('$.error'))),
      },
      resultPath: '$.updateResult',
    });

    // SNS Publish Task - sends failure notification
    const publishFailureTask = new tasks.SnsPublish(this, 'PublishFailureTask', {
      topic: this.failedTopic,
      message: sfn.TaskInput.fromObject({
        status: 'FAILED',
        audioId: sfn.JsonPath.stringAt('$.key'),
        inputBucket: sfn.JsonPath.stringAt('$.bucket'),
        inputKey: sfn.JsonPath.stringAt('$.key'),
        error: sfn.JsonPath.objectAt('$.error'),
        failedAt: sfn.JsonPath.stringAt('$$.State.EnteredTime'),
      }),
      resultPath: '$.snsResult',
    });

    // State machine definition with error handling:
    // Start -> Put Metadata -> Polly Task -> Update Completed Status -> Publish Success
    // On error: Update Failed Status -> Publish Failure -> End
    const successPath = pollyTask
      .next(updateCompletedStatusTask)
      .next(publishSuccessTask);

    const errorPath = updateFailedStatusTask
      .next(publishFailureTask);

    // Add error handling (Catch) to the Polly task
    pollyTask.addCatch(errorPath, {
      resultPath: '$.error',
    });

    // Also add error handling to the initial put metadata task
    putMetadataTask.addCatch(errorPath, {
      resultPath: '$.error',
    });

    const definition = putMetadataTask.next(successPath);

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

    // Grant the state machine permission to publish to SNS topics
    this.completedTopic.grantPublish(this.stateMachine);
    this.failedTopic.grantPublish(this.stateMachine);

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
