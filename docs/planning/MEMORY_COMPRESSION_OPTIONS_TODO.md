# Memory Compression Options To-Do

Date: 2026-05-18
Owner: Molly-Core

## How to use this list

- Mark each item complete only when evidence is attached.
- Keep KPI data linked to each milestone.
- Do not advance to next gate without exit criteria.

## Priority Legend

- P1: must complete for Option C production pilot.
- P2: complete after P1, before final Option C decision gate.
- P3: optimize after P1 and P2 are stable.

## Option C Implementation Order

1. P1 - Technique 1: Personality reference compression
2. P1 - Technique 3: Temporal delta encoding
3. P1 - Technique 4: Dictionary or vocabulary compression
4. P2 - Technique 2: Time-decay selective fidelity
5. P2 - Technique 6: Interaction trace compression
6. P3 - Technique 5: Numeric quantization

## Global Tasks for All Options

### Baseline and Measurement

- [ ] Freeze benchmark datasets (small, medium, large, long-horizon).
- [ ] Finalize metric definitions for ratio, recall, fidelity, continuity, latency.
- [ ] Add automated ablation runs per build.
- [ ] Add regression alerts for recall and latency.
- [ ] Publish weekly KPI report in docs.

### Reliability and Safety

- [ ] Add rollback checkpoint before each compression run.
- [ ] Add retention and pruning audit log with reason codes.
- [ ] Add restore-integrity checks after compression cycles.
- [ ] Add incident playbook for memory-loss regressions.

### Product and Trust

- [ ] Align UI and documentation language with measured behavior.
- [ ] Expose retained versus pruned memory counts to users.
- [ ] Add policy explanation panel for memory decisions.

## Option A To-Do (Fast Honest Launch)

### Engineering

- [ ] Implement memory transparency dashboard.
- [ ] Add configurable retention limits by deployment profile.
- [ ] Add exportable pruning report for support and QA.

### Product

- [ ] Update product copy to honest retention language.
- [ ] Add release notes section for memory behavior.
- [ ] Add FAQ entry: why some memories are pruned.

### Launch Gate

- [ ] Verify all transparency features in staging.
- [ ] Verify no claim exceeds measured behavior.
- [ ] Final sign-off for low-liability market launch.

## Option C To-Do (Foundation First)

### P1 - Technique 1: Personality reference compression

- [ ] Define schema and pointer format.
- [ ] Implement serializer and deserializer.
- [ ] Add recall and latency tests.

### P2 - Technique 2: Time-decay selective fidelity

- [ ] Define age tiers and fidelity policy.
- [ ] Implement tier migration process.
- [ ] Validate reconstruction correctness.

### P1 - Technique 3: Temporal delta encoding

- [ ] Implement base snapshot plus delta chain.
- [ ] Add chain compaction and periodic rebasing.
- [ ] Add corruption detection for delta replay.

### P1 - Technique 4: Dictionary or vocabulary compression

- [ ] Build domain vocabulary from memory corpus.
- [ ] Implement token replacement with versioned dictionary.
- [ ] Add fallback path for unknown tokens.

### P3 - Technique 5: Numeric quantization

- [ ] Identify quantizable fields and precision limits.
- [ ] Implement quantize and dequantize steps.
- [ ] Validate no material recall degradation.

### P2 - Technique 6: Interaction trace compression

- [ ] Define event trace schema.
- [ ] Implement state reconstruction from traces.
- [ ] Benchmark trace replay latency.

### Option C Guardrail Checks (required each week)

- [ ] Feature flags exist for each Option C technique.
- [ ] Ablation report generated with one-technique-off runs.
- [ ] Recall remains >= 95 percent after each integration.
- [ ] Restore latency remains within agreed SLO after each integration.
- [ ] Rollback test executed successfully for latest technique.

### Option C Gate

- [ ] Compression >= 78 percent in pilot traffic.
- [ ] Recall >= 95 percent in long-horizon test.
- [ ] Latency within agreed SLO.
- [ ] Error rate and rollback success within threshold.
- [ ] Decision memo: stop at C or proceed to B.

## Option B To-Do (Additive Expansion)

### Core Semantic Modules

- [ ] Implement semantic deduplication pipeline.
- [ ] Implement clustering quality checks.
- [ ] Implement prototype plus residual encoding.
- [ ] Implement sparse semantic representation.

### Advanced Modules

- [ ] Implement goal or intention compression.
- [ ] Implement consensus or voting encoding.
- [ ] Implement user-model plus exception compression.
- [ ] Implement cross-session pattern synthesis.

### Validation and Governance

- [ ] Run full ablation matrix with each B module toggled.
- [ ] Run multi-cycle restore tests for drift detection.
- [ ] Validate explainability artifacts for enterprise review.
- [ ] Validate compliance-facing audit outputs.

### Option B Gate

- [ ] Recall >= 95 percent sustained.
- [ ] Compression target met for selected industry profile.
- [ ] Explainability and audit controls approved.
- [ ] Industry expansion approval issued.

## Industry Target Checklist by Option

### With Option A only

- [ ] Gaming and companion AI launch package ready.
- [ ] Creator assistant pilot package ready.

### With Option C complete

- [ ] Broaden to consumer productivity assistant pilots.
- [ ] Validate SLA language and support playbooks.

### With Option B complete

- [ ] Enterprise pilot package ready.
- [ ] Financial and legal workflow pilot controls ready.
- [ ] Healthcare-adjacent non-diagnostic pilot controls ready.

## Weekly Operating Cadence

- [ ] Monday: KPI review and blocker triage.
- [ ] Wednesday: integration and performance checkpoint.
- [ ] Friday: decision log update and rollout readiness check.
