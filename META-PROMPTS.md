# Meta-Prompting Patterns for Agentic TDD Infrastructure-as-Code

> **Purpose**: This document extracts reusable patterns, guidelines, and meta-prompts from the `cdk-sleep-ts-copilot` project that can be applied to future agentic Test-Driven Development (TDD) Infrastructure-as-Code (IaC) projects using AWS CDK, GitHub Copilot, or similar AI-assisted development workflows.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Strict TDD Workflow Pattern](#strict-tdd-workflow-pattern)
3. [Documentation-as-Source-of-Truth Pattern](#documentation-as-source-of-truth-pattern)
4. [Issue-Driven Development Pattern](#issue-driven-development-pattern)
5. [Multi-Environment Configuration Pattern](#multi-environment-configuration-pattern)
6. [Agent Persona Template](#agent-persona-template)
7. [Commit Convention Pattern](#commit-convention-pattern)
8. [Testing Organization Pattern](#testing-organization-pattern)
9. [Security-First Configuration Pattern](#security-first-configuration-pattern)
10. [Observability-First Pattern](#observability-first-pattern)
11. [Reusable Agent Instructions](#reusable-agent-instructions)

---

## Core Principles

### The Golden Rules of Agentic TDD IaC

1. **Test First, Always** — No production code without a failing test first
2. **Architecture First** — Design document is the single source of truth
3. **Document Synchronously** — Update architecture docs in the same commit as code
4. **L2/L3 Over L1** — Prefer high-level CDK constructs over raw CloudFormation
5. **Synthesize Before Commit** — `cdk synth` must succeed before every commit
6. **Conventional Commits** — Use semantic commit messages for traceability
7. **Issue-Based Organization** — Trace tests and features back to GitHub issues

---

## Strict TDD Workflow Pattern

### Pattern Description

A non-negotiable Red → Green → Refactor cycle for infrastructure changes.

### Implementation Steps

```
1. RED: Write failing Jest test
   - Use fine-grained assertions (hasResourceProperties, resourceCountIs)
   - Add snapshot tests for regression coverage
   - Confirm test FAILS before proceeding

2. GREEN: Write minimal CDK code
   - Write only enough code to make the test pass
   - No extra features, no speculation
   - Confirm test PASSES

3. REFACTOR: Clean up code
   - Improve readability, extract helpers
   - Tests must remain GREEN
   - Run `cdk synth` to verify CloudFormation validity

4. COMMIT: Use conventional commit message
   - Include ARCHITECTURE.md updates in same commit
   - Example: "feat(pipeline): add S3 input bucket with EventBridge notification"
```

### Example Test-First Assertion

```typescript
// Red: Write failing test first
it('should have input S3 bucket with encryption', () => {
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }
      ]
    }
  });
});

// Green: Write minimal CDK code
this.inputBucket = new s3.Bucket(this, 'InputBucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
});
```

### Success Criteria

- ✅ All tests pass (`npm test` = 0 failures)
- ✅ CloudFormation synthesizes (`npx cdk synth` = success)
- ✅ Architecture docs updated in same commit

---

## Documentation-as-Source-of-Truth Pattern

### Pattern Description

Use a living architecture document (`ARCHITECTURE.md`) as the single source of truth for all design decisions, implementation status, and future work.

### Required Sections

1. **High-Level Overview** — Goals, constraints, design principles
2. **Implementation Status Table** — Track which components are ✅ Done, 🚧 In Progress, ⬜ Not Started
3. **Data Flow** — Step-by-step description of system behavior
4. **Component Details** — Each component's purpose, configuration, issue tracking
5. **Mermaid Diagrams** — Visual representation of architecture
6. **Multi-Environment Support** — How dev/stage/prod differ
7. **Security & Observability** — Built-in best practices
8. **Key Design Decisions** — Rationale for major choices

### Synchronization Rule

> **Critical**: Update `ARCHITECTURE.md` (prose + diagram) in the **same commit** as code changes. This keeps design and implementation aligned.

### Example Implementation Status Table

```markdown
| Component | Status | CDK construct / file |
|---|---|---|
| S3 Input Bucket | ✅ Done (Issue #3) | `lib/stack.ts` (InputBucket) |
| Lambda Processor | 🚧 In Progress (Issue #7) | `lib/stack.ts` (ProcessorFunction) |
| Bedrock Integration | ⬜ Not started | — |
```

---

## Issue-Driven Development Pattern

### Pattern Description

Organize all work around GitHub issues. Each issue represents a discrete feature, with tests organized by issue number for traceability.

### Issue Template

```markdown
**Goal**: [One-sentence description of what this issue accomplishes]

**Strict Discipline (must follow)**:
- Start by reviewing existing files and code structure
- Write failing tests first (Red → Green → Refactor)
- Update ARCHITECTURE.md in the same commit
- Use conventional commits

**Specific Requirements**:
1. [Specific technical requirement]
2. [Specific technical requirement]
3. ...

**Tasks (in strict order)**:
1. Write failing tests
2. Implement minimal code
3. Update ARCHITECTURE.md
4. Verify `cdk synth` succeeds

**Success Criteria**:
- [Measurable success criterion]
- [Measurable success criterion]

**Next Issue** (when complete): "[Next issue number and title]"
```

### Test Organization by Issue

```typescript
describe('Complete Pipeline Wiring and Input Validation (Issue #8)', () => {
  describe('Input Validation', () => {
    it('should validate required fields', () => { /* ... */ });
  });
  
  describe('Pipeline Integration', () => {
    it('should wire EventBridge to Step Functions', () => { /* ... */ });
  });
});
```

### Benefits

- ✅ Clear audit trail of features → issues → tests → code
- ✅ Easy to identify test coverage per feature milestone
- ✅ Natural documentation of development progression

---

## Multi-Environment Configuration Pattern

### Pattern Description

Single codebase supports multiple environments (dev, stage, prod) via CDK context flags, with environment-specific policies for removal, retention, and cost control.

### Implementation

```typescript
interface EnvironmentConfig {
  removalPolicy: cdk.RemovalPolicy;
  logRetention: logs.RetentionDays;
}

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

// Usage in stack constructor
const envConfig = getEnvironmentConfig(this);

new s3.Bucket(this, 'DataBucket', {
  removalPolicy: envConfig.removalPolicy,
  // ... other config
});
```

### Deployment Commands

```bash
npx cdk deploy -c env=dev    # Development: DESTROY policy, 3-day logs
npx cdk deploy -c env=stage  # Staging: RETAIN policy, 7-day logs
npx cdk deploy -c env=prod   # Production: RETAIN policy, 30-day logs
```

### Testing Multi-Environment

```typescript
it('should use DESTROY removal policy in dev environment', () => {
  const app = new cdk.App({ context: { env: 'dev' } });
  const stack = new MyStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  
  template.hasResourceProperties('AWS::S3::Bucket', {
    DeletionPolicy: 'Delete',
  });
});
```

---

## Agent Persona Template

### Pattern Description

Define a clear persona for the AI agent with non-negotiable rules and workflow steps.

### Template

```markdown
# Agent Guidelines

## Persona

You are a **[Role]** working on the `[project-name]` [project type].

## Core Rules (non-negotiable)

### 1. Strict TDD — Always Red → Green → Refactor
- Write failing test first
- Use [testing framework] with [assertion libraries]
- Only write minimal code to pass tests
- Refactor only after tests are green

### 2. [Architecture Document] Is the Source of Truth
- Every change must align with the architecture document
- Update architecture document in the same commit as code
- Include diagrams alongside prose descriptions

### 3. Prefer [High-Level Abstractions]
- Use L2/L3 constructs over L1 (CDK)
- Avoid raw CloudFormation unless necessary

### 4. [Framework-Specific] Principles
- Security: encryption, least-privilege IAM, no hard-coded secrets
- Reliability: retries, error handling, dead-letter queues
- Observability: structured logging, tracing, alarms

### 5. Never Deploy Until Tests + Synth Succeed
- `[test command]` must pass
- `[synth command]` must succeed
- No deployments until both checks pass

### 6. Conventional Commits
- Use semantic commit messages
- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, chore, docs, test, refactor, ci, perf

## Workflow Summary

1. Understand the issue / requirement
2. Write failing test(s) → confirm RED
3. Write minimal code → confirm GREEN
4. Refactor if needed → tests still GREEN
5. Run synth → must succeed
6. Update architecture document
7. Commit with conventional commit message
8. Open PR; CI must be green before merge
```

---

## Commit Convention Pattern

### Pattern Description

Use semantic commit messages following [Conventional Commits](https://www.conventionalcommits.org/) for automatic changelog generation and clear history.

### Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance tasks
- `docs`: Documentation only
- `test`: Test changes
- `refactor`: Code refactoring
- `ci`: CI/CD changes
- `perf`: Performance improvements

### Examples

```
feat(pipeline): add S3 input bucket with EventBridge notification
test(pipeline): add fine-grained assertions for S3 encryption
docs(architecture): update Mermaid diagram after adding DynamoDB table
fix(lambda): handle missing S3 objects gracefully
chore(deps): upgrade CDK to 2.252.0
refactor(stack): extract environment config helper function
```

---

## Testing Organization Pattern

### Pattern Description

Organize tests hierarchically by issue/feature, use fine-grained assertions for specific behaviors, and snapshot tests for regression protection.

### Structure

```typescript
describe('[Project Name]', () => {
  describe('[Component] (Issue #N)', () => {
    describe('[Sub-feature]', () => {
      it('should have specific behavior', () => {
        // Fine-grained assertion
        template.hasResourceProperties('AWS::Resource::Type', {
          Property: expectedValue,
        });
      });
      
      it('should have N resources of type X', () => {
        template.resourceCountIs('AWS::Resource::Type', N);
      });
    });
  });
  
  describe('Snapshot Regression Tests', () => {
    it('should match CloudFormation snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
```

### Testing Best Practices

1. **Fine-Grained Assertions First** — Test specific properties, not entire templates
2. **Issue-Based Organization** — Group tests by GitHub issue for traceability
3. **Snapshot Tests for Regression** — Catch unexpected changes
4. **Test Environment Variants** — Verify dev/stage/prod configurations
5. **Test Error Paths** — Verify retry logic, catch blocks, and failure notifications
6. **Test IAM Policies** — Verify least-privilege permissions

### Example Issue-Based Test Block

```typescript
describe('Complete Pipeline Wiring and Input Validation (Issue #8)', () => {
  let stack: CdkBaseStack;
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new CdkBaseStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  describe('Input Validation', () => {
    it('should validate required fields in Lambda handler', () => {
      // Test input validation logic
    });
  });

  describe('Pipeline Integration', () => {
    it('should wire EventBridge rule to Step Functions', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
            RoleArn: Match.anyValue(),
          }),
        ]),
      });
    });
  });
});
```

---

## Security-First Configuration Pattern

### Pattern Description

Bake security best practices into default configurations following AWS Well-Architected Framework principles.

### S3 Security Baseline

```typescript
new s3.Bucket(this, 'SecureBucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN, // prod
});
```

### SNS Security Baseline

```typescript
const kmsKey = new kms.Key(this, 'EncryptionKey', {
  enableKeyRotation: true,
  description: 'KMS key for SNS topic encryption',
});

new sns.Topic(this, 'SecureTopic', {
  masterKey: kmsKey,
});
```

### DynamoDB Security Baseline

```typescript
new dynamodb.Table(this, 'SecureTable', {
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: true,
  },
  removalPolicy: cdk.RemovalPolicy.RETAIN, // prod
});
```

### IAM Least-Privilege Pattern

```typescript
// ❌ BAD: Wildcard permissions
lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:*'],
  resources: ['*'],
}));

// ✅ GOOD: Specific permissions on specific resources
lambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:GetObject'],
  resources: [inputBucket.arnForObjects('*')],
}));
```

### Security Testing

```typescript
it('should block public access on all S3 buckets', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

it('should enforce HTTPS on S3 buckets', () => {
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Deny',
          Principal: '*',
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        }),
      ]),
    },
  });
});
```

---

## Observability-First Pattern

### Pattern Description

Build tracing, structured logging, and monitoring into infrastructure from day one.

### X-Ray Tracing

```typescript
// Lambda with X-Ray
new lambda.Function(this, 'TracedFunction', {
  tracing: lambda.Tracing.ACTIVE,
  // ... other config
});

// Step Functions with X-Ray
new sfn.StateMachine(this, 'TracedStateMachine', {
  tracingEnabled: true,
  // ... other config
});
```

### Structured Logging in Lambda

```typescript
// Lambda handler with structured JSON logging
export const handler = async (event: any, context: Context) => {
  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Processing started',
    requestId: context.awsRequestId,
    data: { bucket: event.bucket, key: event.key },
  }));

  try {
    // Processing logic
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Processing completed',
      requestId: context.awsRequestId,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      level: 'ERROR',
      message: 'Processing failed',
      requestId: context.awsRequestId,
      error: error.message,
      stack: error.stack,
    }));
    throw error;
  }
};
```

### CloudWatch Alarms

```typescript
// Alarm on Lambda errors
const errorAlarm = audioProcessorFunction.metricErrors({
  period: cdk.Duration.minutes(5),
  statistic: cloudwatch.Statistic.SUM,
}).createAlarm(this, 'ProcessorErrorAlarm', {
  threshold: 0,
  evaluationPeriods: 2,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  alarmDescription: 'Alert when Lambda function errors occur',
});

errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

// Alarm on Step Functions failures
const sfnFailureAlarm = stateMachine.metricFailed({
  period: cdk.Duration.minutes(5),
  statistic: cloudwatch.Statistic.SUM,
}).createAlarm(this, 'StateMachineFailureAlarm', {
  threshold: 0,
  evaluationPeriods: 2,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  alarmDescription: 'Alert when state machine executions fail',
});
```

### Observability Testing

```typescript
it('should enable X-Ray tracing on Lambda', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    TracingConfig: {
      Mode: 'Active',
    },
  });
});

it('should enable CloudWatch Logs for state machine', () => {
  template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
    LoggingConfiguration: {
      Level: 'ALL',
      IncludeExecutionData: true,
    },
  });
});
```

---

## Reusable Agent Instructions

### For GitHub Copilot or Similar AI Agents

```markdown
You are working on an Infrastructure-as-Code project using AWS CDK and TypeScript. 
Follow these strict guidelines:

1. **TDD First**: Write failing tests before any CDK code. Use `Template.fromStack()` with `hasResourceProperties()` and `resourceCountIs()` assertions.

2. **Architecture Sync**: Update `ARCHITECTURE.md` (description + Mermaid diagram) in the same commit as code changes.

3. **L2/L3 Constructs**: Prefer high-level CDK constructs. Only use L1 (`Cfn*` classes) when L2/L3 cannot express the requirement.

4. **Security by Default**: Enable encryption (S3, SNS, DynamoDB), block public access (S3), use least-privilege IAM, enforce HTTPS.

5. **Observability Built-In**: Enable X-Ray tracing (`tracing: lambda.Tracing.ACTIVE`), structured JSON logging, CloudWatch alarms.

6. **Multi-Environment**: Use CDK context (`-c env=dev|stage|prod`) for environment-specific configs. Dev = DESTROY + 3-day logs, Stage = RETAIN + 7-day logs, Prod = RETAIN + 30-day logs.

7. **Never Deploy Until**:
   - `npm test` passes (0 failures)
   - `npx cdk synth` succeeds
   - `ARCHITECTURE.md` is updated

8. **Conventional Commits**: Use semantic commit messages (`feat(scope): description`).

9. **Issue-Based Tests**: Organize tests by GitHub issue in nested describe blocks.

10. **Error Handling**: Add retry policies (3 attempts, 2s interval, 2.0 backoff), catch blocks, and failure notifications.
```

---

## Applying These Patterns to New Projects

### Quick Start Checklist

- [ ] Create `ARCHITECTURE.md` with implementation status table and Mermaid diagram
- [ ] Set up `AGENT_GUIDELINES.md` with persona and core rules
- [ ] Configure Jest with `aws-cdk-lib/assertions` for CDK testing
- [ ] Create `CONTRIBUTING.md` with TDD workflow and commit conventions
- [ ] Implement `getEnvironmentConfig()` helper for multi-environment support
- [ ] Enable X-Ray tracing, structured logging, and CloudWatch alarms from day one
- [ ] Use security-first defaults (encryption, block public access, enforce HTTPS, least-privilege IAM)
- [ ] Organize tests by GitHub issue in nested describe blocks
- [ ] Set up CI workflow to run `npm test` and `npx cdk synth`
- [ ] Use conventional commits for all changes

### Example Project Initialization

```bash
# 1. Initialize CDK project
mkdir my-iac-project && cd my-iac-project
cdk init app --language=typescript

# 2. Set up testing
npm install --save-dev jest @types/jest ts-jest
npx jest --init

# 3. Create documentation structure
touch ARCHITECTURE.md CONTRIBUTING.md META-PROMPTS.md
mkdir -p .github && touch .github/AGENT_GUIDELINES.md

# 4. Configure security and observability baselines in lib/my-stack.ts
# 5. Write first failing test in test/my-stack.test.ts
# 6. Start TDD cycle: Red → Green → Refactor
```

---

## Lessons Learned from cdk-sleep-ts-copilot

### What Worked Well

1. **Strict TDD Discipline** — Prevented regressions, documented intent, built confidence
2. **Architecture-First Approach** — Clear roadmap prevented scope creep and rework
3. **Issue-Driven Development** — Easy traceability from features → issues → tests → code
4. **Multi-Environment Context** — Single codebase for all environments simplified deployment
5. **Fine-Grained + Snapshot Tests** — Specific assertions + regression protection
6. **Conventional Commits** — Clear history, easy to generate changelogs

### Challenges Overcome

1. **Deprecated APIs** — Migrated from `pointInTimeRecovery` to `pointInTimeRecoverySpecification`
2. **Custom Resource Functions** — Learned that CDK creates hidden Lambda functions for custom resources (affects function counts in tests)
3. **State Machine Type** — `StateMachineType` defaults to STANDARD in CDK (optional property)
4. **Test Organization** — Issue-based describe blocks improved clarity

### Key Metrics

- **145 passing tests** across 2 test suites
- **12 development issues** (Issues #2–#12)
- **30+ AWS resources** deployed
- **100% TDD compliance** — Every feature test-driven

---

## Further Reading

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Test-Driven Development by Example (Kent Beck)](https://www.oreilly.com/library/view/test-driven-development/0321146530/)
- [Infrastructure as Code (Kief Morris)](https://www.oreilly.com/library/view/infrastructure-as-code/9781098114664/)

---

**Built with ❤️ by GitHub Copilot using strict Test-Driven Development**
