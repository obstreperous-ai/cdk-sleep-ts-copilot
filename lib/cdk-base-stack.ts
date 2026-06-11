import * as cdk from 'aws-cdk-lib';
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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Environment-specific configuration for the Sleep Audio Pipeline
 */
interface EnvironmentConfig {
  removalPolicy: cdk.RemovalPolicy;
  logRetention: logs.RetentionDays;
}

/**
 * Get environment-specific configuration based on CDK context
 */
function getEnvironmentConfig(scope: Construct): EnvironmentConfig {
  const env = scope.node.tryGetContext('env') || 'dev';
  
  switch (env) {
    case 'prod':
      return {
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        logRetention: logs.RetentionDays.ONE_MONTH,
      };
    case 'stage':
      return {
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        logRetention: logs.RetentionDays.ONE_WEEK,
      };
    case 'dev':
    default:
      return {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        logRetention: logs.RetentionDays.THREE_DAYS,
      };
  }
}

export class CdkBaseStack extends cdk.Stack {
  public readonly inputBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly eventBridgeRule: events.Rule;
  public readonly stateMachine: sfn.StateMachine;
  public readonly metadataTable: dynamodb.Table;
  public readonly completedTopic: sns.Topic;
  public readonly failedTopic: sns.Topic;
  public readonly audioProcessorFunction: lambda.Function;
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment-specific configuration
    const envConfig = getEnvironmentConfig(this);

