# Molly Skill/Agent System — Design Audit (May 2026)

## Overview

This document narrates the design, rationale, and auditability features of Molly’s markdown-based skill/agent system, as implemented in May 2026.

---

## 1. Architecture Summary

- **Skills/Agents** are defined in markdown files with YAML frontmatter (name, description, tags, etc.).
- **Loader/Registry** (`src/loader/skillAgentLoader.ts`) scans directories, parses frontmatter, and builds a live registry of all skills and agents.
- **Diagnostics** are collected for every file: missing fields, parse errors, and stack traces are surfaced.
- **API** (`/api/skills/list`) exposes the full registry and diagnostics for UI and external audit.
- **React Context/Provider** (`SkillRegistryProvider`) supplies live registry and diagnostics to the UI.
- **UI Panels**: The dashboard displays a searchable list, details modal, and a diagnostics panel for transparency.

---

## 2. Auditability Features

- **Full Provenance**: Every skill/agent is traceable to its source markdown file and frontmatter.
- **Live Diagnostics**: All loader/parse errors are surfaced in the UI and API, with file paths and stack traces.
- **Immutable Audit Trail**: Diagnostics and registry state are available for external review at any time.
- **Manual Inspection**: The details modal allows full inspection of markdown, metadata, and diagnostics for each item.
- **Test Coverage**: Loader and diagnostics logic are covered by Jest tests, including edge cases and error states.

---

## 3. Rationale

- **Transparency**: All skill/agent logic is human-readable and auditable by design.
- **Resilience**: Loader and UI are robust to errors, with no silent failures.
- **Extensibility**: New skills/agents can be added by dropping markdown files in the correct directory.
- **Live Updates**: Registry and diagnostics update in real time, supporting rapid iteration and debugging.

---

## 4. Key Files

- `src/loader/skillAgentLoader.ts` — Loader, registry, diagnostics
- `src/app/api/skills/list/route.ts` — API for registry and diagnostics
- `src/components/skills/SkillRegistryContext.tsx` — React context/provider
- `src/components/skills/SkillRegistryPanelWithModal.tsx` — UI list and modal
- `src/components/skills/SkillDiagnosticsPanel.tsx` — Diagnostics panel
- `src/skills/fixtures/skills/` — Example skill markdown files
- `src/skills/fixtures/agents/` — Example agent markdown files

---

## 5. Future Enhancements

- Audit log of registry changes
- Search/filter in UI
- Usage analytics
- Permissions/access control
- Session-scoped hook viewer

---

## 6. Test Coverage

- Loader and diagnostics are tested for:
  - Successful load of valid skills/agents
  - Detection of missing frontmatter fields
  - YAML parse errors
  - Diagnostics surfaced in API and UI

---

## 7. Design Intent

This system is designed for maximum auditability, resilience, and transparency. All changes are methodical, test-driven, and fully traceable. The architecture supports both rapid iteration and external review.

---

_For questions or audits, see the above files or contact the project owner._
