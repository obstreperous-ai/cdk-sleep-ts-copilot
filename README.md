# cdk-sleep-ts-copilot

An **event-driven sleep audio pipeline** being built with AWS CDK (TypeScript), developed issue-by-issue with strict Test-Driven Development. The target architecture is for raw audio files uploaded to an S3 input bucket to trigger EventBridge events that fan out to Lambda-based processing functions, which will persist results to DynamoDB, write processed audio to an S3 output bucket, and publish completion notifications via SNS. Infrastructure is being added incrementally in code using CDK constructs, with corresponding Jest assertion tests written alongside each change; until the full pipeline exists, treat [ARCHITECTURE.md](./ARCHITECTURE.md) as the intended design and check the current CDK stack and tests for implementation status.

## TDD Rules

1. **Red first** – write a failing Jest test before any CDK code.
2. **Minimal green** – write only enough code to pass the test.
3. **Refactor** – clean up while keeping tests green.
4. **Synth gate** – `npx cdk synth` must succeed before every commit.
5. **Sync docs** – update `ARCHITECTURE.md` (prose + Mermaid diagram) in the same commit as the code change.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution guide and [ARCHITECTURE.md](./ARCHITECTURE.md) for the pipeline design.

## Useful commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript to JS |
| `npm run watch` | Watch for changes and compile |
| `npm test` | Run Jest unit tests |
| `npx cdk synth` | Emit the synthesised CloudFormation template |
| `npx cdk diff` | Compare deployed stack with current state |
| `npx cdk deploy` | Deploy this stack (**only after tests + synth pass**) |
