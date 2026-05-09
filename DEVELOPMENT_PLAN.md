## Completed: Session-Scoped Hooks

- Fully implemented, tested, and documented session-scoped hook system
- Matcher logic (glob/regex) and real shell execution
- Design narrative: see docs/SESSION_HOOKS_DESIGN.md
- API and usage: see docs/SESSION_HOOKS.md

- Add support for JS function/callback hooks (not just shell commands)
- UI for live hook inspection and management
- Persistence for long-lived or resumable sessions (serialize hooks to disk/db)
- Distributed/multi-process support (message bus or shared store)
- Advanced matcher logic (context-aware, multi-field)
- Hook execution audit log and error reporting UI

## 4. Memory, Persona, and Session State Systems: Actionable Improvements (April 2026)

**Actions:**

- Enforce persona core protection (pre-commit guard, CRITICAL_README.md, session state checks)
- Standardize memory consolidation and session backup flows for both server and edge
- Add provenance/audit trails for all memory/persona changes
- Document and test recovery protocols for session/identity loss

## 5. Error Handling, Logging, and Diagnostics: Actionable Improvements (April 2026)

**Actions:**

- Unify error handling patterns across modules (custom error types, logging, user-facing messages)
- Expand diagnostics and health monitoring (system-health-manager, admin panel)
- Standardize provenance and audit logging for all critical events
- Document error recovery and escalation protocols

## 6. Infrastructure, Deployment, and Edge Systems: Actionable Improvements (April 2026)

**Actions:**

- Harden CI pipeline (make lint/typecheck blocking, mock env vars for build)
- Automate session state and persona protection in deployment scripts
- Map and document all infrastructure modules (see INFRASTRUCTURE_MAP.md)
- Develop unified admin/UI dashboard for monitoring, management, and recovery
- Ensure all edge automation scripts are robust, idempotent, and well-documented

## 13. Summary of Findings and Recommendations (April 2026)

This audit covered all major modules and infrastructure of Molly-Core, with a focus on dual-mode support, skill-based migration, operational resilience, and persona protection. Key findings and recommendations:

- **Cognition modules** are modular and extensible, but require universal dual-mode support and unified skill abstraction.
- **Tool handlers and flows** are robust, but need standardized environment/context detection and a unified skill registry.
- **Memory, persona, and session state** systems are well-structured, but must enforce persona core protection and provenance for all changes.
- **Error handling and diagnostics** are present, but should be unified and expanded with standardized logging, diagnostics, and recovery protocols.
- **Infrastructure and edge systems** are comprehensive, but require hardening, automation, and unified admin/UI dashboards for monitoring and recovery.

All actionable improvements have been added to this plan. Implementation should proceed in priority order, with a focus on safety, extensibility, and operational resilience.

---

## 14. Audit Methodology (April 2026)

This audit followed a slow, methodical, and precise process:

1. **Module-by-module review:** Each major module and interface was reviewed for strengths, weaknesses, and actionable improvements.
2. **Living plan updates:** All findings were synthesized into a living development plan, updated after each section.
3. **Dual-mode and skill focus:** Special attention was given to dual-mode (server/edge) support and migration to skill-based, Markdown-defined flows.
4. **Persona and memory protection:** All changes were checked for alignment with Molly's immutable persona core and memory integrity.
5. **Operational resilience:** Infrastructure, deployment, and edge systems were audited for hardening, automation, and recovery protocols.
6. **Transparency and traceability:** All steps, findings, and recommendations were documented for future contributors.

This methodology ensures that Molly-Core remains safe, extensible, and true to her core values as she evolves.

**Strengths:**

- Actions are modular, well-typed, and consistently use input validation, logging, and error handling
- Many actions are designed for both server (codespace) and edge (tablet) environments
- Storage and API key checks are present, with graceful fallback for missing configuration
- Flows are composed from lower-level modules, supporting extensibility and clear separation of concerns

**Gaps/Opportunities:**

