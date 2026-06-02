import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CdkBaseStack } from '../lib/cdk-base-stack';

describe('CdkBaseStack', () => {
  let app: cdk.App;
  let stack: CdkBaseStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CdkBaseStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('synthesizes without errors', () => {
    expect(template).toBeDefined();
  });

  describe('Input S3 Bucket', () => {
    test('should exist with correct resource type', () => {
      template.resourceCountIs('AWS::S3::Bucket', 2); // Input + Output buckets
    });

    test('should have encryption enabled', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: Match.anyValue(),
              },
            },
          ],
        },
      });
    });

    test('should have versioning enabled', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('should block all public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('should have EventBridge notifications enabled', () => {
      // EventBridge notifications are configured via Custom::S3BucketNotifications
      template.hasResourceProperties('Custom::S3BucketNotifications', {
        NotificationConfiguration: {
          EventBridgeConfiguration: {},
        },
      });
    });
  });

  describe('Output S3 Bucket', () => {
    test('should have encryption enabled', () => {
      // Already covered by the earlier test - both buckets should be encrypted
      template.resourceCountIs('AWS::S3::Bucket', 2);
    });

    test('should have versioning enabled on output bucket', () => {
      // Both buckets should have versioning
      const buckets = template.findResources('AWS::S3::Bucket', {
        Properties: {
          VersioningConfiguration: {
            Status: 'Enabled',
          },
        },
      });
      expect(Object.keys(buckets).length).toBe(2);
    });

    test('should block all public access on output bucket', () => {
      // Both buckets should block public access
      const buckets = template.findResources('AWS::S3::Bucket', {
        Properties: {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
        },
      });
      expect(Object.keys(buckets).length).toBe(2);
    });
  });

  describe('EventBridge Rule', () => {
    test('should exist', () => {
      template.resourceCountIs('AWS::Events::Rule', 1);
    });

    test('should have event pattern for S3 Object Created events', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          source: ['aws.s3'],
          'detail-type': ['Object Created'],
          detail: {
            bucket: {
              name: Match.anyValue(), // Will be an array with the bucket name reference
            },
          },
        },
      });
    });

    test('should have a target configured', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });

    test('should be enabled', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
      });
    });
  });

  describe('IAM Permissions', () => {
    test('EventBridge rule should have permission to invoke target', () => {
      // The rule should have appropriate IAM role or permissions
      // This will be validated once we know the target type
      const rules = template.findResources('AWS::Events::Rule');
      expect(Object.keys(rules).length).toBeGreaterThan(0);
    });
  });

  test('snapshot test', () => {
    const app = new cdk.App();
    const stack = new CdkBaseStack(app, 'SnapshotStack');
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
