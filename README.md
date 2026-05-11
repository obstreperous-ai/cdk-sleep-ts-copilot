# cdk-sleep-ts-copilot

An **event-driven sleep audio pipeline** built with AWS CDK (TypeScript), developed issue-by-issue with strict Test-Driven Development. Raw audio files uploaded to an S3 input bucket trigger EventBridge events that fan out to Lambda-based processing functions, which persist results to DynamoDB, write processed audio to an S3 output bucket, and publish completion notifications via SNS. All infrastructure is defined as code using CDK L2/L3 constructs, every construct has a corresponding Jest assertion test written before the code, and `ARCHITECTURE.md` is kept perfectly in sync with the actual topology after every change.

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