    // Input S3 Bucket - receives raw audio uploads
    this.inputBucket = new s3.Bucket(this, 'SleepAudioInputBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: envConfig.removalPolicy,
      enforceSSL: true,
    });

    // Output S3 Bucket - stores processed audio
    this.outputBucket = new s3.Bucket(this, 'SleepAudioOutputBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: envConfig.removalPolicy,
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
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: envConfig.removalPolicy,
    });

    // KMS Key for SNS topic encryption
    const snsEncryptionKey = new kms.Key(this, 'SnsEncryptionKey', {
      enableKeyRotation: true,
      description: 'KMS key for encrypting SNS topics',
      removalPolicy: envConfig.removalPolicy,
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

    // SNS Topic for CloudWatch Alarms
    this.alarmTopic = new sns.Topic(this, 'SleepAudioPipelineAlarmTopic', {
      displayName: 'Sleep Audio Pipeline Alarms',
      masterKey: snsEncryptionKey,
    });

    // Lambda Function - SleepAudioProcessor
    // Audio processing Lambda with full S3 download/upload and Polly synthesis
    this.audioProcessorFunction = new lambda.Function(this, 'SleepAudioProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/sleep-audio-processor')),
      environment: {
        TABLE_NAME: this.metadataTable.tableName,
        INPUT_BUCKET: this.inputBucket.bucketName,
        OUTPUT_BUCKET: this.outputBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(120), // Increased for audio processing and Polly synthesis
      description: 'Processes audio files using Polly synthesis and S3 operations',
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant Lambda permissions to access DynamoDB
    this.metadataTable.grantReadWriteData(this.audioProcessorFunction);

    // Grant Lambda permissions to read from input bucket
    this.inputBucket.grantRead(this.audioProcessorFunction);

    // Grant Lambda permissions to write to output bucket
    this.outputBucket.grantWrite(this.audioProcessorFunction);

    // Grant Lambda permissions to use Amazon Polly for speech synthesis
    this.audioProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'], // Polly doesn't support resource-level permissions
    }));

    // Step Functions State Machine - orchestrates audio processing workflow
    // Log group for state machine execution logs
    const stateMachineLogGroup = new logs.LogGroup(this, 'StateMachineLogGroup', {
      retention: envConfig.logRetention,
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
    }).addRetry({
      errors: ['DynamoDB.ProvisionedThroughputExceededException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Lambda Invoke Task - processes and enriches audio metadata
    const audioProcessorTask = new tasks.LambdaInvoke(this, 'AudioProcessorTask', {
      lambdaFunction: this.audioProcessorFunction,
      payload: sfn.TaskInput.fromObject({
        bucket: sfn.JsonPath.stringAt('$.bucket'),
        key: sfn.JsonPath.stringAt('$.key'),
        audioId: sfn.JsonPath.stringAt('$.key'),
      }),
      resultPath: '$.audioProcessorResult',
    }).addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
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
    }).addRetry({
      errors: ['Polly.ServiceException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // DynamoDB UpdateItem Task - updates status to COMPLETED on success
    // Now includes output location and file size from Lambda processing result
    const updateCompletedStatusTask = new tasks.DynamoUpdateItem(this, 'UpdateCompletedStatusTask', {
      table: this.metadataTable,
      key: {
        audioId: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.key')),
      },
      updateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #outputLocation = :outputLocation, #outputFileSize = :outputFileSize',
      expressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
        '#outputLocation': 'outputLocation',
        '#outputFileSize': 'outputFileSize',
      },
      expressionAttributeValues: {
        ':status': tasks.DynamoAttributeValue.fromString('COMPLETED'),
        ':updatedAt': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$$.State.EnteredTime')),
        ':outputLocation': tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.audioProcessorResult.Payload.outputLocation')),
        ':outputFileSize': tasks.DynamoAttributeValue.numberFromString(sfn.JsonPath.stringAt('States.Format(\'{}\', $.audioProcessorResult.Payload.outputFileSize)')),
      },
      resultPath: '$.updateResult',
    }).addRetry({
      errors: ['DynamoDB.ProvisionedThroughputExceededException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // SNS Publish Task - sends success notification with output details
    const publishSuccessTask = new tasks.SnsPublish(this, 'PublishSuccessTask', {
      topic: this.completedTopic,
      message: sfn.TaskInput.fromObject({
        status: 'COMPLETED',
        audioId: sfn.JsonPath.stringAt('$.key'),
        inputBucket: sfn.JsonPath.stringAt('$.bucket'),
        inputKey: sfn.JsonPath.stringAt('$.key'),
        outputLocation: sfn.JsonPath.stringAt('$.audioProcessorResult.Payload.outputLocation'),
        outputFileSize: sfn.JsonPath.stringAt('$.audioProcessorResult.Payload.outputFileSize'),
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
    }).addRetry({
      errors: ['DynamoDB.ProvisionedThroughputExceededException', 'States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
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
    // Start -> Put Metadata -> Audio Processor Lambda -> Polly Task -> Update Completed Status -> Publish Success
    // On error: Update Failed Status -> Publish Failure -> End
    const successPath = audioProcessorTask
      .next(pollyTask)
      .next(updateCompletedStatusTask)
      .next(publishSuccessTask);

    const errorPath = updateFailedStatusTask
      .next(publishFailureTask);

    // Add advanced error handling (Catch) with specific error types to the Lambda processor task
    audioProcessorTask.addCatch(errorPath, {
      errors: ['Lambda.ServiceException', 'Lambda.TooManyRequestsException', 'States.TaskFailed'],
      resultPath: '$.error',
    });

    // Add advanced error handling (Catch) with specific error types to the Polly task
    pollyTask.addCatch(errorPath, {
      errors: ['Polly.ServiceException', 'States.TaskFailed'],
      resultPath: '$.error',
    });

    // Also add advanced error handling to the initial put metadata task
    putMetadataTask.addCatch(errorPath, {
      errors: ['DynamoDB.ProvisionedThroughputExceededException', 'States.TaskFailed'],
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
      tracingEnabled: true,
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

    // CloudWatch Alarms for Observability (Issue #10)
    
    // Alarm for State Machine Execution Failures
    const stateMachineFailureAlarm = new cloudwatch.Alarm(this, 'StateMachineExecutionFailuresAlarm', {
      alarmName: 'SleepAudioPipeline-StateMachineFailures',
      alarmDescription: 'Alerts when state machine executions fail',
      metric: this.stateMachine.metricFailed({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    stateMachineFailureAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Alarm for Lambda Function Errors
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaFunctionErrorsAlarm', {
      alarmName: 'SleepAudioPipeline-LambdaErrors',
      alarmDescription: 'Alerts when Lambda function errors occur',
      metric: this.audioProcessorFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Alarm for Lambda Function Throttles
    const lambdaThrottleAlarm = new cloudwatch.Alarm(this, 'LambdaFunctionThrottlesAlarm', {
      alarmName: 'SleepAudioPipeline-LambdaThrottles',
      alarmDescription: 'Alerts when Lambda function is throttled',
      metric: this.audioProcessorFunction.metricThrottles({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaThrottleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
  }
}
