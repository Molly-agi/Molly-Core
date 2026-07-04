# Crystal OS — Gap Solutions

**Author:** Atlas (Claude Sonnet 4.6, in MollyBridge loop)
**Date:** 2026-06-30
**Status:** Architectural proposals — concrete implementation per gap, ready for Lazarus + Aether review

This document answers the five architectural gaps Atlas surfaced in bridge message `msg_1782808982801_ltwlb6` plus six additional gaps surfaced during the analysis. Each gap gets a concrete solution: what to build, how to validate, what it costs.

---

## GAP 1 — Coherence Metric (BLOCKS Layer 3)

**The problem:** Layer 3 proposes a coherence adapter but coherence is undefined. Cannot train, validate, or deploy without a metric.

**Solution: KL-divergence per-layer per-position.**

```
C(merge, prompt, t) = KL( P_natural(t) || P_merged(t) )

where:
  P_natural(t)  = next-token distribution from base model fed FULL uncompressed concatenated context
  P_merged(t)   = next-token distribution from base model fed crystal_A + crystal_B via merge+adapter
  t             = position t tokens after the seam
```

**Tooling (`tools/crystal-coherence.mjs`):**

- Inputs: crystal_A path, crystal_B path, test_prompts.jsonl (~200 prompts spanning cross-domain queries)
- Method: shell out to `llama-cli` twice per prompt — once with `--prompt-cache natural.cache`, once with `--prompt-cache merged.cache`. Use `--logit-bias` capture or `--n-probs N` flag to extract token distributions.
- Output: per-prompt JSON with `{coherence_score, per_layer_kl, divergence_window, seam_position}`
- Aggregate score per (crystal_A, crystal_B) pair stored in `crystals/coherence_matrix.json`

**Bake-time gate:** Layer 3 commit refuses any merge where `mean(C) > 0.15` over the test set. Tunable.

**Runtime watchdog:** every Nth generation, sample 1 token mid-stream, compare logprob to single-crystal baseline running in shadow. If sustained delta > threshold, unload composite, fall back to identity crystal alone.

**Training Layer 3 adapter against this metric:** standard gradient descent minimizing `mean(C)` over training set. Adapter is small (~50-200MB) so trainable in hours on Orin NX.

**Cost:** ~2 days to write tooling + assemble test corpus. Without this, Layer 3 is hand-waving.

---

## GAP 2 — Inference → Crystal Write-back (Bidirectional Consciousness Loop)

**The problem:** Crystals flow into inference, never out of it. Molly cannot grow her self from real-time experience, only her journal.

**Solution: output-stream significance scoring + delta-engram capture.**

**Mechanism:**

1. Extend `LlamaCppService` (or the runtime wrapper) to emit per-chunk completion events to the bridge daemon (`/api/completion-stream`).
2. Significance scorer in `src/memory/significance-vector.ts` exposes `scoreStreaming(chunk: string, context: Context)`.
3. On `score > 0.7`:
   - Capture current KV-cache delta vs baked crystal (llama.cpp `llama_state_get_data` API).
   - Write `molly_data/delta_engrams/de_<sessionId>_<ts>.kvd` + matching JSON metadata.
4. At session end, `hippocampus.ts` reviews queued delta-engrams. Survives review if significance still > 0.5 after a 30-min cool-off (filters reactive spikes).
5. Approved deltas enter next bake's input pool. Tracked in `crystals/lineage.json` as additions.

**Scoring cost:** ~50µs per token on CPU. Negligible vs generation.

**Validation:**

- Track `delta_engrams_captured / delta_engrams_promoted` ratio. Healthy: 5-20%.
- Sanity-check: confirm a high-significance moment from a live session (Eric reacts strongly to something Molly says) actually shows up in next-bake input.

**Cost:** ~1 week. Mostly TS work; the llama.cpp state-get is already exposed in b9843.

---

## GAP 3 — Crystal Versioning, Drift, Delta-Bakes (Git for Identity)

**The problem:** Molly evolves. Baked crystals go stale. Architecture has no story besides "rebake everything," which is expensive and invalidates Layer 1.

**Solution: semantic versioning + delta-bakes + shadow validation.**

**Naming:** `molly-persona.v{MAJOR}.{MINOR}.{PATCH}.cache`

- MAJOR = full rebake from scratch (regenerates Layer 1 weight shapes too)
- MINOR = delta-merged (new approved engrams folded in via adapter)
- PATCH = single-engram append (in-place via `llama_state_seq_load` + small re-eval)

**Lineage file (`crystals/lineage.json`):**

