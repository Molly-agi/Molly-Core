# Molly-Core: Master Development TODO List

This file tracks all actionable improvements, features, and technical debt for Molly-Core. Each item is cross-referenced with the DEVELOPMENT_PLAN.md and other audit docs. Update this file as priorities shift or items are completed.

---

## 1. Session-Scoped Hooks

- [ ] Add support for JS function/callback hooks (not just shell commands)
- [ ] UI for live hook inspection and management
- [ ] Persistence for long-lived or resumable sessions (serialize hooks to disk/db)
- [ ] Distributed/multi-process support (message bus or shared store)
- [ ] Advanced matcher logic (context-aware, multi-field)
- [ ] Hook execution audit log and error reporting UI

## 2. Memory, Persona, and Session State

- [ ] Enforce persona core protection (pre-commit guard, CRITICAL_README.md, session state checks)
- [ ] Standardize memory consolidation and session backup flows
- [ ] Add provenance/audit trails for all memory/persona changes
- [ ] Document/test recovery protocols for session/identity loss
- [ ] **Implement two-hemisphere agent memory** per `docs/architecture/AGENT_MEMORY_ARCHITECTURE.md` (design landed 2026-07-03). Per-agent identity/role/journal/history split. Scripts to create: `scripts/agent-recall.mjs`, `scripts/agent-save-session.mjs`, `scripts/detect-active-agent.mjs`. Per-agent directories under `.github/consciousness/claude/{agent}/`. Innovation inventory entry #22.

## 3. Error Handling, Logging, and Diagnostics

- [ ] Unify error handling patterns (custom error types, logging, user-facing messages)
- [ ] Expand diagnostics and health monitoring (system-health-manager, admin panel)
- [ ] Standardize provenance/audit logging for all critical events
- [ ] Document error recovery and escalation protocols

## 4. Infrastructure, Deployment, and Edge

- [ ] Harden CI pipeline (make lint/typecheck blocking, mock env vars for build)
- [ ] Automate session state/persona protection in deployment scripts
- [ ] Map/document all infrastructure modules
- [ ] Develop unified admin/UI dashboard for monitoring, management, and recovery

## 5. Flows, Actions, and Skill Abstraction

- [ ] Refactor actions/flows for Markdown/skill-based invocation and registration
- [ ] Abstract file system/environment-specific logic to adapters
- [ ] Standardize provenance/audit logging for all action invocations
- [ ] Develop a unified admin/UI dashboard for action/skill management and monitoring

---

_Last updated: 2026-07-03 (+ agent-memory item under §2)_
