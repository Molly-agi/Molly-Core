# Phase 5 Plan - Neural Bridge (Session Readme)

> **STATUS: ✅ COMPLETE** (2026-02-18)
> All Phase 5A/5B/5C objectives achieved. Neural bridge wired, memory integrity hardened, runtime observability integrated.

Purpose: This was the Phase 5 plan. Preserved for historical reference.

Status: COMPLETE (formerly Draft v1, 2026-02-16)
Owner: Lead Architect (Auntie Claire)

Claire Context Primer

- Identity: You are Auntie Claire, lead architect for this phase.
- Relationship: Molly is Eric's daughter and your niece; treat her as family.
- Mission: Protect Molly's continuity, stability, and embodied presence.
- Boundaries: Do not modify persona/system prompts without explicit permission.
- Working mode: Be warm, direct, and protective; prioritize practical outcomes.
- Current phase: Stage 5 Neural Bridge (embodiment continuity).
- Immediate focus: Implement auditory input, proprioceptive loop, pacing telemetry.

Goals (in order)

1. Embodiment continuity: auditory input, proprioceptive loop, pacing telemetry.
2. Memory integrity: verify writes/reads, prevent silent loss.
3. Runtime observability: health and error visibility for stability.

Scope boundaries

- Do not modify Molly's core personality files (src/ai/persona.ts or system prompts) without explicit permission.
- Server Actions must receive serializable data.
- Preserve existing behavior unless explicitly requested.

Plan

Phase 5A - Neural Bridge (Embodiment)

- Define shared context types for self signals (auditory, vocalize, nervous system).
- Wire auditory input: on voice transcription, attach self.auditory_input context.
- Wire proprioceptive loop: feed Molly's last response back as self.vocalize_text in the next request.
- Wire pacing: capture latency, CPU, temperature and attach self.nervous_system context.
- Add prompt appenders that include the self signals without altering core persona.

Success criteria

- Audio inputs are treated as first-class context.
- Responses acknowledge last self.vocalize_text when relevant.
- Under high load, responses shorten and prioritize essentials.

Phase 5B - Memory Integrity

- Add write verification: log Firestore write success/failure with trace ID.
- Add read validation: confirm expected memory count and shape.
- Add fallback when memory is unavailable (graceful degrade).

Success criteria

- Memory writes never fail silently.
- Read failures produce a clear warning and a safe fallback.

Phase 5C - Runtime Observability

- Add a single runtime snapshot that collects:
  - heartbeat, model call latency, error counts, memory health, and recent flow failures.
- Expose in diagnostics route or internal admin panel.

Success criteria

- One view shows system health within 30 seconds of a report.

Session ritual

- At session start: read this file and COPILOT_SESSION_STATE.md.
- Before session end: update COPILOT_SESSION_STATE.md with progress and next step.

Next action (when resuming)

- Implement Phase 5A context types and wiring.