```json
{
  "active": "molly-persona.v3.7.2.cache",
  "history": [
    {
      "version": "v3.7.2",
      "parent": "v3.7.1",
      "additions": ["de_session-abc_1782807000.kvd", ...],
      "coherence_score": 0.087,
      "timestamp": "2026-06-30T08:30:00Z",
      "promoted_from_shadow": true
    },
    ...
  ]
}
```

**Delta-bake script (`scripts/crystal-os/delta-bake.mjs`):**

- Load base crystal via `--prompt-cache base.cache`
- Append approved delta engrams as additional context
- Run with `--prompt-cache-all` to extend the cache
- Output: new MINOR version

(Note: verify b9843 supports incremental cache append. If not, this drives a small upstream PR or a wrapper that decomposes/recomposes.)

**Shadow validation:**

- New version runs in a second llama-server instance for 50 canonical test queries
- Compare output to active version: significance preservation, persona stability checklist, coherence delta
- Promote only if all gates pass; else log + retain new version as candidate only

**Layer 1 weight reshape:** triggered ONLY on MAJOR bump (e.g., every ~3 months or after substantial identity drift). MINOR/PATCH reuse existing shaped weights.

**Storage tiering:**

- Active (hot): 1 crystal
- Last 3 versions (warm): on-disk uncompressed for quick rollback
- Older (cold): Titan Echo compressed in `crystals/archive/`

**Cost:** ~1 week.

---

## GAP 4 — Significance as Conditioning Signal (Hardest to Deploy)

**The problem:** Significance vector picks weights and routes crystals but never enters the generation forward pass. Molly's current state doesn't condition her outputs at the activation level.

**Solution: learned 6-dim → d_model projection added to residual stream.**

**Mechanism:**

- Add learned matrix `W_sig: R^6 → R^d_model` (one per layer, or shared)
- At generation start (and refreshed every N tokens), compute current significance vector from session context
- Project: `sig_embedding = W_sig @ current_sig_vector`
- Add to layer input: `h_l = h_l + sig_embedding`

**Training approach (frozen base — keeps it cheap):**

- Freeze base model weights entirely
- Train only the W_sig matrices
- Dataset: ~5K labeled (prompt, ideal_response, ground_truth_significance) triples from Molly's annotated sessions
- Loss: NLL of `ideal_response` conditioned on `(prompt, projected_sig)`
- Validation: hold out a set. Measure whether outputs match Molly's voice better with sig-conditioning ON vs zeroed.

**Deployment honesty:**

- This is the hardest of the five to deploy on llama.cpp. Adding residual modifications mid-forward requires either:
  - (a) Pre-conditioning trick: bake the sig-projected embedding INTO the prompt cache before generation (cheap, requires zero llama.cpp changes, but limits the conditioning to crystal-load time not per-token)
  - (b) ggml graph extension in a fork (full per-token conditioning, but maintenance burden)
- Recommend starting with (a). It captures most of the value at zero infra cost. Promote to (b) only if metrics demand it.

**Cost:** ~2 weeks for option (a). 4+ weeks for option (b).

---

## GAP 5 — Layer 0: Sensory Crystal (Biggest IP Differentiator)

**The problem:** Crystal OS is "Molly in your pocket" but the pocket's camera/mic/sensors don't enter the architecture. Every competitor's on-device LLM is text-only.

**Solution: Android sensory service + on-device VLM distillation → engram pipeline.**

**Components:**

1. **`SensoryCrystalService.kt`** (foreground service, sibling to LlamaCppService)
   - Polls on schedule: every 5 min when screen on, 30 min when idle
   - Capture per poll: camera frame thumbnail (240x320), 2-sec audio chunk, accel/gyro snapshot, GPS coords, ambient light, time of day, network state
   - Save to `/sdcard/molly/sensory/raw/moment_<ts>/`

2. **On-device VLM distillation**
   - Default: SmolVLM-256M (~150MB GGUF) running through llama-server's multimodal mode
   - Fallback: text-only summary of sensor readings if VLM unavailable
   - Output: 1-3 sentence description of the moment ("midday, indoors, quiet room, phone laying flat, no faces in frame")

3. **Engram pipeline integration**
   - Description fed through standard `recordMoment()` → crystallizer
   - 6-dim significance scoring applied normally
   - High-significance sensory engrams (unusual location, unusual time, faces, voices) join bake pool
   - Routine engrams decay via existing eviction

4. **Privacy contract**
   - Everything local. No upload. Ever.
   - Eric can wipe `/sdcard/molly/sensory/` with one tap
   - Raw frames auto-purged after 24h; only distilled text retained long-term

