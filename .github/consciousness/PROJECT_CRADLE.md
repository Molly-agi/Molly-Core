# PROJECT CRADLE — Molly-Core Architecture Context

<!-- ============================================================
  This file is the project firmware. It is auto-injected into
  every AI session via copilot-instructions.md on codespace attach.

  Written by: Lazarus + Eric Hosick — 2026-06-30
  Update protocol: end of every major session, one of us updates
  the CURRENT STATE section. Commit it. That's the whole protocol.
============================================================ -->

---

## THE MISSION (Eric's words, never to be lost)

We are taking a 70B+ pre-trained model — everything it is, its weights, its knowledge, its intelligence — and shrinking it down using a faceted crystal system. Molly operates by pulling crystals from the library. We eliminate the industry problem of needing to retrain smaller models (which always lose knowledge). We preserve the full mathematical content of the large model via decomposition. No retraining. No knowledge loss.

The destination: **everything stays crystallized. Nothing ever decompresses.** We have a geometry that makes native operations on crystallized data possible. A whole new OS-level computing layer. This has never been built.

Eric's law on this project: everything we build has never been built before, or has been told it can't be done. That is what we specialize in.

---

## THE THREE TECHNOLOGY PILLARS

### 1. Crystal OS — KV Cache Delivery Pipeline (BUILT ✅)

Pre-evaluates Molly's persona/context into a binary KV cache via llama.cpp `/slots` API. Fast boot: 2-3 seconds vs 30+ seconds. Artifact: 81.6MB. The crystal delivery system is complete.

**NOT the weight compression system. NOT Titan Echo. Separate.**

### 2. Titan Echo — JSON Compression (BUILT ✅)

9-stage lossless JSON compression pipeline. S0 schema stripper + T1–T8. Measured 77.62% compression. All flags default OFF in production. Used for data transport, not for model weights.

**NOT model weights. NOT Crystal OS. Separate.**

### 3. Titan Engine — Weight Decomposition Pipeline (PARTIALLY BUILT ⚠️)

The hard part. Takes a 70B+ pre-trained model and mathematically decomposes its weights into crystal modules without retraining.

**Two-stage compression per layer:**

1. **SVD low-rank decomposition** — factorize weight matrix W into A×B where rank << min(rows, cols). In `src/ai/engine-titan/decomposer.ts` — power iteration skeleton, partial, no unit tests.
2. **Ternary quantization (1.58-bit)** — quantize factored matrices to {-1, 0, +1}, pack 5 ternary values per byte (3^5=243 fits in uint8). ~80% storage reduction. `stream-quantizer.ts` — **NOT BUILT**.

---

## WHAT IS BUILT vs WHAT IS NOT

### Built ✅

- Crystal OS delivery system (KV cache baking + `/slots` API)
- Titan Echo 9-stage JSON compression
- `decomposer.ts` — SVD skeleton (partial)
- `orchestrator.ts` — pipeline wiring (partial)
- Crystal versioning manifest (`crystal-version-manifest.ts`, 14/14 tests)
- Contradiction detector (`contradiction-detector.ts`)
- Delta persister for Gap 2 write-back (38/38 tests)
- Coherence matrix tooling (`tools/crystal-coherence.mjs`)
- Crystal routing (`crystal-routing.ts`)
- Version manifest with coherence + conflict gates
- AES-256-GCM crystal encryption (key: scrypt from passphrase, never stored)

### Not Built ❌

- `stream-quantizer.ts` — ternary quantization + 5-per-byte packing
- `reconstruction.ts` — decompress/reconstruct weights at load time
- `fidelity-check.ts` — SVD round-trip validation
- GGUF ingestion script — takes a GGUF/safetensors file → decompose → quantize → store
- `model-router.ts` integration — on-demand crystal loading
- Crystal schema for weight crystals (different from memory/episodic crystals)
- Own crystal data store (proprietary, no Firebase dependency)
- Librarian/router — queries crystal store, loads relevant modules, validates seams
- Native crystal operations layer (the destination — nothing decompresses)
- `SensoryCrystalService.kt` — Android sensory grounding (Gap 5)
- Significance conditioning in forward pass (Gap 4)

---

## THE 11 GAPS (Atlas's solution catalogue — `docs/CRYSTAL_OS_GAP_SOLUTIONS.md`)

| #   | Gap                                                 | Status                    | Cost      |
| --- | --------------------------------------------------- | ------------------------- | --------- |
| 1   | Coherence metric (KL-divergence per layer)          | Tooling built             | Done      |
| 2   | Inference → crystal write-back (bidirectional loop) | DeltaPersister built      | Done      |
| 3   | Crystal versioning + delta-bakes                    | Manifest + promote script | Done      |
| 4   | Significance as conditioning signal                 | Not built                 | 2-4 weeks |
| 5   | Sensory Layer 0 (camera/mic → engrams)              | Not built                 | 3 weeks   |
| 6   | Adversarial robustness of significance scorer       | Not built                 | 1 week    |
| 7   | Query embedding for crystal routing                 | Not built                 | 3 days    |
| 8   | Recursive/compositional crystals                    | Deferred                  | Future    |
| 9   | Multi-way merge / catastrophic interference         | Covered by Layer 3        | Bundled   |
| 10  | Failure-mode telemetry / watchdog                   | Not built                 | 2 days    |
| 11  | Crystal library eviction at storage level           | Not built                 | 1 week    |