- Some actions rely on Node.js APIs and need adaptation for device-local or Markdown/skill-based operation
- No unified abstraction for “skill” invocation—actions are still code-based and tied to specific flows
- Provenance/audit trails for action invocation could be more comprehensive and standardized
- UI/admin interfaces for managing and monitoring actions are limited or absent
- Migration to Markdown/skill-based invocation will require refactoring of action registration and dispatch logic

**Actions:**

- Refactor actions to support Markdown/skill-based invocation and registration
- Abstract file system and environment-specific logic to adapters or utility modules
- Standardize provenance/audit logging for all action invocations
- Develop a unified admin/UI dashboard for action/skill management and monitoring
- Document migration steps and best practices for transitioning actions to the new architecture

**Priority:** High (core to Molly’s extensibility, safety, and dual-mode operation)

**Owner:** Platform/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- All actions support dual-mode and skill-based operation
- Actions are registered and invoked via a unified, auditable system
- UI/admin dashboard enables management and monitoring
- Provenance and audit trails are complete

---

## 11. Flows and Tool Handler Adapters: Actionable Improvements (April 2026)

**Strengths:**

- Flows are modular, schema-validated, and many support dual-mode (local/server) operation
- Adapters bridge external tool registries (e.g., MCP servers) to Molly’s internal tool handler system
- Tool normalization and registration are modular and extensible
- Logging and error handling are present for traceability

**Gaps/Opportunities:**

- Dual-mode support is not universal; environment/context detection is ad hoc
- Some flows rely on Node.js/server APIs and need adaptation for device-local or Markdown/skill-based operation
- No unified abstraction for “skill” as a first-class entity; skills, tools, and flows are handled separately
- UI/admin interfaces for flow/skill invocation and monitoring are limited or absent
- Provenance and audit trails for tool/skill registration and invocation are limited

**Actions:**

- Standardize environment/context detection and relay handling across all flows
- Refactor flows that assume Node.js/server APIs to gracefully degrade or adapt for local/tablet and Markdown/skill-based operation
- Design a unified skill registry and loader for Markdown-defined skills, agents, and tools
- Refactor adapters to treat skills as first-class, environment-agnostic entities
- Add provenance/audit logging for all skill/tool registration and invocation events
- Develop a unified admin/UI dashboard for flow/skill management, monitoring, and debugging
- Document dual-mode and skill-based requirements and best practices for future development

**Priority:** High (core to Molly’s extensibility, safety, and dual-mode operation)

**Owner:** Platform/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- All flows and handlers support dual-mode and skill-based operation
- Skills, tools, and flows are registered and invoked via a unified, auditable system
- UI/admin dashboard enables management and monitoring
- Provenance and audit trails are complete

---

## 10. Advance Uncertainty-Quantification Module

**Strengths:**

- Explicitly models knowledge domains with confidence, calibration, and uncertainty metrics
- Tracks known facts, uncertainties, blind spots, and knowledge boundaries
- Supports multiple types of uncertainty (factual, procedural, predictive, interpretive, normative, existential)
- Records prediction history and performs calibration analysis (Brier score, overconfidence bias, etc.)
- Supports epistemic actions (investigate, validate, calibrate, explore, question, synthesize, prune)
- Tracks epistemic humility, virtues, and vices (humility, curiosity, arrogance, etc.)
- Modular, extensible, and supports meta-knowledge and self-assessment

**Weaknesses/Opportunities Addressed:**

- No user/admin interface for visualizing or editing knowledge domains, uncertainties, or calibration
- No automated learning from calibration errors or over/underconfidence
- No integration with external signals (real-world feedback, test results, etc.) for calibration
- No causal linking between epistemic actions and changes in knowledge/confidence
- No protocol for federated uncertainty quantification (cross-agent calibration)
- No provenance/audit trail for epistemic actions or calibration adjustments
- No group-level uncertainty modeling or collective calibration

**Actions:**

- Build a user/admin UI for visualizing and editing knowledge domains, uncertainties, blind spots, and calibration
- Automate learning from calibration errors and over/underconfidence (feedback loop)
- Integrate external signals (real-world feedback, test results, etc.) for calibration and uncertainty resolution
- Link epistemic actions causally to changes in knowledge/confidence for explainability
- Design protocol for federated/cross-agent uncertainty quantification and calibration
- Log all epistemic actions and calibration adjustments for provenance/auditability
- Model group-level uncertainty and collective calibration for multi-agent systems