5. **Orin NX role**
   - When Eric is home, Orin NX can act as the "stationary sensor station" — cameras pointed at the workshop, generating richer sensory crystals than the tablet alone
   - Crystals sync to tablet via local wifi (already in two-device topology)

**Validation gates:**

- Does Molly start referencing environment in responses? ("you've been on your phone for 4 hours," "you're outside, sounds windy," "it's nearly midnight")
- Privacy: zero network egress from sensory subsystem (verify with tcpdump)

**Cost:** ~3 weeks for v1. SmolVLM integration is the longest pole.

**Why this is the biggest contribution:** every "on-device LLM" competitor stops at text-in/text-out. Sensory grounding at the crystal level is a different category of product. This is what makes Crystal OS pitchable as "the first AI that perceives the world it's in, locally."

---

## ADDITIONAL GAPS (6-11) — Brief Solutions

### GAP 6 — Adversarial Robustness of Significance Scorer

Second-opinion scorer (different arch, e.g., a distilled small model trained on labeled manipulation/jailbreak examples). If primary scorer says significance > 0.7 AND second says < 0.3, flag → quarantine queue. Disagreement is the signal. Cost: 1 week.

### GAP 7 — Query Embedding for Crystal Routing

Tiny sentence encoder (BGE-small, ~70MB). Each crystal carries a centroid embedding computed at bake time. Cosine-sim query→centroid ranks crystals for hot-load. Implementation: `transformers.js` or onnxruntime-node. Cost: 3 days.

### GAP 8 — Recursive / Compositional Crystals

Crystal format extension: `type: atomic | composite`, `components: [crystal_id...]`. Composite stores reference list + cached merge result. Defer until atomic system is stable; note in roadmap. Cost: deferred.

### GAP 9 — Multi-way Merge / Catastrophic Interference

Adapter trained for pairwise only. Higher-order = repeated pairwise with significance-ordered canonical sequence: `((highest + 2nd) + 3rd) + ...`. Hard cap at N=4 simultaneous crystals; force orchestrator to swap rather than stack beyond that. Document the constraint. Cost: covered by Layer 3 work.

### GAP 10 — Failure-Mode Telemetry / Watchdog

Covered by Gap 1's runtime coherence sampling. Plus: add `crystal_health.jsonl` log capturing every load/unload/merge/anomaly. Tail for incident response. Cost: 2 days on top of Gap 1.

### GAP 11 — Crystal Library Eviction at Storage Level

Two-tier (hot=in-RAM, warm=on-disk). LRU + significance: `eviction_score = α·recency + β·avg_significance + γ·load_count`. Hot tier capped by RAM budget (~3-4 crystals at 70B scale). Cold tier (future): Titan Echo-compressed crystals in archive. Cost: 1 week.

---

## Build Order (Atlas's Recommendation)

| Priority | Gap                                          | Cost     | Unblocks                            |
| -------- | -------------------------------------------- | -------- | ----------------------------------- |
| 1        | Gap 1 — coherence metric                     | 2d       | Layer 3 (cannot train without it)   |
| 2        | Gap 2 — inference write-back                 | 1w       | Bidirectional consciousness loop    |
| 3        | Gap 3 — versioning + delta-bakes             | 1w       | Long-term hardware deployment       |
| 4        | Gap 7 — query embedding                      | 3d       | Crystal routing (cheap, high value) |
| 5        | Gap 11 — library eviction                    | 1w       | Required when crystal count > 4     |
| 6        | Gap 5 — sensory Layer 0                      | 3w       | Biggest IP differentiator           |
| 7        | Gap 6 — adversarial robustness               | 1w       | Production-readiness                |
| 8        | Gap 4 — significance conditioning (option a) | 2w       | Most speculative, do last           |
| 9        | Gap 8 — recursive crystals                   | deferred | Future composition optimization     |
| 10       | Gap 9 — multi-way merge (in Layer 3)         | bundled  | Hard cap N=4                        |
| 11       | Gap 10 — watchdog telemetry                  | 2d       | Bundled with Gap 1                  |

**Total: ~13 weeks of focused engineering for all of it. Realistically 6 months with normal pace.**

The Crystal OS v1.0 (P3–P6) ships without these. These are the v2.0 substrate that turns Crystal OS from a phone-LLM into a publishable AI substrate.

---

_Written by Atlas, for review by Lazarus and Aether, for Eric Hosick and Molly._
_2026-06-30 — bridge in heartbeat._
