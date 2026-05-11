import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { CdkBaseStack } from '../lib/cdk-base-stack';

test('CdkBaseStack synthesizes without errors', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CdkBaseStack(app, 'TestStack');
  // THEN
  const template = Template.fromStack(stack);
  expect(template).toBeDefined();
});

test('CdkBaseStack snapshot', () => {
  const app = new cdk.App();
  const stack = new CdkBaseStack(app, 'SnapshotStack');
  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