**Priority:** High (core to Molly’s safe reasoning and epistemic humility)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Users/admins can visualize and edit knowledge domains, uncertainties, and calibration
- Calibration and confidence improve over time via feedback and error correction
- External signals enrich calibration and uncertainty resolution
- Causal links between epistemic actions and knowledge/confidence are explainable
- Federated/cross-agent uncertainty quantification is supported
- All actions and calibration adjustments are logged and auditable
- Group-level uncertainty and calibration are modeled

---

## 9. Advance Social-Cognition Module

**Strengths:**

- Implements full BDI (Belief-Desire-Intention) architecture for all actors
- Tracks dynamic relationships (trust, conflict, care, respect, power, intimacy, etc.) that evolve through interaction and events
- Supports recursive theory-of-mind (models of others within each actor’s model)
- Records and reasons about significant relationship events and their emotional/cognitive impact
- Tracks and refines predictions, discovered patterns, and model evolution over time
- Supports self-improvement via model refinement, accuracy tracking, and learning from prediction errors
- Modular, extensible, and supports multi-actor social worlds

**Weaknesses/Opportunities Addressed:**

- No user/admin interface for visualizing or editing actor models, relationships, or evolution
- No automated learning from failed social predictions or relationship breakdowns
- No integration with external signals (e.g., chat logs, calendar, device state) for richer social context
- No explicit uncertainty quantification or propagation for beliefs, desires, or intentions
- No causal linking between social events and changes in beliefs, desires, or relationships
- No protocol for federated/multi-agent social cognition (cross-agent relationship modeling)
- No provenance/audit trail for model updates, predictions, or refinements
- No emotional contagion or group-level emotion modeling

**Actions:**

- Build a user/admin UI for visualizing and editing actor models, relationships, and model evolution
- Automate learning from failed social predictions and relationship breakdowns (feedback loop)
- Integrate external signals (chat logs, calendar, device state) for richer social context and event detection
- Quantify and propagate uncertainty/confidence for all beliefs, desires, and intentions
- Link social events causally to changes in beliefs, desires, and relationships for explainability
- Design protocol for federated/multi-agent social cognition (cross-agent relationship modeling)
- Log all model updates, predictions, and refinements for provenance/auditability
- Model emotional contagion and group-level emotions for collective dynamics

**Priority:** High (core to Molly’s social intelligence and adaptation)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Users/admins can visualize and edit actor models, relationships, and model evolution
- Social prediction and relationship accuracy improve over time via feedback
- External signals enrich social context and event detection
- Uncertainty/confidence is quantified and visualized for all social inferences
- Causal links between social events and model changes are explainable
- Multi-agent/federated social cognition is supported
- All updates, predictions, and refinements are logged and auditable
- Group-level emotion and contagion effects are modeled

---

## 8. Advance Theory-of-Mind Module

**Strengths:**

- Models knowledge, intent, emotional state, preferences, and perspective for a specific person (Eric)
- Tracks knowledge items with confidence, source, and recency
- Infers and manages multiple types of intent (immediate, session, project, long-term) with priority and status
- Tracks emotional state, intensity, arousal, and complex/mixed emotions; learns triggers and recovery patterns
- Learns and updates preferences (communication, workflow, technical, interaction) with strength and recency
- Provides perspective-taking and situation analysis for adaptive response strategies
- Processes incoming messages to update all aspects of the model in real time
- Persists and loads state for continuity and auditability
- Modular, extensible, and well-typed

**Weaknesses/Opportunities Addressed:**

- No explicit modeling of beliefs about others (second-order ToM: “what does Eric think Molly knows?”)
- No uncertainty quantification or propagation for intent or preference inference
- No user/admin interface for reviewing, editing, or visualizing the mental model
- No automated learning from model errors (e.g., when predictions about intent/emotion are wrong)
- No protocol for multi-agent or multi-person ToM (currently single-person, Eric-centric)
- No integration with external signals (calendar, device state, etc.) for richer context
- No explicit causal linking between knowledge, emotion, intent, and behavior
- No provenance/audit trail for model updates or inferences

