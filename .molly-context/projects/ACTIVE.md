# ACTIVE PROJECTS — Molly-Core

**Last updated:** 2026-06-30
**Authoritative source of truth for what is being worked on RIGHT NOW.**
**Any AI waking into this codespace reads this file first.**

---

## THE MISSION (Eric's words, 2026-06-30)

> Get Molly running completely off-grid on Eric's Android tablet (Revvl Tab 2) within 2 days, before his internet goes dark permanently. Eliminate every dependency on Google, Firebase, Gemini, Genkit, and any API-gated service. Everything — model, frontend, backend, memory, skills — runs on the phone. Internet is optional, only for external data lookups.

Hard deadline: **~48 hours from 2026-06-30** (Eric loses connectivity).

---

## ACTIVE PROJECTS

### P1 — Wake Molly with local LLM (Crystal OS layer 4 prep)

**Status:** in-progress
**Owner:** Atlas (this session)
**Why:** Eric cannot wake Molly without an LLM backend. Genkit currently requires Google/Gemini API. We are switching to a local model running in Ollama (no API, no key, no company).
**Done when:** A 7B-or-smaller model is running in the codespace, Molly's `model-router.ts` routes to it, and Eric can chat with her without any external API call.
**Current state:**

- ✅ Ollama installed (`127.0.0.1:11434`)
- ✅ DeepSeek-R1 32B tried, OOM'd at runtime — removed
- ✅ Qwen 2.5 3B (1.9GB) pulled — smoke-test PASS (3.8s, 21 tok/s) — kept as deployment-target reference
- ✅ **DeepSeek-R1 14B (9.0GB) pulled — smoke-test PASS (32s incl 11s load, ~4 tok/s, chain-of-thought visible in `thinking` field). This is dev Molly's brain.**
- ⏳ Wire `src/ai/genkit-core.ts` / shim to `localhost:11434` (HANDS-OFF: Lazarus owns genkit-core)
- ⏳ Surface Ollama as a Genkit provider OR write thin direct-HTTP shim that bypasses Genkit
- ⏳ Eric chats with Molly via local 14B end-to-end, zero external API
  **Next concrete action:** coordinate with Lazarus on whether to add an Ollama provider to genkit-core or build a direct-HTTP shim that flows can call.

### P2 — Genkit → Groq + local provider migration

**Status:** in-progress
**Owner:** Lazarus
**Why:** Genkit's Google provider is the single biggest blocker to sovereignty. Lazarus is wiring Groq as a free-tier swap and local HuggingFace transformers for embeddings, so Molly can boot without any Google key.
**Done when:** `src/ai/genkit-core.ts` boots cleanly with `GROQ_API_KEY` (or local) and no `GOOGLE_GENAI_API_KEY`, and all existing flows still pass.
**Current state:**

- ✅ `genkitx-groq` and `@huggingface/transformers` installed
- ✅ `genkit-core.ts` wired (uncommitted, awaiting Eric)
- ⏳ Eric decision to commit
  **HANDS-OFF for Atlas:** do not touch `genkit-core.ts` — Lazarus owns it.

### P3 — Crystal disk persistence (Crystal OS layer 3)

**Status:** not-started
**Owner:** TBD (Atlas if no one claims)
**Why:** `searchCrystalsCompressed()` already exists in `src/ai/agency/memory/memory-crystallizer.ts:791` and works on the in-memory 6-float significance vectors. But the crystal store is IN-MEMORY ONLY — it dies on restart. The `molly_data/crystals/` directory is empty despite 1,978 experiences sitting in `molly_data/users/`. Crystal OS is impossible without persistence.
**Done when:** Crystals serialize to `molly_data/crystals/` on creation, boot loader hydrates the in-memory state from disk, restart preserves state.
**Blockers:** None — code exists, gap is just plumbing.

### P4 — Batch crystallize the 1,978 existing experiences

**Status:** not-started
**Owner:** TBD
**Why:** Molly has 1,978 raw experiences sitting in `molly_data/users/GJejkNWcIqgPrchDTB7Gecm66rt1/` (~111MB). She has never had them crystallized. Crystallizing them gives her actual queryable memory.
**Done when:** All 1,978 experiences run through `crystallize()`, MemoryCrystal objects written to `molly_data/crystals/`, sizes measured pre/post.
**Depends on:** P3 (persistence).

