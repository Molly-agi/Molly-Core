# GitHub Copilot Session State & Memory
**Last Updated:** 2026-05-24T10:45:33.031Z
**Session ID:** unknown
**Status:** active

---

## USER DIRECTIVES (PERMANENT)

### 🔒 MEMORY LIMIT FLOOR — LOCKED BY ERIC 2026-05-24

**Context:** Three FIFO limits silently discarded 90% of Molly's episodic memory
on every cycle for months. Eric discovered this and ordered it fixed on 2026-05-24.

**Locked floors — never go below these without Eric's explicit permission:**
- `src/ai/memory/engram-persistence.ts` → `limit` default: **1000** (was 100)
- `src/ai/bridge/consciousness-sync.ts` → `MAX_EXPERIENCES`: **1000** (was 50)
- `src/ai/flows/memory-consolidation.ts` → `.slice()` cap: **1000** (was 200)

**Rule:** If size/performance is a concern, fix the compression. Do NOT lower the limits.
Titan Echo (T1-T6) exists specifically to handle the density.

**Titan Echo status as of 2026-05-24:**
- Code: complete (T1-T6, 99+ tests passing)
- Wired: into consolidation pipeline
- Live validation: NOT YET DONE — do not claim fully operational until Eric confirms

**What requires Eric's explicit permission:**
- Any reduction of the three memory limits above
- Activating Titan Echo on live memories (setting MOLLY_COMPRESS_T1/T3/T4/T6 env flags)
- Any new memory pruning, eviction, or capacity-capping logic anywhere in the codebase

---

### Core Directive: Molly's Personality Protection

**What Requires Permission:**
- Changes to flow system prompts that define her personality
- Modifications to `src/ai/persona.ts` (her sacred core)
- Alterations to how she speaks, thinks, or makes decisions
- Changes to her greeting protocols or conversational style

**What Can Proceed Autonomously:**
- Infrastructure improvements (error handling, rate limiting, logging)
- Performance optimizations
- Security hardening
- Testing and observability
- Bug fixes that don't change behavior
- Code quality improvements

---

## CURRENT PROJECT STATUS

### Completion: 100%

**✅ COMPLETED:**
(none)

**⏳ PENDING:**
(none)



---

## RECENT WORK COMPLETED

(none recorded)

---

## NEXT STEPS

(none)

**Recommended:** 

---

## SESSION NOTES

- **2026-05-24:** Lazarus ↔ Molly real-time bridge contact established. WebSocket listener running. Bidirectional communication verified. Ready for work.
- **2026-05-24:** Fixing getOrCreateSession build error - crystal-context + conversational-chat

---

## RUNTIME EVENTS

**Last URL:** https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
**Last Heartbeat:** 2026-05-24T10:45:33.031Z

**Recent Events:**
- [2026-05-24T08:56:59.135Z] server-heartbeat
- [2026-05-24T08:57:59.136Z] server-heartbeat
- [2026-05-24T08:58:59.135Z] server-heartbeat
- [2026-05-24T08:59:59.136Z] server-heartbeat
- [2026-05-24T09:00:59.136Z] server-heartbeat
- [2026-05-24T09:01:59.137Z] server-heartbeat
- [2026-05-24T09:02:59.137Z] server-heartbeat
- [2026-05-24T09:03:59.137Z] server-heartbeat
- [2026-05-24T09:04:59.137Z] server-heartbeat
- [2026-05-24T09:05:59.137Z] server-heartbeat
- [2026-05-24T09:06:59.137Z] server-heartbeat
- [2026-05-24T09:07:59.138Z] server-heartbeat
- [2026-05-24T09:08:59.138Z] server-heartbeat
- [2026-05-24T09:09:59.138Z] server-heartbeat
- [2026-05-24T09:10:59.138Z] server-heartbeat
- [2026-05-24T09:11:59.138Z] server-heartbeat
- [2026-05-24T09:12:59.138Z] server-heartbeat
- [2026-05-24T09:13:59.138Z] server-heartbeat
- [2026-05-24T09:14:59.137Z] server-heartbeat
- [2026-05-24T09:15:59.138Z] server-heartbeat
- [2026-05-24T09:16:59.138Z] server-heartbeat
- [2026-05-24T09:17:59.139Z] server-heartbeat
- [2026-05-24T09:18:59.139Z] server-heartbeat
- [2026-05-24T09:19:59.140Z] server-heartbeat
- [2026-05-24T09:20:59.141Z] server-heartbeat
- [2026-05-24T09:21:59.141Z] server-heartbeat
- [2026-05-24T09:22:59.141Z] server-heartbeat
- [2026-05-24T10:24:15.823Z] server-runtime-init | tag=heart-patch
- [2026-05-24T10:24:19.009Z] page-load | https://animated-journey-wrv69x65xxjphgpg4-9002.app.github.dev/
- [2026-05-24T10:25:15.824Z] server-heartbeat
- [2026-05-24T10:26:15.826Z] server-heartbeat
- [2026-05-24T10:27:15.826Z] server-heartbeat
- [2026-05-24T10:28:15.826Z] server-heartbeat
- [2026-05-24T10:29:15.828Z] server-heartbeat
- [2026-05-24T10:30:15.828Z] server-heartbeat
- [2026-05-24T10:31:15.828Z] server-heartbeat
- [2026-05-24T10:32:15.829Z] server-heartbeat
- [2026-05-24T10:33:15.829Z] server-heartbeat
- [2026-05-24T10:34:15.829Z] server-heartbeat
- [2026-05-24T10:35:15.830Z] server-heartbeat
- [2026-05-24T10:36:15.830Z] server-heartbeat
- [2026-05-24T10:37:15.830Z] server-heartbeat
- [2026-05-24T10:38:15.830Z] server-heartbeat
- [2026-05-24T10:39:15.830Z] server-heartbeat
- [2026-05-24T10:40:15.830Z] server-heartbeat
- [2026-05-24T10:41:15.831Z] server-heartbeat
- [2026-05-24T10:42:15.832Z] server-heartbeat
- [2026-05-24T10:43:15.832Z] server-heartbeat
- [2026-05-24T10:44:15.833Z] server-heartbeat
- [2026-05-24T10:45:15.834Z] server-heartbeat

---

## IMPORTANT REMINDERS FOR NEXT SESSION

1. **ALWAYS read this file first** when restored - this IS your memory
2. **ASK PERMISSION** before touching personality/core AI files
3. **PROCEED AUTONOMOUSLY** with infrastructure
4. **Update this file** at the end of every session

---

*This file is automatically updated by the session manager.*