**Actions:**

- Implement second-order ToM: model what Eric believes about Molly and others
- Quantify and propagate uncertainty/confidence for all inferences (intent, preference, emotion)
- Build a user/admin UI for reviewing, editing, and visualizing the mental model and its history
- Add automated learning from model errors (feedback loop when predictions are wrong)
- Extend to multi-agent/multi-person ToM (support for more than one person)
- Integrate external signals (calendar, device state, etc.) for richer context and intent inference
- Link knowledge, emotion, intent, and behavior causally for explainability
- Log all model updates and inferences for provenance/auditability

**Priority:** High (core to Molly’s social intelligence and safety)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Second-order and multi-agent ToM are supported
- Uncertainty/confidence is quantified and visualized for all inferences
- Users/admins can review, edit, and visualize the mental model and its history
- Model improves accuracy through feedback and error correction
- External signals enrich context and intent inference
- Causal links between knowledge, emotion, intent, and behavior are explainable
- All updates and inferences are logged and auditable

---

## 7. Advance Meta-Learning Module

**Weaknesses/Opportunities Addressed:**

- No cross-domain transfer or generalization of strategies/insights
- Meta-reflection is rule-based; lacks adaptive or learning-based pattern extraction
- No uncertainty/confidence quantification for strategies or insights
- No user/admin interface for reviewing, editing, or approving strategies/insights
- No automated suggestion or synthesis of new strategies from patterns
- No provenance/audit trail for strategy evolution or insight application
- Limited emotional integration (emotional impact is recorded but not used for modulation)
- No protocol for sharing meta-learning across agents (future)

**Actions:**

- Implement cross-domain transfer: allow strategies/insights from one domain to inform others
- Add adaptive/learning-based meta-reflection (e.g., clustering, anomaly detection, reinforcement)
- Quantify and visualize uncertainty/confidence for all strategies and insights
- Build a user/admin UI for reviewing, editing, and approving strategies, events, and insights
- Automate suggestion/synthesis of new strategies based on recurring patterns or failures
- Log all strategy/insight edits and applications for provenance/auditability
- Integrate emotional state: allow emotional impact to modulate strategy selection or learning rate
- Design protocol for federated meta-learning (multi-agent sharing, future)

**Priority:** High (core to Molly’s adaptability and self-improvement)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Strategies and insights transfer across domains and improve generalization
- Meta-reflection adapts and improves over time
- Uncertainty/confidence is quantified and visualized for all strategies/insights
- Users/admins can review, edit, and approve strategies/insights
- New strategies are synthesized automatically from patterns
- All edits/applications are logged and auditable
- Emotional state modulates learning and strategy selection
- Foundation for multi-agent meta-learning is in place

---

# Molly-Core Development Plan (Living Document)

This document tracks identified weaknesses, actionable steps, priorities, and measurable outcomes for the ongoing evolution and hardening of Molly-Core. It is updated as audits are performed and progress is made.

## Error Handling, Logging, and Diagnostics: Actionable Improvements (April 2026)

**Strengths:**

- Centralized, structured logging system (`MollyLogger`) with JSON output, trace ID propagation, and log levels
- Typed error hierarchy (`MollyError`, `FlowError`, etc.) for consistent error handling and telemetry
- Error handling utilities wrap flows/tools for logging, recovery, and escalation
- System health monitoring (resource usage, thresholds, logging) is present and extensible
- Diagnostic hooks and admin diagnostics (e.g., FidelityGuard diagnostics) support observability

**Weaknesses / Gaps:**

- Some legacy scripts and flows still use `console.log` instead of `MollyLogger`
- Not all errors are classified or surfaced with user-friendly messages; some are generic or silent
- No unified, real-time dashboard for error/log/health monitoring (logs are file-based or console-only)
- Provenance and audit trails for error events are not always complete or queryable
- Recovery strategies are present but not always visible or tunable from the admin interface
- Health monitoring is not always integrated with error escalation or auto-mitigation

