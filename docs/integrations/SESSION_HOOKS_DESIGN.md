# Session-Scoped Hook System — Design Narrative

## Why Session-Scoped Hooks?

- **Isolation:** Hooks are tied to a session, preventing cross-session leakage and ensuring clean teardown.
- **Extensibility:** Any event string can be used, and matchers allow fine-grained targeting.
- **Agent/Skill Flexibility:** Skills and agents can register hooks dynamically, enabling adaptive behaviors.
- **Auditability:** All registration, execution, and removal is observable and can be logged or queried.

## Key Design Decisions

- **In-Memory Registry:** Fast, simple, and safe for single-process use. (Persistence is a future option.)
- **Matcher Logic:** Supports both glob (minimatch) and regex, so hooks can target specific files, events, or patterns.
- **Command Execution:** Hooks can run shell commands, making them powerful for automation and integration.
- **One-Shot Hooks:** Hooks can auto-remove after firing, supporting ephemeral behaviors.
- **Source Tracking:** Every hook is tagged with its registering skill/agent for traceability.

## Tradeoffs

- **No Persistence:** Simpler, but hooks are lost on restart. (Planned for future.)
- **No Distributed Support:** Only works in a single process. (Future: message bus or shared store.)
- **Shell-Only Execution:** For now, only shell commands are supported. (Future: JS function/callback support.)

## Extensibility

- **Function Hooks:** Add a `type` field to HookCommand and support JS callbacks.
- **Persistence:** Serialize `sessionHooks` to disk or a database.
- **UI/Inspection:** Use `listSessionHooks()` for live inspection and management.
- **Advanced Matching:** Add context-aware or multi-field matchers as needed.

## Auditability

- **All actions are logged.**
- **API is documented in docs/SESSION_HOOKS.md.**
- **Future enhancements are tracked in DEVELOPMENT_PLAN.md.**

---

This design is robust, extensible, and ready for real-world agent/skill workflows. It is easy to audit, safe to extend, and leaves a clear trail for future contributors.
