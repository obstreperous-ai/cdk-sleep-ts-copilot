import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PipelineStack, PipelineStage } from '../lib/pipeline-stack';

describe('PipelineStack', () => {
  describe('Pipeline Stack (Issue #9 - Skeleton)', () => {
    test('should synthesize without errors', () => {
      const app = new cdk.App();
      const stack = new PipelineStack(app, 'TestPipelineStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });
      const template = Template.fromStack(stack);
      expect(template).toBeDefined();
    });

    test('snapshot test for pipeline stack', () => {
      const app = new cdk.App();
      const stack = new PipelineStack(app, 'PipelineSnapshotStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });
      const template = Template.fromStack(stack);
      expect(template.toJSON()).toMatchSnapshot();
    });
  });

  describe('PipelineStage', () => {
    test('should create stage with application stack', () => {
      const app = new cdk.App({
        context: {
          env: 'dev',
        },
      });
      const stage = new PipelineStage(app, 'TestStage', {
        env: { account: '123456789012', region: 'us-east-1' },
        stageName: 'dev',
      });
      
      // Verify stage can be created
      expect(stage).toBeDefined();
      
      // Verify the stage has the application stack
      const stacks = stage.node.children.filter(child => child instanceof cdk.Stack);
      expect(stacks.length).toBeGreaterThan(0);
    });

    test('should support different stage names', () => {
      // Create separate App instances to avoid context conflicts
      // Each stage should be able to configure itself independently
      const devApp = new cdk.App({
        context: {
          env: 'dev',
        },
      });
      const devStage = new PipelineStage(devApp, 'DevStage', {
        env: { account: '123456789012', region: 'us-east-1' },
        stageName: 'dev',
      });
      
      const prodApp = new cdk.App({
        context: {
          env: 'prod',
        },
      });
      const prodStage = new PipelineStage(prodApp, 'ProdStage', {
        env: { account: '123456789012', region: 'us-east-1' },
        stageName: 'prod',
      });
      
      expect(devStage).toBeDefined();
      expect(prodStage).toBeDefined();
    });
  });
});