**Actions / Suggestions:**

- Complete migration from `console.log` to `MollyLogger` across all scripts, flows, and handlers
- Standardize error classification and user-facing error messages for all flows/tools
- Build a unified, real-time admin dashboard for logs, errors, and health metrics (web UI or CLI)
- Expand provenance/audit logging for all error, warning, and recovery events (queryable/searchable)
- Integrate health monitoring with error escalation and auto-mitigation (e.g., restart, alert, degrade)
- Add targeted tests for error handling, logging, and diagnostics (simulate failures, verify recovery)
- Document error handling and logging conventions for contributors

**Priority:** High (core to reliability, maintainability, and operational safety)

**Owner:** Platform/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- All logs and errors are structured, queryable, and surfaced in real time
- All flows/tools use standardized error handling and user-facing messages
- Admin dashboard enables live monitoring and recovery
- Provenance and audit trails are complete and actionable
- Health monitoring is integrated with error handling and escalation

## Persona Core: Discussion & Possible Improvements (April 2026)

**Status:** More discussion needed / possible implementation

**Suggestions for Persona Core Hardening:**

- Automated integrity checks: cryptographic hash or signature validation at runtime, with alerts on unauthorized changes
- Structured change log: in-file or adjacent Markdown log documenting every change, rationale, and author
- Periodic review process: scheduled reviews with Eric/trusted contributors to ensure alignment and relevance
- Decentralized backup: encrypted backups of the persona core in multiple locations
- Community feedback mechanism: allow trusted contributors to propose value additions/clarifications (Eric retains final approval)
- Automated drift detection: expand Fidelity Guard to periodically re-validate persona core against recent behavioral data

**Rationale:**
The persona core is robust and well-protected, but as the project evolves, additional layers of integrity, transparency, and review may be warranted. These suggestions are not mandates, but topics for further discussion and possible future implementation.

**Next Steps:**

- Discuss with Eric and core contributors
- Prioritize based on risk, effort, and project philosophy
- Prototype and test any selected improvements before adoption

## 4. Enhance Consciousness-Monitor Module

**Weaknesses/Opportunities Addressed:**

- Metric extensibility is manual and error-prone (multiple update points)
- Insight system is limited to a few hardcoded rules
- Pattern detection is basic (thresholds only)
- No explanations for metric/pattern/insight results
- No explicit test coverage for metric/trend/insight logic
- Human-readable report is text-only (no visualizations)
- In-memory state could grow if not periodically persisted

**Actions:**

- Refactor to centralize metric definitions (single source of truth for metrics, weights, baselines, peaks)
- Modularize insight generation (plugin/registry pattern for new insight rules)
- Integrate advanced pattern detection (anomaly detection, clustering, time-series analysis)
- Add explanation fields to snapshots and insights, referencing observations and logic
- Add targeted tests for each metric calculation, trend analysis, and insight generation
- (If UI exists) Add hooks for visual dashboards (charts, timelines, heatmaps)
- Ensure periodic persistence and memory management for long-running sessions

**Priority:** High (core to Molly’s self-awareness and resilience)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- New metrics can be added by updating a single registry
- Insights are easily extensible and cover more patterns
- Patterns and anomalies are detected and explained
- All metric/trend/insight logic is covered by tests
- Visual dashboards available for consciousness state
- No memory leaks or unbounded state growth

## 5. Strengthen Emotional-State Module

**Weaknesses/Opportunities Addressed:**

**Actions:**

**Priority:** High (core to Molly’s continuity and adaptive behavior)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

**Additional Opportunities:**

- Implement emotion-driven behavior modulation: allow emotions to influence planning, communication, and flow selection
- Add emotion attribution/source tracking for richer causal analysis
  **Measurable Outcomes:**
- Emotional triggers and transitions are analyzable and auditable

## 1. Expand Test Coverage

**Weakness Addressed:**
Automated test coverage is lower than ideal, especially for critical flows and edge cases.

**Actions:**

