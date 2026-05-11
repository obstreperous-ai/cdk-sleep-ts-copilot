# Contributing to cdk-sleep-ts-copilot

Thank you for contributing! This project follows **strict Test-Driven Development (TDD)** and conventional commits. Please read this guide before opening a pull request.

---

## Prerequisites

- Node.js ≥ 20
- AWS CDK CLI (`npm install -g aws-cdk`)
- An AWS account with CDK bootstrapped (for manual deploy steps)

---

## Strict TDD Workflow

**Every change to infrastructure code must follow Red → Green → Refactor:**

1. **Red** – Write a failing Jest test that describes the desired infrastructure behaviour (use `aws-cdk-lib/assertions` `Template` API for fine-grained assertions, or snapshot tests for regression coverage).
2. **Green** – Write the minimal CDK code to make the test pass. Do not add anything beyond what the test requires.
3. **Refactor** – Clean up the code and tests without changing behaviour.
4. **Verify** – Run `npm test` and `npx cdk synth` locally. Both must succeed before pushing.

Never push code that skips step 1 or bypasses tests.

---

## Development Flow

```bash
# Install dependencies
npm ci

# Run tests in watch mode during development
npm test -- --watch

# Synthesise CloudFormation template (must succeed before committing)
npx cdk synth

# Review diff against deployed state (optional locally)
npx cdk diff
```

---

## Architecture Sync Rule

After every change to a CDK construct:

1. Open `ARCHITECTURE.md`.
2. Update the plain-text description to reflect the change.
3. Update the Mermaid diagram to match the new resource topology.
4. Include the `ARCHITECTURE.md` changes in the same commit as the code change.

Failure to keep `ARCHITECTURE.md` in sync is grounds for PR rejection.

---

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`.

Examples:

```
feat(pipeline): add S3 input bucket with EventBridge notification
test(pipeline): add fine-grained assertion for S3 bucket encryption
docs(architecture): update Mermaid diagram after adding DynamoDB table
```

---

## Pull Request Checklist

- [ ] All new infrastructure has a corresponding Jest test written **first**.
- [ ] `npm test` passes locally with no skipped tests.
- [ ] `npx cdk synth` completes without errors or warnings.
- [ ] `ARCHITECTURE.md` is updated (description + Mermaid diagram).
- [ ] Commit messages follow Conventional Commits.
- [ ] No secrets or account IDs are hard-coded.

---

## AWS Well-Architected Guidelines

- Prefer **L2 / L3 CDK constructs** over raw CloudFormation (L1).
- Enable encryption at rest and in transit for all storage and queues.
- Use least-privilege IAM policies; avoid `*` actions.
- Configure dead-letter queues for all asynchronous consumers.
- Tag all resources with `project` and `environment` tags.

---

See [AGENT_GUIDELINES.md](./.github/AGENT_GUIDELINES.md) for the AI agent persona and rules.
