# Agent Skill System Design (Molly-Core)

## Purpose

A robust, extensible, and auditable markdown-based agent skill system for Molly, compatible with Lazarus conventions and project philosophy.

---

## 1. Directory Structure

- `skills/` — Each skill in its own folder, with a `SKILL.md` file.
- `agents/` — Each agent in its own folder, with a `AGENT.md` file.
- (Optional) `hooks/` — Shared or global hooks in `hooks.json`.

## 2. Markdown Schema (YAML Frontmatter)

### Skill Example

```
---
name: summarize-text
description: Summarize any text using Claude
disabled: false
allowed-tools: [file-read, file-write]
argument-hint: Text to summarize
when_to_use: When a summary is needed
version: 1.0
model: sonnet
user-invocable: true
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - command: echo "Skill about to run"
          once: true
context: inline
agent: null
effort: medium
paths: null
---
Skill body in markdown...
```

### Agent Example

```
---
name: research-agent
description: Researches a topic using multiple tools
tools: [web-search, summarize-text]
disallowedTools: [file-delete]
skills: [summarize-text]
hooks:
  SessionStart:
    - matcher: "*"
      hooks:
        - command: echo "Agent session started"
color: blue
model: opus
effort: high
maxTurns: 10
mcpServers: []
---
Agent instructions in markdown...
```

---

## 3. Loader/Registry

- Recursively scan `skills/` and `agents/` for `.md` files.
- Parse YAML frontmatter, validate required fields.
- Build in-memory registry: categorized by type, supports lookup and listing.
- Only load frontmatter and summary into context; full content on invocation.
- Watch directories for changes; update registry atomically.

---

## 4. Hooks

- Register hooks from frontmatter (or hooks.json) as session/agent-scoped.
- On event, execute all hooks for that event in order.
- Remove hooks with `once: true` after execution.
- Unregister hooks on session/agent end.
- Log all registration, execution, and removal for auditability.

---

## 5. Extensibility & Auditability

- Ignore unknown fields gracefully.
- Support for new fields, categories, or file types.
- All actions logged for traceability.

---

## 6. Philosophy

- Slow, methodical, precise.
- No shortcuts, no leaks, no Frankensteining.
- The dam is solid.

---

_This document is the foundation. All code will follow this design, with narration and documentation at every step._
