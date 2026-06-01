# Molly Legal and IP Starter Playbook (Solo Founder)

Date: 2026-05-18
Owner: Eric
Scope: Molly-Core

This is practical guidance, not legal advice.

## What matters right now

You are a solo founder and primary creator. That is good for IP clarity.

One critical fact in this repo:

- Top-level license file is AGPL-3.0.
- AGPL is strong copyleft and can conflict with closed commercial plans.

If you want commercial proprietary control, resolve licensing direction first.

## Simple ownership model for your case

- Human author and project owner: Eric.
- Coding agents are tools used under their platform terms.
- Keep records showing your direction, review, and acceptance of generated code.

Practical proof of ownership control:

- Keep commit history tied to your account.
- Keep architecture docs and decision logs.
- Keep session logs showing your instructions and approvals.

## Immediate decision tree

### Path 1: Stay open under AGPL

Use if you want open distribution with copyleft obligations.

Pros:

- Clear existing posture.
- Community friendly.

Cons:

- Harder to run fully closed commercial licensing later.

### Path 2: Move to proprietary or dual licensing

Use if you want strongest commercial control.

Pros:

- Cleaner enterprise licensing path.
- Better trade-secret protection.

Cons:

- Requires careful re-licensing process and dependency compliance checks.

## 14-day execution checklist

### Day 1-2: Licensing direction lock

- [ ] Decide: AGPL, proprietary, or dual-license.
- [ ] Record decision in a dated decision log.
- [ ] Freeze public claims until license direction is final.

### Day 3-5: Ownership and provenance

- [ ] Add a short COPYRIGHT and ownership statement.
- [ ] Add contributor policy note: currently solo founder only.
- [ ] Keep a folder of AI-assisted development logs and approvals.

### Day 6-8: Dependency and third-party compliance

- [ ] Generate software bill of materials (SBOM).
- [ ] Create third-party licenses inventory.
- [ ] Flag any dependency licenses incompatible with your chosen path.

### Day 9-11: Product legal posture

- [ ] Add memory retention disclosure text in product docs/ToS draft.
- [ ] Add limitation language for recall/fidelity claims.
- [ ] Add privacy and data handling baseline notes.

### Day 12-14: IP protection package

- [ ] Prepare provisional patent brief for Cradle/session reconstitution.
- [ ] Mark trade secrets list (thresholds, orchestration, internal datasets).
- [ ] Finalize internal classification labels: public, internal, confidential.

## What to protect as patent vs trade secret

### Good patent candidate

- Cradle-style stateless-session reconstitution workflow.
- Session freeze, compact, inject sequence and continuity protocol.

### Keep as trade secret

- Compression tuning constants and thresholds.
- Option C/B orchestration heuristics.
- Internal benchmark datasets and scoring weights.
- Deployment hardening playbooks.

## Minimum legal files to maintain

At repo level:

- LICENSE (final selected model)
- NOTICE (high-level attribution and legal notices)
- THIRD_PARTY_LICENSES (dependency attributions)
- COPYRIGHT statement
- SECURITY policy

Business docs (private if needed):

- IP decision log
- Patent draft notes
- Trade secret register
- Claims matrix (what marketing can and cannot claim)

## Claims guardrails (very important)

Do not claim:

- near-lossless memory unless verified by benchmark evidence.
- preserved continuity without recall metric context.

Do claim with evidence:

- measured compression ratio by dataset tier.
- measured recall and fidelity ranges.
- rollback and integrity behavior under test.

## Solo-founder note on contributors

Based on your statement, there are no human code contributors beyond you.

Still do this:

- Keep clear records of tool-assisted generation and your approvals.
- Ensure no copied third-party code is introduced without license review.
- Keep dependency/license scans current before distribution.

## Recommended default for Molly right now

If your target is commercial expansion:

1. Finalize proprietary or dual-license direction.
2. Keep Option C rollout with strict claim discipline.
3. File provisional patent for Cradle architecture.
4. Maintain trade-secret treatment for tuning/orchestration internals.

## Quick next actions this week

- [ ] Confirm license direction in writing.
- [ ] Start SBOM and third-party license inventory.
- [ ] Draft claims matrix for product pages and docs.
- [ ] Start Cradle provisional patent outline.