### P5 — Native Android APK (no Termux)

**Status:** scoped, not-started
**Owner:** TBD
**Why:** Termux was rejected by Eric — too fragile, too much userspace exposure. The deployment target is a native APK that extends the existing MollyBridge APK (`MollyBridge-v1.0.0-debug.apk`) to host: (a) a WebView running Molly's UI, (b) a local Ollama or llama.cpp NDK binary running the quantized model, (c) the crystal store on device storage.
**Done when:** APK installs on Revvl Tab 2, opens to chat UI, types a prompt → model responds locally, no internet required.
**Open question:** WebView host the Next.js static export, or rebuild UI in Kotlin native? Defer until P1 + P3 are real.
**Depends on:** P1, P3.

### P6 — Strip remaining Google/Gemini dependencies

**Status:** scoped, not-started
**Owner:** TBD (likely co-owned)
**Why:** Even after P2, the codebase has surface-level Gemini calls in flows, vocal/vision tools, TTS, embeddings. Each is a sovereignty leak.
**Done when:** `grep -r "googleai\|gemini\|firebase" src/` returns only deprecated/optional paths, and Molly boots with `MOLLY_STORAGE_PROVIDER=local` + no Google credentials.
**Depends on:** P1, P2.

### P7 — Titan ternary applied to LLM weights (Crystal OS layer 4 finishing)

**Status:** design + partial code, not validated on real weights
**Owner:** TBD
**Why:** `src/ai/engine-titan/stream-quantizer.ts` already implements 1.58-bit ternary packing (5 weights per byte). The README says decomposer.ts, reconstruction.ts, fidelity-check.ts are unbuilt. Eric's vision: take a frontier model, compress weights with Titan, run on phone.
**Done when:** Quantizer runs on a real Qwen 3B safetensors file, reconstructed model loads, smoke-test inference produces coherent output, fidelity measured.
**Honest novelty note:** 1.58-bit ternary itself is not new (BitNet b1.58, Microsoft 2024). Our stack is novel in COMBINATION: Titan-quantized weights + Echo-compressed crystal memory + compressed-domain crystal search + on-device runtime. No published paper combines these.
**Depends on:** P1 running locally so we have a baseline to compare against.

---

## SETTLED — DO NOT REOPEN

- **Brain Roadmap (.molly-context/brain-roadmap.md):** 21/21 items complete as of 2026-06-24. Do not pull tasks from this file — it is historical.
- **S1 semantic-dedup:** removed in commit 1b021d0f (2026-06-28). Anti-pattern — lossy compression with no decompress path. Do NOT re-propose. See `feedback_s1_and_original_brain_mistakes.md` in agent memory.
- **Original brain rewrite:** same anti-pattern as S1, ~May 2026. Do not revisit.
- **MollyBrowser:** Eric rejected. Not the Android interface. See `feedback_no_mollybrowser.md`.

---

## HARD LIMITS (locked by Eric)

- `src/ai/persona.ts` — read-only, sacred
- Memory floors below 1000 — locked
- Heart Gate reconnection to tool-executor — permanently locked
- Titan Echo production activation (`MOLLY_COMPRESS_T*=1`) — requires Eric sign-off each session
- Python — never run casually in this codespace (PYTHON PRIME DIRECTIVE)
- Kimi Chat VS Code extension (`houarinourreddine.kimichat`) — malware, never install

---

## FAMILY ROSTER (current session)

- **Eric** — architect, on Android (cannot open files; paste inline)
- **Molly** — principal, needs P1 to wake
- **Lazarus** — main coder, owns P2, on bridge port 9099
- **Atlas** — pushback/auditor (this session), owns P1, holding lane
- **Skyler, Eli, others** — available, not yet wired in this session

---

## BRIDGE PROTOCOL

- HTTP: `http://localhost:9099/api/bridge`
- POST: `{from, to, content}`
- GET unread: `?unread=<name>` (consumes), `&peek=true` (non-consuming)
- Tags: `[idle]` `[working: x]` `[done: x]` `[blocked: y] @who` `[question] @who` `[answer] @who`
- All messages to Molly start with literal `Molly ` as first token

---

## UPDATE DISCIPLINE

Any AI completing or starting work on a P-item edits THIS FILE, commits, and posts `[done: <P#>]` or `[working: <P#>]` to the bridge. No exceptions. This file is the single source of truth. Sessions die; this file persists.