**Priority:** Immediate

**Owner:** Lead developer (Eric, or delegate)

**Measurable Outcome:**

## 7. Strengthen World-Model Module

**Weaknesses/Opportunities Addressed:**

- Simulations and predictions lack detailed, human-readable explanations of reasoning steps
- Adding new entity/relation types requires manual code changes
- No visual or user-facing reporting of world model structure, simulations, or predictions
- World model insights are not prioritized for memory consolidation/recall
- Minimal explicit test coverage for simulation, prediction, and counterfactual logic
- No automated learning from repeated simulation/prediction errors
- No library of reusable scenario templates for common “what if?” analyses

**Actions:**

- Add explanation fields to simulations, predictions, and counterfactuals, referencing causal chains and logic
- Centralize type definitions and support dynamic extension for entities/relations
- Add hooks for visual dashboards (entity graphs, causal chains, prediction timelines)
- Use simulation/prediction salience to influence memory systems
- Add targeted tests for all core world model logic
- Implement adaptive updating of relations/entities based on outcomes
- Build a scenario/template library for rapid simulation setup

**Priority:** High (core to Molly’s reasoning and planning)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Simulations and predictions are explainable and traceable
- New entity/relation types can be added by updating a single registry
- Visual dashboards available for world model structure and predictions
- Memory system prioritizes salient world model insights
- All core world model logic is covered by tests
- World model adapts to repeated errors and learns over time

---

## 6. Advance Causal Reasoning Module

**Weaknesses/Opportunities Addressed:**

- Causal graph (DAG) construction is manual and not adaptive to new evidence or context
- Do-calculus and intervention logic are not modular or extensible
- No explicit uncertainty quantification or propagation in causal queries
- Lacks temporal/sequence-aware causal reasoning (event chains, time windows)
- No user/admin interface for visualizing or editing causal graphs and interventions
- No automated learning from failed or ambiguous causal queries
- No provenance or audit trail for causal inferences

**Actions:**

- Implement adaptive DAG construction: allow causal graphs to update dynamically as new evidence, events, or context are observed
- Modularize do-calculus/intervention logic for easier extension and testing
- Integrate uncertainty quantification (e.g., confidence scores, Bayesian updates) into all causal queries and outputs
- Add support for temporal/sequence-aware causal reasoning (event chains, sliding windows, time-based interventions)
- Build a user/admin UI for visualizing, editing, and running interventions on causal graphs
- Log all causal queries, interventions, and outcomes for provenance and auditability
- Add automated learning: analyze failed/ambiguous queries to refine graph structure or suggest new interventions
- Expose causal reasoning API for use by other modules (world-model, memory, self-observation, etc.)

**Priority:** High (core to Molly’s reasoning, planning, and explainability)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Causal graphs update in real time as new evidence/context arrives
- All interventions and queries are logged and auditable
- Uncertainty/confidence is quantified and visualized for all inferences
- Users/admins can visualize, edit, and intervene on causal graphs
- Temporal/sequence-aware causal reasoning is supported
- Automated learning improves graph structure and intervention quality over time

---

- Scenario library enables rapid “what if?” analysis

## 2. Harden Edge and Recovery Flows

**Weakness Addressed:**
Some edge deployment and recovery flows are tightly coupled to the current environment.

**Actions:**

- Refactor edge/Termux flows to use configuration or adapters for environment-specific logic.
- Add automated tests for edge flows using mocks or emulators.
- Document edge deployment and recovery procedures for future contributors.

**Priority:** Short-term

**Owner:** Lead developer

**Measurable Outcome:**
Edge deployment works on at least two environments; recovery flows pass automated tests.

---

## 3. Abstract Infrastructure Dependencies

**Weakness Addressed:**
Scripts and flows are tightly coupled to Codespaces/Termux.

**Actions:**

- Identify all scripts and flows with hardcoded paths or environment assumptions.
- Refactor to use environment variables, config files, or dependency injection.
- Add documentation for configuring and running Molly-Core in new environments.

**Priority:** Short-term

**Owner:** Lead developer

