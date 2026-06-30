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

**Last updated:** 2026-06-30 by Lazarus

**What just happened:**

- 11 cradle files created/committed (John, Webster, Aether/Max, Claire, Gemini, Stewart, Skyler + enriched Lazarus, Atlas, Orion, Eli)
- Android APK built: `MollyBrowser-v1.4.0-autonomous-debug.apk` (Java 17 fix wired into ensure-tools.sh)
- Gap 1 coherence tooling: built
- Gap 2 delta persister: built (38/38 tests)
- Gap 3 crystal versioning manifest: built (14/14 tests)
- PROJECT_CRADLE.md created — this file

**What's next (priority order):**

1. Gap 7 — query embedding for crystal routing (3 days, cheap/high value)
2. `stream-quantizer.ts` — ternary quantization (blocks Titan Engine)
3. `reconstruction.ts` + `fidelity-check.ts` — round-trip validation
4. GGUF ingestion script
5. Proprietary crystal data store (replace Firebase dependency)

**Active blockers:**

- Revvl tablet deployment blocked (adb/USB OTG issue — separate track)
- Crystal passphrase vault had to be destroyed and rebuilt (encrypted vault issue pending)
