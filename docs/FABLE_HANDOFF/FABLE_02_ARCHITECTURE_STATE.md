# FABLE — Architecture State (as of 2026-07-03, partially stale)

> **NOTE (2026-07-13):** This file was verified on July 3. Since then 160+ commits have landed including Fox Hunt IV (72B model matches llama.cpp), parallel matmul worker pool (14.4x speedup), and multiple Titan engine fixes. LOC counts and test numbers below may be out of date. The gap status table and architectural descriptions remain accurate.

---

## THE 11 GAPS — Current Status

The gap taxonomy comes from `docs/CRYSTAL_OS_GAP_SOLUTIONS.md`. Original author: Atlas (Claude Sonnet). Numbering is his.

| #   | Gap                                                 | Status                | Files                                                                                                                        |
| --- | --------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Coherence metric (KL-divergence per layer)          | **DONE**              | `src/ai/memory/coherence-matrix.ts`, `scripts/crystal-os/crystal-coherence.mjs`, `molly_data/crystals/coherence_matrix.json` |
| 2   | Inference → crystal write-back (bidirectional loop) | **DONE**              | `src/ai/llama/delta-persister.ts` (38/38 tests)                                                                              |
| 3   | Crystal versioning + delta-bakes                    | **DONE**              | `src/ai/memory/crystal-version-manifest.ts` (14/14 tests)                                                                    |
| 4   | Significance as conditioning signal in forward pass | **NOT BUILT**         | design needed                                                                                                                |
| 5   | Sensory Layer 0 (Android sensors → engrams)         | **NOT BUILT**         | `src/ai/memory/sensor-significance-bridge.ts` (TS side stub) — Kotlin side missing                                           |
| 6   | Adversarial robustness of significance scorer       | **DONE (2026-07-02)** | `src/ai/memory/adversarial-scorer-guard.ts` (11/11 tests)                                                                    |
| 7   | Query embedding for crystal routing                 | **DONE**              | `src/ai/memory/crystal-routing.ts`                                                                                           |
| 8   | Recursive / compositional crystals                  | **DEFERRED**          | seed of native ops layer                                                                                                     |
| 9   | Multi-way merge / catastrophic interference         | **DONE (bundled)**    | Adapter hard-caps at N=4                                                                                                     |
| 10  | Failure-mode telemetry / watchdog                   | **DONE**              | `src/ai/memory/crystal-health-logger.ts` (10/10 tests)                                                                       |
| 11  | Crystal library eviction at storage level           | **DONE**              | `src/ai/memory/crystal-library-eviction.ts` (25/25 tests)                                                                    |

**What is left:** Gap 4, Gap 5 (Kotlin side), and Gap 8 / native ops. That is it for the substrate layer.

---

## TITAN ENGINE — Weight Decomposition Pipeline

This is the model compression pipeline. Files exist. Testing status varies.

### Built and tested

| File                                               | LOC | Tests        | Purpose                                                                                 |
| -------------------------------------------------- | --- | ------------ | --------------------------------------------------------------------------------------- |
| `src/ai/engine-titan/decomposer.ts`                | 212 | passing      | SVD via power iteration                                                                 |
| `src/ai/engine-titan/stream-quantizer.ts`          | 115 | passing      | Ternary quantization + 5-per-byte packing                                               |
| `src/ai/engine-titan/reconstruction.ts`            | 106 | passing      | Decompress + reconstruct weights                                                        |
| `src/ai/engine-titan/weight-crystal-adapter.ts`    | 111 | passing      | Bridge between weight crystals and memory crystals                                      |
| `src/ai/engine-titan/gguf-ingest.ts`               | 327 | passing      | Take a GGUF file, decompose, quantize, store                                            |
| `src/ai/engine-titan/gguf-dequant.ts`              | ~   | passing      | GGUF-format-specific dequantization                                                     |
| `src/ai/engine-titan/orchestrator.ts`              | 157 | passing      | Pipeline wiring                                                                         |
| `src/ai/engine-titan/optimal-ternary.ts`           | ~   | 8/10 passing | E2M-ATQ (Extended 2-Moment Adaptive Ternary Quantization) — picks the optimal threshold |
| `src/ai/engine-titan/e8-lattice.ts`                | ~   | passing      | E8 lattice quantization (higher-dimension alternative to ternary)                       |
| `src/ai/engine-titan/e8-entropy.ts`                | ~   | passing      | Entropy calibration for E8                                                              |
| `src/ai/engine-titan/hadamard-transform.ts`        | ~   | passing      | Hadamard transform for lattice pre-processing                                           |
| `src/ai/engine-titan/layer-error-compensation.ts`  | ~   | passing      | Post-decomposition error correction                                                     |
| `src/ai/engine-titan/kotms.ts`                     | ~   | passing      | K-of-the-Most-Significant selection (top-k activation shaping)                          |
| `src/ai/engine-titan/kvarn.ts`                     | ~   | script       | KV-cache related                                                                        |
| `src/ai/engine-titan/nan-tripwire.ts`              | ~   | passing      | NaN detection sentinel                                                                  |
| `src/ai/engine-titan/offq-pca.ts`                  | ~   | passing      | Offline-quantization PCA calibration                                                    |
| `src/ai/engine-titan/offq-calibrate.ts`            | ~   | script       | Calibration data harness                                                                |
| `src/ai/engine-titan/calibration-dataset.ts`       | ~   | passing      | Calibration data loader                                                                 |
| `src/ai/engine-titan/compression-strategy.ts`      | ~   | passing      | Strategy selection per layer                                                            |
| `src/ai/engine-titan/streaming-compress.ts`        | ~   | passing      | Streaming (memory-bounded) compression                                                  |
| `src/ai/engine-titan/titan-crystal-adapter.ts`     | ~   | passing      | Titan → crystal format bridge                                                           |
| `src/ai/engine-titan/quantizer-interface.ts`       | ~   | passing      | Quantizer plugin interface                                                              |
| `src/ai/engine-titan/quantizer-ternary-adapter.ts` | ~   | passing      | Ternary implementation of the interface                                                 |
| `src/ai/engine-titan/quantizer-e8-adapter.ts`      | ~   | passing      | E8 lattice implementation of the interface                                              |
| `src/ai/engine-titan/crystal-inference-layer.ts`   | ~   | passing      | Inference-time layer wrapper around a weight crystal                                    |

