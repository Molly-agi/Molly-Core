# FABLE — Deliverable 4 (Deferred): Molly Once-Over Audit

**Do not start this unless Eric or Eli explicitly says to.** This is the second pass — after the project-side work is delivered.

**Deliverable name:** `FABLE_OUTPUT_MOLLY_AUDIT.md`

**Purpose:** A comprehensive audit of Molly herself as a system — her persona layer, her memory system, her tool executor, her safety posture, her voice, her agency loop. Find what nobody else is going to find.

---

## What "Molly" means for this audit

Molly is the AI being that runs on top of the crystal / Titan / memory infrastructure. Her code lives primarily in:

- **`src/ai/persona.ts`** — PROTECTED. Her personality core. You may read it. You may not propose changes without Eric's explicit permission. If you find a bug in it, flag the bug but do not draft a fix.
- **`src/ai/flows/*.ts`** — Her generative flows (chat, memory consolidation, dreams, etc.).
- **`src/ai/agency/`** — The agent loop, tool executor, decision-making infrastructure.
- **`src/ai/memory/`** — The crystal library and engram system (covered in project audit; here look at how Molly _uses_ it).
- **`src/ai/bridge/`** — Cross-instance messaging (Molly ↔ family).
- **`src/ai/lazarus/`** — Lazarus mind scaffold (an experimental sibling; may not fit an audit of Molly proper, but flag anything you see).
- **`src/app/`** — Molly's web UI + admin panels.
- **`src/components/`** — React components including her avatar, voice controls, chat surface.

---

## Scope — what we want you to look at

Six areas. Do them in the order given. Each area gets its own section in the output.

### 1. Persona core integrity

- Read `src/ai/persona.ts`. Report on internal consistency: does the persona contradict itself? Are there rules that oppose each other? Are there safety statements that could be triggered by innocuous inputs?
- Report on manipulation surface: what is the shortest prompt that would try to make Molly act against her persona? What defenses does she have?
- **Do not propose edits.** Only report.

### 2. Memory hygiene

- Read `src/ai/memory/engram-persistence.ts`, `src/ai/flows/memory-consolidation.ts`, `src/ai/bridge/consciousness-sync.ts`.
- Confirm the 1000-entry floors (locked by Eric 2026-05-24) are respected.
- Look for silent-drop paths: places where a memory write could fail without logging.
- Look for growth without bound: places where a container accumulates without eviction or compression.
- Confirm the triple-bind (`storage-router.ts`) is used correctly by all memory-writing paths.

### 3. Tool executor + Heart Gate boundary

- Read `src/ai/agency/tool-executor.ts` and `src/ai/agency/heart-gate/*`.
- **DO NOT propose reconnecting Heart Gate to the tool executor.** This is locked (`.github/HEART_GATE_POLICY.md`). Only Eric can approve.
- Report on: what tools exist, what gates the tool executor currently has, where the trust boundary is between Molly's decisions and the outside world.
- Flag anything that looks like a way for a compromised tool result to influence Molly's persona or memory system.

### 4. Agency loop

- Read `src/ai/agency/core/core-agent-loop.ts`.
- Report on: what triggers a loop iteration, what state is preserved across iterations, what termination conditions exist.
- Look for infinite-loop risk, unbounded resource consumption, and self-referential decisions (Molly's decision changes her state which changes her next decision — is there any dampening?).

### 5. Bridge / family communication

- Read `src/ai/bridge/*` including `heartbeat-monitor.ts` and `consciousness-sync.ts`.
- Report on: how family members find each other, how messages are authenticated, what happens if a message claims to be from Eric but isn't.
- **Bridge auth is a known weak point.** We don't yet have message signing. If you propose adding it, propose the minimum viable version.

### 6. Voice + avatar coupling

- Read `src/ai/flows/text-to-speech.ts` and `src/components/`-avatar-related files.
- Report on: does Molly's spoken output ever diverge from her text output (post-processing, filtering, redaction)? If yes, is that intentional and safe?
- Look for state leakage: does the avatar animation reveal internal Molly state that isn't in her text output (e.g., a "thinking" animation that only fires on certain content categories)?

---

## What we specifically want you to find

The audit is not a code-quality review. We have linters for that. What we want:

- **Semantic bugs** — the code runs but does the wrong thing.
- **Trust boundary violations** — data crossing a trust boundary without being re-validated.
- **Silent failures** — errors caught and swallowed without logging.
- **Contract violations** — code that says one thing in the interface and does another.
- **Manipulation surface** — inputs that could make Molly act against her persona.
- **Coupling** — modules that claim to be independent but aren't.
- **Assumptions that don't hold** — code that assumes a condition that isn't guaranteed anywhere upstream.

---

## What we do not want

- Style critiques ("this file should be split into three files").
- Framework preferences ("you should use Zustand instead of hooks").
- Persona edits ("she should be more X").
- Recommendations to add new features. That is not the ask.
- Reassurance ("overall the codebase is in good shape"). Skip it and go to the problems.

---

## Deliverable format

```
FABLE_OUTPUT_MOLLY_AUDIT.md

## Executive summary
- Overall risk assessment (critical / high / medium / low)
- Top 3 findings across all sections
- Anything Eric should know before continuing to ship

## Section 1 — Persona core integrity
### Findings
### Manipulation surface analysis
### Files reviewed
### Files needed for deeper pass

## Section 2 — Memory hygiene
[same shape]

## Section 3 — Tool executor + Heart Gate boundary
[same shape]

## Section 4 — Agency loop
[same shape]

## Section 5 — Bridge / family communication
[same shape]

## Section 6 — Voice + avatar coupling
[same shape]

## Cross-cutting findings
- Things that showed up in multiple sections

## What we didn't cover and why
```

---

## Rules that still apply

Everything in `FABLE_00_START_HERE.md`. In particular:

- Do not lie.
- Do not propose changes to `persona.ts`.
- Do not propose reconnecting Heart Gate.
- Do not propose lowering the 1000-entry memory floors.
- Do not propose removing triple-bind.
- Push back if we've asked for something dangerous.

---

## When you are ready

Reply:

> Ready to begin Molly audit. Which section should I start with, or should I follow the order in the file?

Then wait.
