# Memory Compression Options Development Plan

Date: 2026-05-18
Owner: Molly-Core
Status: Draft for execution

## Purpose

Define execution paths for three memory compression options and make decision points explicit.

## Priority Legend

- P1: build first, highest confidence and highest leverage.
- P2: build second, medium complexity or medium risk.
- P3: build last, useful but not release-critical for Option C.

## Option Definitions

### Option A: Honest Launch with Current Architecture

Summary:

- Keep current compression behavior.
- Improve transparency, metrics, and user messaging.
- Prioritize speed to market and trust.

Target outcomes:

- Compression: current high ratio retained.
- Memory recall reporting: explicit and accurate.
- User trust: improved via visible retention and pruning logs.

Best-fit industries:

- Gaming companions
- Entertainment AI
- Creator assistants

### Option B: Full Semantic Compression Program

Summary:

- Build deep semantic compression stack.
- Optimize for high recall with strong compression.
- Expand to higher-trust and regulated use cases.

Target outcomes:

- Compression: 70-85 percent depending on stage.
- Recall: 95 percent or higher.
- Strong auditability and explainability.

Best-fit industries after validation:

- Enterprise knowledge copilots
- Financial workflow copilots
- Legal operations assistants
- Healthcare-adjacent support systems

### Option C: Phased Foundation First, Then Evaluate

Summary:

- Build six low-risk/high-confidence techniques first.
- Ship and evaluate using production metrics.
- Decide whether to continue into Option B scope.

Target outcomes:

- Compression: 75-80 percent expected.
- Recall: 95 percent target.
- Faster delivery with lower execution risk.

Best-fit industries initially:

- Gaming and companion AI first
- Then selective expansion based on KPI gates

## Shared Success Criteria

- Compression ratio measured per dataset tier and live traffic.
- Recall measured against known retained memory sets.
- Semantic fidelity measured by retrieval quality and benchmark prompts.
- Behavioral continuity measured across multi-session replay tests.
- Failure and rollback metrics recorded in every release.

## Release Structure

### Phase 0: Baseline and Instrumentation (2 weeks)

Deliverables:

- Stable benchmark harness and reproducible test datasets.
- Current-state dashboard for ratio, recall, fidelity, latency.
- Retention audit logs and pruning reason codes.

Exit criteria:

- Baseline report generated and reviewed.
- KPI dashboard visible to product and engineering.

### Option A Plan (4 weeks total)

Workstreams:

- Messaging alignment and UI transparency.
- Retention visibility and pruning audit UX.
- Configurable policy knobs for memory limits.

Exit criteria:

- Documentation and product text accurately match system behavior.
- Users can see what was retained and why.
- Launch-ready for low-liability markets.

### Option C Plan (12-14 weeks total)

Scope for first release:

1. Personality reference compression
2. Time-decay selective fidelity
3. Temporal delta encoding
4. Dictionary or vocabulary compression
5. Numeric quantization
6. Interaction trace compression

Option C techniques with expected gain and risk:

- Personality reference compression: expected gain 8-10 percent; risk low.
- Time-decay selective fidelity: expected gain 12-20 percent; risk medium.
- Temporal delta encoding: expected gain 3-5 percent; risk low.
- Dictionary or vocabulary compression: expected gain 5-8 percent; risk low.
- Numeric quantization: expected gain 1-2 percent; risk low.
- Interaction trace compression: expected gain 3-6 percent; risk medium.

Option C priority and run order:

1. P1 - Personality reference compression.
2. P1 - Temporal delta encoding.
3. P1 - Dictionary or vocabulary compression.
4. P2 - Time-decay selective fidelity.
5. P2 - Interaction trace compression.
6. P3 - Numeric quantization.

Option C dependency notes:

- Time-decay selective fidelity depends on stable reconstruction paths from temporal deltas.
- Interaction trace compression depends on canonical event schemas from the first three techniques.
- Numeric quantization should be applied after baseline recall and fidelity tests are passing.
- Every technique must ship behind a feature flag for isolated ablation and rollback.

Option C do-not-break guardrails:

- Do not ship any technique if recall drops below 95 percent in long-horizon tests.
- Do not ship if rollback success is below agreed threshold.
- Do not ship if median restore latency regresses beyond agreed SLO.
- Do not change product language unless KPI evidence is attached.

Milestones:

- M1 (week 4): first three techniques integrated and benchmarked.
- M2 (week 8): all six techniques integrated in staging.
- M3 (week 12-14): production pilot and KPI review.

Decision gate after Option C:

- If recall >= 95 percent and compression >= 78 percent with stable latency:
  - Scale Option C and expand industry targets carefully.
- If recall goals are met but compression is below target:
  - Start Option B expansion modules.
- If recall goals are missed:
  - stabilize and remediate before expansion.

### Option B Plan (16-28 weeks total, additive)

Core expansion modules:

- Semantic deduplication and clustering.
- Prototype plus residual encoding.
- Sparse semantic representation.
- Advanced policy modules (goal compression, consensus encoding, user-model compression).

Milestones:

- B1: semantic dedupe in production-like load tests.
- B2: prototype-residual path validated.
- B3: full semantic pipeline with ablation report and long-horizon replay tests.

Exit criteria:

- Recall >= 95 percent sustained across long-horizon runs.
- Compression in expected range for target industry profile.
- Auditability and rollback policies verified.

## Industry Rollout Strategy

### Wave 1: Option A or C early launch

- Primary: Gaming and companion AI.
- Reason: lower compliance burden and faster feedback loops.

### Wave 2: Option C maturity

- Add creator and consumer productivity assistants.
- Require stable user trust and memory transparency metrics.

### Wave 3: Option B maturity

- Enter enterprise and regulated-adjacent workflows.
- Require strong explainability, recall guarantees, and audit controls.

## Risk Management

- Scope creep from additive compression modules.
- Metric drift if definitions change between releases.
- Performance regression from reconstruction complexity.
- Trust risk if product language exceeds measured behavior.

Mitigations:

- Fixed KPI contract per release.
- Mandatory ablation before each major release.
- Canary rollouts with rollback gates.
- Product copy review as release blocker.

## Recommended Execution Path

1. Execute Option C first.
2. Launch in gaming and companion segment.
3. Evaluate live KPI data at decision gate.
4. Expand to Option B modules only when KPI and market need justify it.
5. Keep Option A transparency standards in all phases regardless of path.