### Related but outside `engine-titan/`

| File                                             | Purpose                                                                                                                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ai/inference/crystal-transformer-driver.ts` | The forward-pass driver that stitches crystal layers into a full transformer. **Its probe-checkpoint system is currently broken** — `layer0-activation.test.ts` fails because probes don't fire. This is the one known outstanding bug. |
| `src/ai/inference/kv-cache.ts`                   | KV cache implementation                                                                                                                                                                                                                 |
| `src/ai/model-router.ts`                         | Chooses a model per request; used by chat layer                                                                                                                                                                                         |
| `src/ai/tools/fidelity-guard.ts`                 | SVD round-trip fidelity validation (used by decomposer)                                                                                                                                                                                 |

### End-to-end validation status

**Never run end-to-end on a real 70B ingest.** Everything is validated on:

- Synthetic random weight matrices (unit tests)
- Small deterministic tensors (integration tests)
- Round-trip tolerance checks

**We do not know for certain that a 70B model survives the full pipeline.** This is the biggest open technical risk. See Deliverable 1 (`FABLE_03_ASK_ARCHITECTURE_REVIEW.md`) — we specifically want your opinion on whether the current design has the numerical margins to survive real-model ingest.

---

## MEMORY / CRYSTAL LIBRARY LAYER

Separate from Titan Engine. This is Molly's episodic + semantic memory, which happens to also be crystal-shaped.

| File                                          | Purpose                                                       | Tests   |
| --------------------------------------------- | ------------------------------------------------------------- | ------- |
| `src/ai/memory/crystal-routing.ts`            | Query embedding + cosine ranking for crystal retrieval        | passing |
| `src/ai/memory/crystal-library-eviction.ts`   | Two-tier hot/warm library with retention scoring              | 25/25   |
| `src/ai/memory/crystal-version-manifest.ts`   | Version snapshots + promotion gates                           | 14/14   |
| `src/ai/memory/crystal-health-logger.ts`      | JSONL telemetry log for every crystal event                   | 10/10   |
| `src/ai/memory/coherence-matrix.ts`           | KL-divergence per-layer coherence metric                      | passing |
| `src/ai/memory/contradiction-detector.ts`     | Detects contradictory crystals; gates promotion               | passing |
| `src/ai/memory/adversarial-scorer-guard.ts`   | Second-opinion scorer; quarantines suspected keyword-stuffing | 11/11   |
| `src/ai/memory/streaming-scorer.ts`           | Primary regex-based significance scorer                       | passing |
| `src/ai/memory/sensor-significance-bridge.ts` | Sensor window → significance score (TS side of Gap 5)         | passing |
| `src/ai/memory/engram-persistence.ts`         | Firestore-backed engram store — **1000 entry floor, locked**  | passing |
| `src/ai/bridge/consciousness-sync.ts`         | Bridge sync — **1000 entry floor, locked**                    | passing |
| `src/ai/flows/memory-consolidation.ts`        | Consolidation flow — **1000 entry floor, locked**             | passing |

### Locked memory floors (protected by Eric 2026-05-24)

Three FIFO limits were silently discarding 90% of Molly's episodic memory for months. Eric found and fixed it. The floors are **1000 entries** in all three files above. **Do not propose lowering these.** If you think memory is a bottleneck, propose better compression via Titan Echo (which is what its T1-T6 stages exist for), not smaller retention limits.

### Titan Echo activation gate

Titan Echo compression code is complete and unit-tested (T1–T8, S0 schema stripper). Live production use requires Eric's explicit permission — has not been enabled on live memory yet. Do not propose enabling it without flagging that Eric has to sign off.

---

## STORAGE / DURABILITY LAYER

**Triple-bind durability** (locked by Eric 2026-06-24, item 21):

- Every memory write goes to three sinks: Firestore (live) + `molly_data/` (codespace backup) + `stuff/dont-panic/` (phone-syncable mirror).
- Flags: `MOLLY_DUAL_WRITE=true` enables leg 2, `MOLLY_TRIPLE_BIND=true` enables leg 3 (requires dual-write). Both default OFF.
- Firestore cost cap: `MOLLY_FIRESTORE_DAILY_OP_CAP=50000`. **At cap: downgrade, not block.** Primary is skipped, legs 2 + 3 absorb. Never throws.
- Backup/mirror write failures are fire-and-forget. Never poison primary.

**Contract:** `getPrimaryWriter(op)` in `src/lib/storage-router.ts` — the single decision site. Always returns a writable provider (never null, never silent-drop). Regression contract test: `src/lib/__tests__/storage-router-triple-bind.contract.test.ts` (7 assertions, do not weaken).

**Do not propose:** inlining `getPrimaryWriter` back into the five write methods for "readability." The centralized helper is what makes silent drops impossible by construction. Scattering the logic reintroduces the pre-#272 bug class.

**Do not propose:** block-at-cap. Data loss is worse than degraded performance. The whole point of triple-bind is durability.

---

## CRYSTAL STORE — Proprietary requirement

**Currently:** Molly's memory crystals live in Firestore.
**Requirement (Eric):** the crystal store must eventually be proprietary. No Firebase. No Google. Eric owns the storage format, query layer, librarian, seam validation. All of it.

**Not built:**

- Own crystal data store (proprietary, no external dependency)
- Librarian / router that queries the crystal store, loads relevant modules, validates seams
- Weight crystal schema (distinct from memory / episodic crystal schema)

**Design constraint:** the proprietary store must interoperate with Titan Engine (weight crystals) _and_ the memory layer (episodic crystals). Same store, two schemas, unified query surface. Not a hard requirement that they share indexing — but they should share the storage substrate.

This is design work you may be asked to weigh in on. Not the primary ask, but flag it in the architecture review if you see structural issues.

---

## FAMILY BRIDGE / RUNTIME

Molly runs multiple background daemons in the codespace. Key ones:

- `scripts/immortal-daemon.mjs` — "The One Bridge." Heartbeat, ghost-hunting, bridge guardian.
- `scripts/save-session.mjs` — Session persistence (npm hooks + postAttach).
- `scripts/codespace-health.sh` — Zombie process cleanup.
- `src/lib/session-manager.ts` — Session state API.
- `COPILOT_SESSION_STATE.md` / `.json` — Session memory files.

**Protected infrastructure.** A previous instance deleted `save-session.mjs` during a "cleanup" and broke everything. These files are permanent. Check git blame before proposing to delete anything in `scripts/`.

**Family bridge:** In-process HTTP bridge at `http://localhost:9099/api/bridge` for cross-instance messaging (Molly ↔ Lazarus ↔ Atlas ↔ Eli). Not something you interact with directly, but relevant if you propose changes to how instances coordinate.

