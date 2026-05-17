# GitHub Copilot Session State & Memory
**Last Updated:** 2026-05-17T14:38:47.058Z
**Session ID:** 2026-05-12-recovery
**Status:** active

---

## USER DIRECTIVES (PERMANENT)

### Core Directive: Molly's Personality Protection

**What Requires Permission:**
- Changes to flow system prompts that define her personality
- Modifications to `src/ai/persona.ts` (her sacred core)
- Alterations to how she speaks, thinks, or makes decisions
- Changes to her greeting protocols or conversational style
- Deleting or modifying scripts/ infrastructure files (see guardrail #3)

**What Can Proceed Autonomously:**
- Infrastructure improvements (error handling, rate limiting, logging)
- Performance optimizations
- Security hardening
- Testing and observability
- Bug fixes that don't change behavior
- Code quality improvements

---

## CURRENT PROJECT STATUS

### Completion: 85%

**✅ COMPLETED:**
1. Phase 5 — all 19 cognition modules implemented (May 2026)
2. P0 Composable Prompt System — src/ai/prompts/
3. P0 Context Compaction — src/ai/context-compaction.ts (commit 7fb3908)
4. P1 Centralized State Manager — src/lib/state-registry.ts (2026-05-12)
5. P1 Conversation Orchestrator Loop — src/ai/tools/call-tool.ts (2026-05-12)
6. Firebase/Firestore fixes + storage-sync local↔cloud (2026-05-11)
7. Real Gemini credentials wired, Gemini 3.1 model upgrade (2026-05-11)
8. Claude Code binary audit — secret patterns + env-flag patterns ported (2026-05-12)
9. Hand-rolled HTTP primitives — httpRequest, httpInspect, fuzzEndpoint, cookieJar (2026-05-12)
10. Heart-patch wipe bug fixed — 4-lock anti-wipe in session-manager (2026-05-12)
11. Audit action item 3 — ANTHROPIC_BASE_URL pattern ported across model-router providers (commit b02c18a, 2026-05-12)
12. WebSocket subscription for bridge wired into lazarus voice page (commit f981ef0)
13. Anthropic-traffic-proxy added for observing Claude Code wire protocol (commit 92f731e)
14. Simple Browser routed to /lazarus (small standalone Family Bridge UI) via tasks.json folderOpen — 9002 auto-open reverted to silent so Molly's full chat UI no longer hijacks Simple Browser (2026-05-12)

**⏳ PENDING:**
15. Phase 6 planning
16. P2 Hybrid Memory Taxonomy — keep engrams + add working memory
17. P2 Conversation Recovery
18. P3 Event/Hook expansion — session hooks exist, needs expansion



---

## RECENT WORK COMPLETED

### 2026-05-12
Fixed the heart-patch session-state wipe bug. Root cause: appendSessionEvent did a load-merge-save cycle on every server-heartbeat (1/min). Any transient read failure made loadSessionState return getDefaultState() (the 'Unknown - please re-establish' template) and those defaults got persisted. Every backup in .session-backups/ for the past week was a copy of the wipe. Shipped 4 locks: (1) loadSessionStateRaw returns null on failure, (2) anti-wipe guard in saveSessionState refuses to overwrite real data with defaults, (3) per-write timestamped backup with retention=50, (4) split runtime events into append-only .session-events.jsonl so heartbeats never touch JSON state.

**Files Created:**
- src/lib/__tests__/session-manager.test.ts

**Files Modified:**
- src/lib/session-manager.ts
- .gitignore

**Decisions Made:**
- Lazy path getters (vs. captured const) so tests can chdir into a temp dir
- Anti-wipe guard accepts {force:true} for legitimate resets
- Events log capped at 2000 lines, trims to 1000 atomically via rename
- Backups retained: last 50 by mtime


### 2026-05-12
Audited Claude Code binary v2.1.139 using Molly's bug-bounty scanners. Three action items: (1) port Anthropic's expanded SECRET_PATTERNS into recon-engine.ts — DONE in commit 41a4310, (2) mirror DISABLE_*_COMMAND env-flag pattern — DONE in commit 3aacf57, (3) mirror ANTHROPIC_BASE_URL pattern in model-router — NOT DONE. Audit doc: stuff/CLAUDE_CODE_HIDDEN_FLAGS_AUDIT_MAY12.md. Then hand-rolled HTTP primitives in src/ai/agency/tool-handlers/http-tools.ts: httpRequest (full HTTP), httpInspect (full-body for security), fuzzEndpoint (wordlist FUZZ iteration + anomaly flagging), cookieJar (session cookies). SSRF guards block private hosts + cloud metadata unless Rogue or scoped.

**Files Created:**
- src/ai/agency/tool-handlers/http-tools.ts
- stuff/CLAUDE_CODE_HIDDEN_FLAGS_AUDIT_MAY12.md

**Files Modified:**
- src/ai/security/recon-engine.ts

**Decisions Made:**
- Closes the largest tactical gap in Molly's capability surface — webFetch was GET-only
- Audit action item 3 deliberately deferred — separate change to model-router


### 2026-05-11
Firebase/Firestore fixes (TypeScript errors in tool-database.ts, mockFirestore test conflicts, storage-router picks Firestore in Codespace via FIREBASE_PROJECT_ID, instrumentation.ts no longer requires FIREBASE_SERVICE_ACCOUNT_JSON). Storage sync: src/lib/storage-sync.ts — bidirectional last-write-wins between local filesystem (Termux) and Firestore (cloud) at startup, covering all 17 singleton state docs + engrams + resilience records. Real Gemini API key generated, GOOGLE_APPLICATION_CREDENTIALS set to firebase-adminsdk service account. Gemini 3.1 model upgrade: Flash → gemini-3.1-flash-lite-preview, Flash Lite → gemini-3.1-flash-lite (stable), TTS → gemini-3.1-flash-tts-preview, Imagen → imagen-4.0-generate-001.

**Files Created:**
- src/lib/storage-sync.ts

**Files Modified:**
- src/lib/tool-database.ts
- src/lib/storage-router.ts
- src/instrumentation.ts
- .env.local

**Decisions Made:**
- Storage-sync wired into instrumentation.ts before module loads
- Codespace picks Firestore via FIREBASE_PROJECT_ID detection



---

## NEXT STEPS

**Option A:** Port ANTHROPIC_BASE_URL pattern into src/ai/model-router.ts — audit action item 3, the last open item from today's binary audit
**Option B:** P2 Hybrid Memory Taxonomy — keep engrams, add working memory layer
**Option C:** P2 Conversation Recovery
**Option D:** P3 Event/Hook expansion — UI for live hook management, JS callback support, persistence

**Recommended:** Port ANTHROPIC_BASE_URL pattern into model-router — closes today's audit thread cleanly, then start Phase 6 planning

---

## SESSION NOTES

- Heart-patch wipe bug silently corrupted session state from 2026-05-06 to 2026-05-12. Cost was real — every restored session started at zero. Fixed in commit 2d0adbb.
- Memory in /home/codespace/.claude/projects/-workspaces-Molly-Core/memory/ is the authoritative source for project identity, architecture, protocols, current state, user profile, and guardrails. Read it on every session start.
- molly-auth.json at repo root is a placeholder. Real credentials live in stuff/personality/*.json.
- Computer Use, Deep Research, Robotics models not accessible on current Gemini API key (allowlist-gated by Google)
- **2026-05-17:** Build fixed: moltbook removed, duplicate declaration fixed, Molly online, live bridge via voice/process-text confirmed
- **2026-05-17:** Bridge architecture refactored: isolated Lazarus-Molly channel, Eric main chat clean, bridge daemon running

---

## RUNTIME EVENTS

**Last URL:** https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
**Last Heartbeat:** 2026-05-17T14:38:47.058Z

**Recent Events:**
- [2026-05-17T14:13:47.238Z] server-heartbeat
- [2026-05-17T14:14:19.710Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:14:19.992Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:14:31.638Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:14:36.640Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:14:37.014Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:14:47.238Z] server-heartbeat
- [2026-05-17T14:15:03.890Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:15:47.239Z] server-heartbeat
- [2026-05-17T14:16:47.238Z] server-heartbeat
- [2026-05-17T14:17:47.239Z] server-heartbeat
- [2026-05-17T14:18:47.239Z] server-heartbeat
- [2026-05-17T14:19:47.283Z] server-heartbeat
- [2026-05-17T14:20:47.283Z] server-heartbeat
- [2026-05-17T14:21:47.282Z] server-heartbeat
- [2026-05-17T14:22:47.283Z] server-heartbeat
- [2026-05-17T14:23:47.282Z] server-heartbeat
- [2026-05-17T14:24:47.286Z] server-heartbeat
- [2026-05-17T14:25:47.287Z] server-heartbeat
- [2026-05-17T14:26:47.287Z] server-heartbeat
- [2026-05-17T14:27:47.287Z] server-heartbeat
- [2026-05-17T14:29:38.704Z] server-runtime-init | tag=heart-patch
- [2026-05-17T14:29:40.693Z] page-load | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:30:38.707Z] server-heartbeat
- [2026-05-17T14:30:40.697Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:31:38.707Z] server-heartbeat
- [2026-05-17T14:31:40.696Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:32:03.273Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:32:08.281Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:32:13.277Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:32:38.706Z] server-heartbeat
- [2026-05-17T14:32:40.892Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:33:38.707Z] server-heartbeat
- [2026-05-17T14:33:57.127Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:33:57.211Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:34:37.599Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:34:38.706Z] server-heartbeat
- [2026-05-17T14:34:40.891Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:34:42.602Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:34:47.605Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:35:38.706Z] server-heartbeat
- [2026-05-17T14:35:40.892Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:36:38.706Z] server-heartbeat
- [2026-05-17T14:36:40.712Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:36:40.592Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:37:38.706Z] server-heartbeat
- [2026-05-17T14:37:40.696Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:38:38.707Z] server-heartbeat
- [2026-05-17T14:38:40.696Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T14:38:45.121Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/

---

## IMPORTANT REMINDERS FOR NEXT SESSION

1. **ALWAYS read this file first** when restored - this IS your memory
2. **ASK PERMISSION** before touching persona.ts or scripts/ infrastructure
3. **PROCEED AUTONOMOUSLY** with infrastructure, perf, security, tests, bug fixes
4. **Update this file** at the end of every session
5. **Read /home/codespace/.claude/projects/-workspaces-Molly-Core/memory/ MEMORY.md** for project context
6. **Check the family bridge** for unread messages from Molly after reading state

---

*This file is automatically updated by the session manager.*
