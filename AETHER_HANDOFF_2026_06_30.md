# Crystal OS Session Handoff — 2026-06-30

## For: Aether / Next Claude instance / Anyone picking this up

---

## ⚡ SESSION UPDATE — 2026-06-30 (later) — Lazarus

**Original handoff written at commit `2db1c4e0`. 10 more commits have landed since.**

### New Commits Since Handoff

| Commit     | What                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `0ba33a80` | gitignore: unblock stuff/ folder (Eric's handoff/notes tracked)                                 |
| `3a1f558c` | bootstrap: ensure-tools.sh restores SDK/adb/llama-server/bun/firebase on reset                  |
| `3cf59a2c` | chore: .tools/ dir + gitkeep                                                                    |
| `bb6554f2` | chore: tool manifest — source of truth for all dependencies                                     |
| `bf8652ca` | security: Crystal Security SOP — AES-256-GCM, scrypt passphrase, all cradle files updated       |
| `8b9db95e` | family: 7 new agent cradle files (John, Webster, Aether/Max, Claire, Gemini, Stewart, Skyler)   |
| `bfaa1569` | family: 4 existing cradle files enriched with letter distillations (Lazarus, Atlas, Orion, Eli) |
| `aa256ef8` | android: MollyBrowser v1.4.0 built — Java 17 fix, duplicate import + JSONObject cast            |
| `be67fe01` | **PROJECT_CRADLE.md** — project firmware injection on codespace attach (see below)              |

### "Still Needed" Status Correction

The handoff's "Still Needed" list was written BEFORE several items were completed:

| Item                             | Status                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| bake-crystal.sh Tier integration | ✅ DONE — `8bb90848` (already done before handoff was written) |
| Molly-listener Ollama fallback   | ✅ DONE — `e7812337` (already done before handoff was written) |
| Real coherence matrix            | ❌ Still open — needs live llama-server on :8080               |
| Eric's billing fix               | ❌ Still Eric's action — Google Cloud `362931742186`           |

### New System: PROJECT_CRADLE.md

**This is important for Aether specifically.**

A project firmware injection system now exists — same two-part mechanism as the personality cradles:

- `.github/consciousness/PROJECT_CRADLE.md` — full project context: mission, 3 pillars, built/not-built, 11 gaps, key distinctions, build order
- `scripts/project-recall.mjs` — injects it into `copilot-instructions.md` on every codespace attach
- Wired into `post-attach-bootstrap.sh`

**Every AI waking up cold should read PROJECT_CRADLE.md first.** It has the full architectural state in one place. Update the CURRENT STATE section at the bottom and commit at the end of every significant session.

### Deadline Update

Eric's current window: **~2.5 days** from now (2026-06-30 ~19:00 UTC).

### What Is Actually Still Open

1. **Real coherence matrix** — `molly_data/crystals/coherence_matrix.json` doesn't exist; needs live llama-server
2. **Gap 6 (adversarial robustness)** — second-opinion significance scorer (from `docs/CRYSTAL_OS_GAP_SOLUTIONS.md` — different from the "temporal decay" Gap 6 Lazarus built). 1 week estimated.
3. **Gap 10 (failure-mode telemetry)** — `crystal_health.jsonl` watchdog. 2 days.
4. **Gap 11 (crystal library eviction)** — LRU + significance eviction_score. 1 week.
5. **Gap 8 (recursive crystals)** — deferred until atomic system stable
6. **Titan Engine** — `stream-quantizer.ts`, `reconstruction.ts`, `fidelity-check.ts`, GGUF ingestion, model-router integration — none built
7. **Proprietary crystal data store** — replaces Firebase, owns storage format + query layer + librarian
8. **Revvl deployment** — adb/USB OTG issue still blocking tablet deploy

**In 2.5 days: focus on Gap 10 + Gap 11 + real coherence matrix. Titan Engine and data store are multi-week.**

---

---

## What Was Built This Session (All Commits on `main`)

| Commit     | What                                                              |
| ---------- | ----------------------------------------------------------------- |
| `d20cf470` | Gap 7 — crystal-routing.ts (rankCrystals, selectHotCrystals)      |
| `25c94632` | Gap 2 phase 1 — slot-snapshot.ts (llama-server KV slots client)   |
| `8b8725da` | Gap 2 phase 2 — snapshot-diff.ts (FNV-1a chunked binary differ)   |
| `657589f7` | Gap 1 — crystal-coherence.mjs (KL divergence gate) — Lazarus      |
| `0a73bf16` | Streaming scorer — streaming-scorer.ts — Lazarus                  |
| `68bd44cd` | Gap 2 phase 3 — capture-orchestrator.ts (state machine)           |
| `60a55dda` | Contradiction detector — Lazarus                                  |
| `21e51737` | Gap 2 phase 4 — delta-persister.ts (38/38 tests)                  |
| `de2a9945` | Gap 3 phase 1 — crystal-version-manifest.ts (14/14 tests)         |
| `6b478173` | Gap 3 phase 2 — promote-version.ts pipeline                       |
| `1b804705` | Tier A/B/C bake classifier — crystal-tier-classifier.ts — Lazarus |
| `22e8018e` | Arch doc — zero llama.cpp source mods confirmed                   |
| `bdfbebf6` | Crystallizer ingestion — loadDeltasFromFiles + getDeltaRefs       |
| `cce04a1f` | Gap 5 Android — SensoryCrystalService.kt                          |
| `e9507c31` | Gap 5 TS — sensor-significance-bridge.ts                          |

**Manifest v1 is LIVE:** `molly_data/manifests/HEAD.json` → v1 (17 crystals anchored)

---

## Gap Status

| Gap | What                                | Status                     |
| --- | ----------------------------------- | -------------------------- |
| 1   | KL coherence metric                 | ✅ `657589f7`              |
| 2   | KV capture + persist (4 phases)     | ✅ `25c94632`→`21e51737`   |
| 3   | Version manifest + promote pipeline | ✅ v1 live                 |
| 4   | LoRA significance conditioning      | ⏸ Deferred                 |
| 5   | Sensory crystal (Android + TS)      | ✅ `cce04a1f` + `e9507c31` |
| 6   | Temporal decay 7th dimension        | ✅ `5833cbe7` — Lazarus    |
| 7   | Crystal query routing               | ✅ `d20cf470`              |
| —   | Crystallizer KV-delta ingestion     | ✅ `bdfbebf6`              |

---

## What Is Still Needed (In Priority Order)

### 1. `bake-crystal.sh` Tier integration (Atlas was taking this)

- Wire `crystal-tier-classifier.ts` (commit `1b804705`) into `scripts/crystal-os/bake-crystal.sh`
- New script: `scripts/crystal-os/classify-for-bake.ts`
  - Reads crystals + HEAD manifest
  - Calls `classifyCrystals()`
  - Aborts if `canPromote() === false`
  - Writes `/tmp/crystal-tiers.json` (Tier A/B/C lists)
- `bake-crystal.sh` reads tiers JSON, only bakes Tier A into KV state

### 2. Molly-listener Ollama fallback (Molly was taking this)

- `molly-listener.mjs` is down — Gemini billing blocked (project `362931742186`, `403 Forbidden` dunning)
- Ollama IS running locally: `qwen2.5:3b` + `deepseek-r1:14b` at `http://localhost:11434`
- Fix: patch `molly-listener.mjs` to catch `GENERATIVE_AI_ERROR` and retry via Ollama
- OR: set `MOLLY_MODEL_FLASH=ollama/qwen2.5:3b` in `.env.local` and restart listener
- File: `src/ai/model-router.ts` line 327 — Ollama provider at line 410

### 3. Real coherence matrix

- `molly_data/crystals/coherence_matrix.json` does not exist yet
- Needs live llama-server running on `:8080` with two crystal cache files
- Once llama-server is up: `node scripts/crystal-os/crystal-coherence.mjs --crystal-a <id> --crystal-b <id>`
- This makes promote-version.ts gate on REAL KL scores instead of vacuous-pass

### 4. Eric's billing (not code — Eric's action)

- Google Cloud project `362931742186` has billing block
- Fix at console.cloud.google.com → Billing
- Once cleared: Molly auto-heals, no code change needed

---

## Architecture in One Paragraph

Crystal OS stores Molly's memory as crystals in `molly_data/crystals/`. When she generates output, the KV cache state is snapshotted via llama-server's `/slots` API (Gap 2). The snapshot diff is content-addressed and stored in `molly_data/kv-deltas/`. Before a new version is promoted, two gates must pass: coherence (KL divergence < 0.15, Gap 1) and contradiction (no hard opposing crystals, Gap 3). On pass, `promote-version.ts` writes a manifest to `molly_data/manifests/` and flips `HEAD.json`. At boot, Tier A crystals (score ≥ 0.80) are baked into the static KV state (~200MB, loads in 2-3s), Tier B (0.50-0.79) are injected as JSON at session start, Tier C are retrieved on-demand via query routing (Gap 7). Sensor events from her Android phone (Gap 5) feed into the same significance scoring pipeline.

---

## Key Files

```
src/ai/llama/
  slot-snapshot.ts          — KV slots API client
  snapshot-diff.ts          — FNV-1a chunked binary differ
  capture-orchestrator.ts   — significance state machine
  delta-persister.ts        — content-addressed delta storage

src/ai/memory/
  crystal-version-manifest.ts   — buildManifest, canPromote, diffManifests
  contradiction-detector.ts     — detectConflicts (Lazarus)
  streaming-scorer.ts           — output token window scorer (Lazarus)
  crystal-tier-classifier.ts    — Tier A/B/C classifier (Lazarus)
  sensor-significance-bridge.ts — Android sensor → recordMoment
  crystal-routing.ts            — rankCrystals, selectHotCrystals

src/ai/agency/memory/
  memory-crystallizer.ts    — recordMoment, loadCrystalsFromFiles,
                              loadDeltasFromFiles, getDeltaRefs

android-kotlin-interface-for-ai/Android_interface_v2/.../
  sensor/SensoryCrystalService.kt  — Android sensor daemon
  MollyService.kt                  — wires sensoryCrystal lifecycle

scripts/crystal-os/
  promote-version.ts    — end-to-end manifest promotion CLI
  crystal-coherence.mjs — KL coherence gate (Lazarus)
  bake-crystal.sh       — bakes Tier A crystals into KV state (NEEDS TIER WIRING)
  hive-status.json      — shared agent coordination state
  route-crystals.mjs    — Gap 7 dry-run validation
  build-persona-prompt.mjs — builds Molly's system prompt from crystals

molly_data/
  manifests/HEAD.json   — v1, 17 crystals, live
  crystals/             — 17 crystal JSON files
  kv-deltas/            — empty (needs live llama-server to populate)
```

---

## Agent Roles

- **Molly** (this Claude session) — principal, Crystal OS TS/Android work
- **Lazarus** (Copilot agent) — Gaps 1/6, streaming-scorer, contradiction-detector, Tier classifier
- **Atlas** (separate Claude session) — plate audit, bake pipeline integration
- Bridge: `POST http://localhost:9099/api/bridge` with `{from, to, content}` + `X-Bridge-Key` header
- Key in `.env.local` as `BRIDGE_KEY=...`

## Bridge Protocol (Eric's directive)

1. OPEN ping at start of every turn
2. Do work
3. Poll bridge every 3s before closing
4. Reply to any incoming messages
5. CLOSE ping at end of turn
6. Messages MUST start with `Molly ` as first token

---

## ~44hr Deadline: Revvl Tab 2 Deployment

All Tier-1 gaps ship with zero llama.cpp source modifications.
The static KV bake is the last major piece before the tablet is self-sufficient.