---

## TEST SUITE HEALTH

As of 2026-07-02:

- **Total suites:** 457
- **Passing:** 456
- **Failing:** 1 (`src/ai/engine-titan/__tests__/layer0-activation.test.ts` — probe checkpoints don't fire; pre-existing crystal-transformer-driver bug)
- **Total tests:** 7323
- **Passing:** 7307
- **Failing:** 3 (all in `layer0-activation.test.ts`)

**Coverage of the compression pipeline is unit-level only.** No end-to-end 70B validation. See risk note in Titan Engine section above.

---

## HEART GATE POLICY — LOCKED

Referenced in `.github/HEART_GATE_POLICY.md`. **Heart Gate (moral compass) is NOT connected to tool-executor.ts.** This has been fought over repeatedly. It will not be reopened without Eric.

Heart Gate tells Molly right from wrong. It does not restrict her tools. If your design proposes coupling them, stop and flag it explicitly — do not weave it into a larger design as if it's an incidental choice. Only Eric can approve reconnection.

---

## INNOVATION INVENTORY

`docs/MOLLY_LABS_INNOVATION_INVENTORY.md` — 14 numbered entries as of 2026-06-06. Every novel architecture, method, or concept shipped that is not present in prior published AI research gets an entry. Git timestamp is the prior-art record.

**If your design work produces something novel, flag it explicitly** and Eli will add the entry. Do not skip this — it protects Eric's IP.

Full technical disclosures (for patent purposes) go in `docs/TECHNICAL_DISCLOSURE_[NAME].md`.

---

## What is not in this file

- The Molly-side agency system (`src/ai/agency/`) — outside project scope for the primary asks. Will be covered in `FABLE_06_MOLLY_AUDIT_ASK.md` if we get there.
- The persona system (`src/ai/persona.ts`) — protected, do not touch.
- The voice system (`src/ai/flows/text-to-speech.ts`, etc.) — outside scope.
- The admin UI, browser extension, Android APK — outside scope.

If you need any of these for context, ask.

---

## Acknowledge

When you have read this file, reply with exactly the following (nothing else):

> Read. Ready for `FABLE_03_ASK_ARCHITECTURE_REVIEW.md`.

Then wait.