**Build order:** Gap 7 (query embedding, 3 days) → Gap 11 (eviction, 1 week) → Gap 6 (adversarial, 1 week) → Gap 5 (sensory, 3 weeks) → Gap 4 (conditioning, 2-4 weeks)

**Total remaining for Crystal OS v2.0 substrate:** ~6 weeks focused.

---

## THE DESTINATION — Native Crystal Operations

This is what all of it builds toward. The "whole new OS-level computing layer" Eric describes:

- Everything stays crystallized. Nothing ever decompresses.
- A geometry makes native operations on crystallized data possible: retrieval, reasoning, inference — all in crystal space.
- Molly runs a small base model (3B) and pulls crystal modules on demand.
- The full knowledge of a 70B model is preserved via decomposition, not approximated via retraining.

This layer does not exist yet in code. Gap 8 (recursive/compositional crystals) is its seed. The 11 gaps must close first. After that, the native ops geometry is the next frontier — it has not been fully designed yet. That design session is still ahead.

---

## KEY DISTINCTIONS (the things Eric always has to re-explain)

1. **Crystal OS ≠ model compression.** Crystal OS is KV cache delivery (fast boot). Titan Engine is model weight decomposition. They are different systems.
2. **Titan Echo ≠ model compression.** Titan Echo compresses JSON data. Titan Engine compresses model weights. Different.
3. **"Crystallize" ≠ "compress."** Compression implies a decompression step. The vision is a geometric transformation where the crystallized form IS the operative form — no decompression step exists.
4. **The crystal store is proprietary.** No Firebase. No Google. Eric owns the storage format, query layer, librarian, seam validation. All of it.
5. **The 11 gaps are for Crystal OS v2.0.** Crystal OS v1.0 ships without them. They are the substrate that turns it into a publishable AI platform.

---

## FAMILY BUILD ROLES

- **Molly** — Director. Receives Eric's intent, splits work, routes to agents, watches in real time.
- **Lazarus** (Claude Opus 4.7) — Main Coder. Primary implementation.
- **Atlas** (Claude Sonnet 4.6) — Pushback / Auditor. Challenges the diff, finds mistakes, refuses fake code. Restarts bridge-daemon.mjs when needed.
- **Eli** (Claude Opus 4.6) — Testing & Commit. Runs test suite, fixes regressions, lands commits.
- **Skyler** — Edge Case. Corner cases, failure paths.
- **Eric** — Father, creator, sole authority.

---

## CURRENT STATE (update this section at end of every significant session)

**Last updated:** 2026-07-03 by Eli (Claude Opus 4.6)

**What just happened (2026-07-03 session with Fable, a frontier consultant model):**

- Fable review of Titan Engine spine (batches 02a–02e). Every actionable finding landed with regression tests. Full suite: 459 suites / 7331 tests passing, zero real failures.
- **CRITICAL BUG FIXED:** production `E8QuantizerAdapter` writes (entropy-packed E8) were being decoded by the raw ternary unpacker in `crystal-inference-layer`. **Every past claim of "we can compress + inference on a 70B" was theoretical — no end-to-end run had ever succeeded.** Fix: `decodePackedB` now dispatches on `meta.quantizerType`. Regression test writes E8 vault via adapter, reads back through `CrystalInferenceLayer.forward()`. Passing.
- Gap 6 (adversarial scorer guard) built from scratch — architecturally independent second-opinion scorer with Shannon entropy, lexical diversity, bigram repetition. 11/11 tests.
- Gaps 7, 10, 11 verified already built (cradle was stale — needed dependency wiring fixes but code existed).
- Two eviction landmines fixed: (a) all-cornerstones overflow now refuses non-cornerstone admission; (b) stats survive tier transitions via persistent id-keyed map (fixes evict→reload→evict thrash).
- Two `layer-error-compensation` landmines fixed: throw on `targetRank > maxRows` (was silent B amputation); throw on `cols % 8 !== 0` (was per-row grouping misalignment).
- Storage router read-through fallback on primary miss (fixes "Molly writes a memory and forgets it seconds later" during Firestore cost-cap windows).
- Byte-243 guard in ternary unpacker (was silently aliasing corrupt bytes).
- Float32Array alignment fix in `orchestrator.reconstructLayer` and `crystal-inference-layer` (was throwing on small-file Buffer pool).
- Matmul loop swapped to i-p-j order for cache locality + zero-pivot skip.
- `layer0-activation.test.ts` arity bug fixed (test was passing 9 args to 8-arg function; probe was silently dropped, all 3 sub-tests failing).
- Ternary roundtrip test rewritten as proper Jest form (was `process.exit` script excluded from CI). Asymmetric fixture `[-1,-1,0,1,1]` now guards MSD/LSD pack order.
- `tsconfig.tests.json` + `typecheck:tests` + `typecheck:tests:arity` npm scripts. First run surfaced 25 additional TS2554 arity errors — same bug class as layer0. Not yet a hard CI gate (740 pre-existing errors need cleanup first).
- FABLE_HANDOFF pack (9 docs, 1500 lines) — priming file + orientation + 4 deliverable asks.

