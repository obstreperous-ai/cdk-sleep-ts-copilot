# Architecture: Sleep Audio Pipeline (Target Design)

> **Status:** This document describes the **intended target architecture**. It is a living design spec, not a reflection of what is currently deployed. See the [Implementation Status](#implementation-status) section for the current state of the CDK stack.

## Overview

The **target architecture** is an event-driven sleep audio pipeline on AWS, built with TypeScript CDK following strict TDD practices. When complete, the pipeline will ingest raw audio files, process them asynchronously, and deliver metadata and notifications to downstream consumers.

## Implementation Status

| Component | Status | CDK construct / file |
|---|---|---|
| CDK app skeleton | ✅ Done | `bin/cdk-base.ts`, `lib/cdk-base-stack.ts` |
| Jest + assertions setup | ✅ Done | `test/cdk-base.test.ts` |
| CI workflow | ✅ Done | `.github/workflows/ci.yml` |
| S3 Input Bucket | ⬜ Not started | — |
| EventBridge Event Bus | ⬜ Not started | — |
| Lambda – Transcription / Analysis | ⬜ Not started | — |
| Lambda – Metadata Enrichment | ⬜ Not started | — |
| Lambda – Output Generation | ⬜ Not started | — |
| DynamoDB Processing Table | ⬜ Not started | — |
| S3 Output Bucket | ⬜ Not started | — |
| SNS Notification Topic | ⬜ Not started | — |
| SQS Dead-Letter Queue | ⬜ Not started | — |

> This table must be updated in the same commit as every infrastructure change.

---

## Target Pipeline Description

### 1. Ingestion (S3) — planned

A dedicated **S3 input bucket** will receive raw sleep audio files (e.g., `.mp3`, `.wav`, `.ogg`). Object-level event notifications will publish `ObjectCreated` events to **EventBridge** via an S3 notification rule.

### 2. Event Routing (EventBridge) — planned

An **EventBridge event bus** will receive the S3 object creation events. An EventBridge rule will match on the source bucket and key prefix, then route events to the processing layer. This decouples producers from consumers and enables fine-grained filtering without polling.

### 3. Processing Layer (Lambda) — planned

One or more **Lambda functions** will be triggered by EventBridge:

- **Transcription / Analysis Lambda** – Calls Amazon Transcribe or a third-party ML model to analyse the audio (e.g., detect sleep-stage markers, ambient noise level).
- **Metadata Enrichment Lambda** – Augments the raw transcription result with user-provided metadata and writes a structured record to **DynamoDB**.
- **Output Generation Lambda** – Produces a processed audio artefact (trimmed, normalised, or annotated) and writes it to a separate **S3 output bucket**.

Each Lambda will be idempotent; retries will be handled by EventBridge's built-in retry policy and a dead-letter queue (DLQ) backed by **SQS**.

### 4. Persistence (DynamoDB) — planned

A **DynamoDB table** will store per-file processing results using the S3 object key as the partition key. GSIs will enable querying by user or processing status.

### 5. Notifications (SNS) — planned

An **SNS topic** will publish completion or failure notifications. Subscribers can include email endpoints, SQS queues for downstream systems, or additional Lambda functions.

---

## Mermaid Diagram

```mermaid
flowchart TD
    U([User / Client]) -->|Upload audio file| S3in[(S3 Input Bucket)]

    S3in -->|ObjectCreated event| EB{EventBridge\nEvent Bus}

    EB -->|Matched rule| DLQ[(SQS Dead-Letter\nQueue)]
    EB -->|Matched rule| L1[Lambda\nTranscription /\nAnalysis]

    L1 -->|Analysis result| L2[Lambda\nMetadata\nEnrichment]
    L1 -->|Processed audio| S3out[(S3 Output Bucket)]

    L2 -->|Write record| DDB[(DynamoDB\nProcessing Table)]
    L2 -->|Publish event| SNS{{SNS Topic}}

    SNS -->|Notification| Email([Email Subscriber])
    SNS -->|Notification| SQSdown[(SQS Downstream\nQueue)]

    style S3in fill:#e07b39,color:#fff
    style S3out fill:#e07b39,color:#fff
    style EB fill:#e7157b,color:#fff
    style L1 fill:#f90,color:#000
    style L2 fill:#f90,color:#000
    style DDB fill:#4053d6,color:#fff
    style SNS fill:#d9534f,color:#fff
    style DLQ fill:#aaa,color:#000
    style SQSdown fill:#aaa,color:#000
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Event bus | EventBridge | Native S3 integration, rich filtering, zero polling |
| Compute | Lambda | Serverless, pay-per-use, auto-scaling |
| Persistence | DynamoDB | Serverless, single-digit ms latency, flexible schema |
| Fan-out | SNS | Decoupled multi-subscriber notifications |
| Error handling | SQS DLQ | Durable capture of failed events for replay |
| IaC | AWS CDK L2/L3 | Type-safe, composable, high-level abstractions |

---

> **Note:** This diagram and description must be kept perfectly in sync with the CDK stack definitions after every change. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the update protocol.