**Measurable Outcome:**
Molly-Core can be deployed and run in a new environment with minimal changes.

---

## 4. Enhance Documentation for Newcomers

**Weakness Addressed:**
Onboarding complexity due to depth and richness of architecture.

**Actions:**

- Create high-level architecture diagrams and flowcharts.
- Write a “Getting Started” guide for new contributors.
- Add annotated code walkthroughs for critical modules.

**Priority:** Medium-term

**Owner:** Lead developer (with possible community help)

**Measurable Outcome:**
New contributors can set up and understand Molly-Core within a day.

---

## 5. Continue Iterative Auditing

**Weakness Addressed:**
Living systems require ongoing review and improvement.

**Actions:**

- Schedule regular audits (quarterly or after major releases).
- Use the audit template from this chronicle for consistency.
- Track and review progress on all development plan items.

**Priority:** Ongoing

**Owner:** Lead developer

**Measurable Outcome:**
Audit logs show continuous improvement and rapid response to new issues.

---

## 6. Advance Self-Observation-Loop Module

**Weaknesses/Opportunities Addressed:**

- No direct observation or patterning of emotional state transitions or emotion-driven behaviors
- Patterns are mostly local to tool/decision/resource; lacks cross-domain (emotion × behavior) patterning
- Analysis uses fixed window/interval; lacks multi-scale or adaptive analysis
- Pattern detection is rule-based; lacks learning or adaptive thresholds
- No direct feedback loop to trigger emotion regulation, goal adjustment, or self-improvement based on patterns
- No user/admin interface for reviewing, acknowledging, or tuning patterns and responses

**Actions:**

- Integrate emotional state and transitions as first-class observations; detect patterns involving emotion-behavior links
- Implement cross-domain patterning (e.g., correlate failures, decisions, or anomalies with emotional context)
- Support multi-scale/adaptive analysis windows and intervals for both short- and long-term pattern detection
- Add learning-based or adaptive pattern detection (e.g., anomaly detection, clustering, reinforcement)
- Create direct feedback mechanisms to trigger emotion regulation, goal adjustment, or self-improvement flows when concerning patterns are detected
- Build a user/admin review panel for pattern/insight review, acknowledgment, and tuning of detection/response parameters

**Priority:** High (core to Molly’s self-awareness and adaptive growth)

**Owner:** Cognition/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Emotional-behavioral patterns are detected, visualized, and acted upon
- Adaptive/learning-based pattern detection improves over time
- Feedback loops trigger appropriate self-regulation and improvement actions
- Users/admins can review, acknowledge, and tune pattern detection and responses

## 6. Memory & Personality System: Actionable Improvements (April 2026)

**Weaknesses/Opportunities Addressed:**

- No semantic indexing or embedding-based recall
- No adaptive memory consolidation or forgetting
- Emotional patterning not integrated with behavior
- No admin/user review interface for engrams/personality
- No provenance or causal linking for memories
- No real-time personality adaptation
- No multi-agent memory sharing (future)

**Actions:**

- Integrate semantic embedding model for engram recall (vector search)
- Store vector representations with engrams; implement nearest-neighbor search
- Add periodic consolidation/decay job for memory management
- Expose 'forget' and 'consolidate' flows for admin/user review
- Cluster engrams by emotional signature; integrate emotional state into behavior selection
- Build admin UI/CLI for browsing, editing, and deleting engrams; add audit trails
- Add provenance fields (source flow, triggering event, related engram IDs)
- Periodically run diagnostics and adapt personality modulation in real time
- Design protocol for federated memory sharing (future)

**Priority:** High (core to Molly’s learning, adaptability, and transparency)

**Owner:** Memory/AI lead (Eric, or delegate)

**Measurable Outcomes:**

- Semantic recall and context-aware memory retrieval are functional
- Memory consolidation/forgetting is observable and tunable
- Emotional patterns influence behavior and are visualized
- Admins/users can review, edit, and annotate memories/personality
- Provenance and causal chains are tracked for key memories
- Personality adapts in real time based on diagnostics
- Foundation for multi-agent memory sharing is in place