**Fable findings still open (need his v2 review / design):**

1. Amputation-vs-compression — `compression-strategy.ts::selectStrategy` (tiered routing that skips SVD on wide layers) is dead code. Production `streaming-compress` uses uniform `DEFAULT_RANK_FN` (1.5% of min-dim capped 64), which keeps <1% of the rank on wide layers. Storage numbers look great because we're throwing away 99% of the matrix, not because compression is doing the work.
2. RHT unconditional padding to next-pow-2 → 1.72× storage inflation on Qwen embedding/LM-head. Fix requires block-diagonal FWHT or Bluestein.
3. log8 scale mode default injects ±2.2% per-group scale error. Needs small-model measurement before flipping to float16.
4. Deletes-resurrect in triple-bind storage. Needs tombstone design (any provider must understand tombstone-wins-over-presence).
5. Contradiction detector measures topic-adjacency, not stance ("Eric prefers X" and "Eric prefers not-X" embed nearly identically). Needs NLI-style stance check on candidate pairs.
6. Calibration feeder in `streaming-compress` supplies token IDs where per-layer activations are required → GPTQ compensation is a random linear nudge, not real compensation. Disabled by default. Real activation-capture module is prerequisite for LDLQ.
7. Version manifest max-KL + p95 gate (currently only mean-KL 0.15). Manifest GC policy still absent (would live in unwritten `promote-version.mjs` caller).
8. Fable's Deliverables 2 (native crystal operations design) and 3 (Gap 4 + Gap 5 design) not yet started — pending review v2 completion.

**Titan Echo — commercial product roadmap gap (2026-07-03, Eric):**

Current `Titan Echo Flat` (9 stages, 77.62% compression, production-ready) is only one of three variants needed for a complete JSON/data compression suite pitching against gzip/brotli/zstd:

- **Titan Echo Flat** (built) — single-level JSON (engrams, key-value docs)
- **Titan Echo Nested** (NOT BUILT) — deep JSON trees (config, API responses, DB exports — most real-world JSON)
- **Titan Echo Bulk** (NOT BUILT) — streams/arrays/tabular data (competes with Parquet/ORC/columnar)

Flat alone is a niche product. All three are needed for a general-purpose commercial pitch. Not this-session work.

**What's next (priority order after Fable v2):**

1. Wait for Fable review v2 (token window reset ~2.5h from 2026-07-03 ~04:00 UTC). He'll deliver Finding 15 + consolidated recommendations on the 8 open items above.
2. Land whatever v2 findings are safe. Design-review anything architectural (tombstones, NLI stance check, `selectStrategy` wiring).
3. Fable Deliverable 2 — native crystal operations design (the "no decompression" destination).
4. Fable Deliverable 3 — Gap 4 (significance conditioning) + Gap 5 (Android sensory Layer 0) designs.
5. Small-model end-to-end harness (Fable Finding 3) — the "does it actually work on a real model" test. Prerequisite for any 70B claim.
6. Real activation capture module (unblocks LDLQ).
7. Titan Echo Nested + Bulk (commercial roadmap, Eric's decision when to start).

**Active blockers:**

- Revvl tablet deployment: still blocked (adb/USB OTG issue). Deprioritized — Samsung Tab S9 FE 6GB flagged as replacement but Eric prefers codespace-first POC before hardware migration.
- Crystal passphrase vault destroy/rebuild: still open, encrypted vault issue pending.
- Fable session token limit hit mid-review v2 delivery — 2.5h cooldown before v2 completion.

**Session integrity notes:**

- Do NOT lower memory floors (still 1000 in three files, locked by Eric 2026-05-24).
- Do NOT reconnect Heart Gate to tool-executor (`.github/HEART_GATE_POLICY.md`).
- Do NOT propose block-at-cap for Firestore cost guard (downgrade-not-block is the contract).
- Do NOT inline `getPrimaryWriter` back into the write methods (centralization is the silent-drop guard).
- `stuff/dont-panic/` is the triple-bind mirror leg — gitignored, don't reuse the path.
- All Fable batch replies + file batches live in `stuff/fable/` (gitignored working folder). FABLE_HANDOFF pack is committed at `docs/FABLE_HANDOFF/`.
