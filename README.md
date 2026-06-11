# cdk-sleep-ts-copilot

> **An event-driven sleep audio pipeline built with AWS CDK (TypeScript) using strict Test-Driven Development**

[![CI](https://github.com/obstreperous-ai/cdk-sleep-ts-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/obstreperous-ai/cdk-sleep-ts-copilot/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-145%20passing-brightgreen)](./test)
[![CDK](https://img.shields.io/badge/AWS%20CDK-2.252.0-orange)](https://aws.amazon.com/cdk/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)](https://www.typescriptlang.org/)

---

## 📋 Overview

The **Sleep Audio Pipeline** is a fully serverless, production-ready system that processes audio files uploaded to S3, orchestrates workflow with Step Functions, synthesizes soothing sleep audio using Amazon Polly, and publishes completion notifications via SNS. Built entirely with AWS CDK following strict TDD principles, this project demonstrates infrastructure-as-code best practices for security, observability, reliability, and multi-environment deployment.

**🎯 What It Does:**
1. User uploads audio file → S3 Input Bucket (encrypted, versioned)
2. EventBridge detects upload → Starts Step Functions execution
3. Lambda processes audio → Downloads, validates, synthesizes with Polly, uploads to output bucket
4. DynamoDB tracks metadata → Processing status, output location, file size
5. SNS publishes notifications → Success or failure alerts

**📊 Project Stats:**
- **145 passing tests** (100% TDD coverage)
- **30+ AWS resources** deployed via CDK
- **12 development issues** (Issues #2–#12)
- **3 environments** supported (dev, stage, prod)

---

## 🏗️ Architecture

```mermaid
flowchart TD
    U([User]) -->|1. Upload audio| S3in[(S3 Input Bucket)]
    S3in -->|2. Object Created| EB{{EventBridge Rule}}
    EB -->|3. StartExecution| SFN[Step Functions State Machine]
    
    SFN -->|4a. Initial metadata| DDB[(DynamoDB Table)]
    SFN -->|4b. Process audio| Lambda[Lambda Processor]
    Lambda -->|Synthesize| Polly[Amazon Polly]
    Lambda -->|Upload| S3out[(S3 Output Bucket)]
    Lambda -->|Update metadata| DDB
    SFN -->|5. Success| SNS_OK[SNS Completed Topic]
    SFN -->|5. Failure| SNS_FAIL[SNS Failed Topic]
    
    CW[CloudWatch Alarms] -->|Alerts| SNS_ALARM[SNS Alarm Topic]
    
    style SFN fill:#f9f,stroke:#333
    style Lambda fill:#ff9,stroke:#333
    style Polly fill:#9f9,stroke:#333
```

**Key Features:**
- ✅ **Fully Serverless**: No servers to manage (S3, Lambda, Step Functions, DynamoDB, SNS)
- ✅ **Event-Driven**: Decoupled architecture with EventBridge routing
- ✅ **Secure by Default**: Encryption at rest/transit, least-privilege IAM, private buckets
- ✅ **Observable**: X-Ray tracing, CloudWatch Logs/Alarms, structured JSON logging
- ✅ **Resilient**: Retry policies with exponential backoff, error handling, PITR backups
- ✅ **Multi-Environment**: Single codebase deploys to dev/stage/prod with context flags

See [ARCHITECTURE.md](./ARCHITECTURE.md) for comprehensive design documentation and detailed Mermaid diagrams.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20.x ([Download](https://nodejs.org/))
- **AWS CDK CLI**: `npm install -g aws-cdk`
- **AWS Account** with CDK bootstrapped: `cdk bootstrap aws://ACCOUNT-ID/REGION`
- **AWS CLI** configured with credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/obstreperous-ai/cdk-sleep-ts-copilot.git
cd cdk-sleep-ts-copilot

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Run tests (should see 145 passing)
npm test

# Synthesize CloudFormation template
npx cdk synth
```

### Deployment

```bash
# Deploy to dev environment (DESTROY policy, 3-day logs)
npx cdk deploy -c env=dev

# Deploy to stage environment (RETAIN policy, 7-day logs)
npx cdk deploy -c env=stage

# Deploy to production environment (RETAIN policy, 30-day logs)
npx cdk deploy -c env=prod

# Review changes before deployment
npx cdk diff -c env=prod
```

### Testing the Pipeline

1. **Upload a test audio file**:
   ```bash
   aws s3 cp test-audio.mp3 s3://YOUR-INPUT-BUCKET/uploads/test-audio.mp3
   ```

2. **Monitor execution** in AWS Console:
   - **Step Functions**: View workflow execution and state transitions
   - **CloudWatch Logs**: Check Lambda processing logs (structured JSON)
   - **X-Ray Service Map**: View distributed trace of the request
   - **DynamoDB**: Verify metadata record with `COMPLETED` status
   - **S3 Output Bucket**: Confirm processed audio file: `processed-test-audio-{timestamp}.mp3`

3. **Check notifications**:
   - Subscribe to SNS Completed/Failed topics to receive email alerts
   - Verify SNS message contains audioId, output location, and file size

4. **Test error handling**:
   ```bash
   # Upload invalid file type (should trigger validation error)
   aws s3 cp document.pdf s3://YOUR-INPUT-BUCKET/uploads/document.pdf
   ```
   - Verify state machine execution shows failure path
   - Verify DynamoDB status = `FAILED` with error details
   - Verify SNS failure notification sent

---

## 🧪 Test-Driven Development (TDD)

This project follows **strict TDD** — every infrastructure change is test-driven:

### TDD Rules

1. **Red first** – Write a failing Jest test before any CDK code
2. **Minimal green** – Write only enough code to make the test pass
3. **Refactor** – Clean up while keeping tests green
4. **Synth gate** – `npx cdk synth` must succeed before every commit
5. **Sync docs** – Update `ARCHITECTURE.md` in the same commit as code changes

### Test Coverage

```bash
# Run all tests (145 tests)
npm test

# Run tests in watch mode (for active development)
npm test -- --watch

# Update snapshots after intentional changes
npm test -- -u

# Run specific test file
npm test -- test/cdk-base.test.ts
```

**Test Metrics:**
- **145 passing tests** across 2 test suites
- **6 snapshot tests** for regression protection
- **Issue-based organization**: Tests grouped by GitHub issue for traceability
- **100% TDD compliance**: Every feature implemented after a failing test

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full TDD workflow and development guidelines.

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[README.md](./README.md)** | You are here - quick start and overview |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Comprehensive architecture design, Mermaid diagrams, implementation status |
| **[SUMMARY.md](./SUMMARY.md)** | Project summary, key decisions, development journey, metrics |
| **[CONTRIBUTING.md](./CONTRIBUTING.md)** | TDD workflow, commit conventions, PR checklist, development setup |
| **[AGENT_GUIDELINES.md](./.github/AGENT_GUIDELINES.md)** | AI agent persona, rules, and workflow for GitHub Copilot |

---

## 🛠️ Useful Commands

| Command | Description |
|---------|-------------|
| `npm ci` | Install dependencies (use instead of `npm install`) |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and compile automatically |
| `npm test` | Run Jest unit tests (145 tests) |
| `npm test -- --watch` | Run tests in watch mode for development |
| `npm test -- -u` | Update test snapshots after changes |
| `npx cdk synth` | Emit synthesized CloudFormation template |
| `npx cdk synth -c env=dev` | Synthesize for dev environment |
| `npx cdk diff` | Compare deployed stack with current state |
| `npx cdk deploy` | Deploy stack to AWS (**only after tests + synth pass**) |
| `npx cdk deploy -c env=prod` | Deploy to production environment |
| `npx cdk destroy` | Tear down the deployed stack |

---

## 🏗️ Project Structure

```
cdk-sleep-ts-copilot/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                    # CI pipeline (build, test, synth)
│   └── AGENT_GUIDELINES.md           # AI agent guidelines
├── bin/
│   └── cdk-base.ts                   # CDK app entry point
├── lib/
│   ├── cdk-base-stack.ts             # Main infrastructure stack
│   └── pipeline-stack.ts             # CDK Pipelines skeleton
├── lambda/
│   └── sleep-audio-processor/
│       ├── index.ts                  # Lambda handler (audio processing)
│       └── package.json              # Lambda dependencies
├── test/
│   ├── cdk-base.test.ts              # Main stack tests (145 tests)
│   ├── pipeline-stack.test.ts        # Pipeline stack tests
│   └── __snapshots__/                # Jest snapshots for regression
├── ARCHITECTURE.md                   # Comprehensive architecture documentation
├── SUMMARY.md                        # Project summary and key decisions
├── README.md                         # This file
├── CONTRIBUTING.md                   # Development guidelines
├── cdk.json                          # CDK configuration
├── jest.config.js                    # Jest test configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json                      # Node.js dependencies
```

---

## 🔒 Security Features

- ✅ **S3 Encryption**: All buckets encrypted at rest (AES256)
- ✅ **S3 Public Access Blocking**: Block public ACLs, policies, and buckets
- ✅ **HTTPS Enforcement**: Bucket policies deny non-HTTPS requests
- ✅ **SNS Encryption**: KMS encryption with automatic key rotation
- ✅ **DynamoDB Encryption**: AWS-managed encryption at rest
- ✅ **Least-Privilege IAM**: Specific permissions per service (no wildcard actions)
- ✅ **X-Ray Encryption**: Traces encrypted in transit and at rest
- ✅ **Secrets Management**: No hard-coded credentials (use AWS Secrets Manager if needed)

---

## 📊 Observability

- ✅ **X-Ray Tracing**: Distributed tracing on Lambda and Step Functions
- ✅ **Structured Logging**: JSON logs with requestId correlation for CloudWatch Logs Insights
- ✅ **CloudWatch Alarms**: Alerts for state machine failures, Lambda errors, throttles
- ✅ **SNS Alarm Topic**: Centralized operational alerting
- ✅ **Step Functions Execution History**: Visual workflow debugging
- ✅ **CloudWatch Logs**: Environment-specific retention (3/7/30 days)

**Example CloudWatch Logs Insights Query:**
```sql
fields @timestamp, level, message, data.bucket, data.key
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

---

## 🌍 Multi-Environment Support

Single codebase deploys to multiple environments with different configurations:

| Environment | Removal Policy | Log Retention | Use Case |
|-------------|---------------|---------------|----------|
| **dev** | `DESTROY` | 3 days | Rapid iteration, testing, experimentation |
| **stage** | `RETAIN` | 7 days | Pre-production validation, integration testing |
| **prod** | `RETAIN` | 30 days | Production workloads, long-term retention |

**Deploy to specific environment:**
```bash
npx cdk deploy -c env=dev    # Development
npx cdk deploy -c env=stage  # Staging
npx cdk deploy -c env=prod   # Production
```

---

## 🧩 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Infrastructure** | AWS CDK (TypeScript) | Infrastructure as code |
| **Storage** | Amazon S3 | Input/output audio files |
| **Event Routing** | Amazon EventBridge | Decoupled event delivery |
| **Orchestration** | AWS Step Functions | Workflow coordination |
| **Compute** | AWS Lambda (Node.js 20.x) | Audio processing logic |
| **Text-to-Speech** | Amazon Polly | Speech synthesis (neural voice) |
| **Database** | Amazon DynamoDB | Metadata persistence |
| **Notifications** | Amazon SNS | Pub/sub messaging |
| **Encryption** | AWS KMS | Key management with rotation |
| **Monitoring** | CloudWatch, X-Ray | Logs, metrics, traces, alarms |
| **Testing** | Jest | Unit and integration tests |
| **CI/CD** | GitHub Actions | Automated testing and synthesis |

---

## 🎯 Future Enhancements (Not Implemented)

- **Amazon Bedrock Integration**: AI-enhanced audio generation
- **SQS Dead-Letter Queue**: Capture failed async invocations for replay
- **CDK Pipelines**: Automated dev → stage → prod deployment with approval gates
- **S3 Lifecycle Policies**: Auto-archive processed audio after 90 days
- **Multi-Region Deployment**: Cross-region replication for disaster recovery
- **Custom CloudWatch Dashboard**: Unified operational view of pipeline health
- **API Gateway Integration**: REST API for pipeline management
- **Lambda Layers**: Share common dependencies across functions

---

## 📝 Development Journey

This project was developed over **12 issues** following strict TDD:

1. **Issue #2**: Architecture design and documentation
2. **Issue #3**: Core S3 buckets + EventBridge rule (11 tests)
3. **Issue #4**: Step Functions skeleton (13 tests)
4. **Issue #5**: DynamoDB metadata table (14 tests)
5. **Issue #6**: SNS notifications + error handling (17 tests)
6. **Issue #7**: Lambda processor skeleton (31 tests)
7. **Issue #8**: Complete pipeline wiring + input validation (65 tests)
8. **Issue #9**: Multi-environment support + refinements (81 tests)
9. **Issue #10**: Advanced error handling + observability (101 tests)
10. **Issue #11**: Full audio processing + Polly integration (123 tests)
11. **Issue #12**: End-to-end validation + documentation polish (145 tests)

See [SUMMARY.md](./SUMMARY.md) for a detailed development journey and key decisions.

---

## 🤝 Contributing

Contributions are welcome! This project follows strict TDD and conventional commits.

**Before submitting a PR:**
1. Write failing tests first (Red)
2. Implement minimal code to pass tests (Green)
3. Refactor and clean up (Refactor)
4. Ensure `npm test` passes (145 tests)
5. Ensure `npx cdk synth` succeeds
6. Update `ARCHITECTURE.md` in the same commit
7. Use conventional commit messages

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

See [LICENSE](./LICENSE) file for details.

---

## 🔗 Links

- **GitHub Repository**: [obstreperous-ai/cdk-sleep-ts-copilot](https://github.com/obstreperous-ai/cdk-sleep-ts-copilot)
- **AWS CDK Documentation**: [https://docs.aws.amazon.com/cdk/](https://docs.aws.amazon.com/cdk/)
- **TypeScript**: [https://www.typescriptlang.org/](https://www.typescriptlang.org/)
- **Jest Testing**: [https://jestjs.io/](https://jestjs.io/)
- **Conventional Commits**: [https://www.conventionalcommits.org/](https://www.conventionalcommits.org/)

---

**Built with ❤️ by GitHub Copilot using strict Test-Driven Development**

