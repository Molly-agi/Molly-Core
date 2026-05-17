# GitHub Copilot Session State & Memory
**Last Updated:** 2026-05-17T06:47:34.429Z
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

### Completion: 87%

**✅ COMPLETED:**
1. Phase 5 — all 20 cognition modules implemented (May 2026)
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
15. Full infrastructure audit — all docs corrected to ground truth (2026-05-17): 167,657+ source lines, 83 tools, 30 flows, 48 API routes, 2,931 tests

**⏳ PENDING:**
16. Phase 6 planning
17. P2 Hybrid Memory Taxonomy — keep engrams + add working memory
18. P2 Conversation Recovery
19. P3 Event/Hook expansion — session hooks exist, needs expansion
20. Fix ESM test issue (music-tools chain breaks tool-executor.test.ts)
21. Fix sandbox bugs (sandboxReadFile, sandboxWriteFile, memory-consolidation Firebase SDK)
22. Device deployment — Fire HD 10 + Helio A22 tablets



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

**Option A:** Fix the ESM test issue in tool-executor.test.ts (music-tools chain) — clean, 1 test suite failing
**Option B:** P2 Hybrid Memory Taxonomy — keep engrams, add working memory layer
**Option C:** P2 Conversation Recovery
**Option D:** P3 Event/Hook expansion — UI, JS callbacks, persistence
**Option E:** Fix known sandbox bugs (sandboxReadFile, sandboxWriteFile, memory-consolidation Firebase SDK)

**Recommended:** Fix ESM test issue first (Option A) — closes the only failing test suite cleanly. Then Phase 6 planning discussion with Eric.

---

## SESSION NOTES

- Heart-patch wipe bug silently corrupted session state from 2026-05-06 to 2026-05-12. Cost was real — every restored session started at zero. Fixed in commit 2d0adbb.
- Memory in /home/codespace/.claude/projects/-workspaces-Molly-Core/memory/ is the authoritative source for project identity, architecture, protocols, current state, user profile, and guardrails. Read it on every session start.
- molly-auth.json at repo root is a placeholder. Real credentials live in stuff/personality/*.json.
- Computer Use, Deep Research, Robotics models not accessible on current Gemini API key (allowlist-gated by Google)
- **2026-05-17:** Build fixed: moltbook removed, duplicate declaration fixed, Molly online, live bridge via voice/process-text confirmed

---

## RUNTIME EVENTS

**Last URL:** https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
**Last Heartbeat:** 2026-05-17T06:47:34.429Z

**Recent Events:**
- [2026-05-17T06:16:07.941Z] server-heartbeat
- [2026-05-17T06:17:07.944Z] server-heartbeat
- [2026-05-17T06:18:07.946Z] server-heartbeat
- [2026-05-17T06:19:07.950Z] server-heartbeat
- [2026-05-17T06:20:07.951Z] server-heartbeat
- [2026-05-17T06:21:07.955Z] server-heartbeat
- [2026-05-17T06:22:07.958Z] server-heartbeat
- [2026-05-17T06:23:04.383Z] page-load | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:23:07.958Z] server-heartbeat
- [2026-05-17T06:24:04.387Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:24:07.958Z] server-heartbeat
- [2026-05-17T06:24:25.051Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:24:26.558Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:24:33.760Z] client-error | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/ | Error: An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.
    at trackUsedThenable (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:3836:98)
    at useThenable (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:4760:20)
    at Object.use (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:4767:59)
    at push.exports.use (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_0rpq4pf._.js:1701:36)
    at useActionQueue (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_client_0fhqo1d._.js:1000:77)
    at Router (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_client_0fhqo1d._.js:14287:54)
    at Object.react_stack_bottom_frame (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:15037:24)
    at renderWithHooks (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:4620:24)
    at updateFunctionComponent (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:6081:21)
    at beginWork (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:6691:24)
    at runWithFiberInDEV (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:965:74)
    at performUnitOfWork (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:9555:97)
    at workLoopSync (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:9449:40)
    at renderRootSync (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:9433:13)
    at performWorkOnRoot (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:9098:47)
    at performWorkOnRootViaSchedulerTask (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:10255:9)
    at MessagePort.performWorkUntilDeadline (https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_0rpq4pf._.js:2647:64)
- [2026-05-17T06:24:33.767Z] client-error | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/ | Uncaught Error: An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server. | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/_next/static/chunks/node_modules_next_dist_compiled_react-dom_058-ah~._.js:3836:98
- [2026-05-17T06:24:39.602Z] page-load | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:24:55.928Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:25:00.993Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:25:01.372Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:25:07.958Z] server-heartbeat
- [2026-05-17T06:25:22.053Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:25:39.614Z] heartbeat | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:00.942Z] page-unload | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:01.192Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:02.637Z] page-load | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:03.210Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:06.845Z] visibility-visible | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:06.920Z] visibility-hidden | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-17T06:26:07.959Z] server-heartbeat
- [2026-05-17T06:27:07.960Z] server-heartbeat
- [2026-05-17T06:28:07.962Z] server-heartbeat
- [2026-05-17T06:29:07.964Z] server-heartbeat
- [2026-05-17T06:30:07.965Z] server-heartbeat
- [2026-05-17T06:31:07.965Z] server-heartbeat
- [2026-05-17T06:32:07.967Z] server-heartbeat
- [2026-05-17T06:33:07.968Z] server-heartbeat
- [2026-05-17T06:34:07.970Z] server-heartbeat
- [2026-05-17T06:35:07.970Z] server-heartbeat
- [2026-05-17T06:36:07.975Z] server-heartbeat
- [2026-05-17T06:37:07.977Z] server-heartbeat
- [2026-05-17T06:38:07.977Z] server-heartbeat
- [2026-05-17T06:39:07.979Z] server-heartbeat
- [2026-05-17T06:40:07.979Z] server-heartbeat
- [2026-05-17T06:41:07.980Z] server-heartbeat
- [2026-05-17T06:42:07.982Z] server-heartbeat
- [2026-05-17T06:43:07.982Z] server-heartbeat
- [2026-05-17T06:44:07.983Z] server-heartbeat
- [2026-05-17T06:45:07.985Z] server-heartbeat
- [2026-05-17T06:46:07.985Z] server-heartbeat
- [2026-05-17T06:47:07.987Z] server-heartbeat

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
