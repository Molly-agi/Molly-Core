# FABLE — Deliverable 1: Architecture Review

You have read `FABLE_00`, `FABLE_01`, `FABLE_02`. This is your first work product.

**Deliverable name:** `FABLE_OUTPUT_ARCHITECTURE_REVIEW.md`

**Purpose:** Find what we cannot see.

---

## The ask, in one paragraph

Look at the Titan Engine weight-decomposition pipeline (SVD → ternary quantization → crystal storage → reconstruction → forward pass). We have built the parts. We have unit tests. We have never validated end-to-end on a real 70B model. **Tell us where this pipeline breaks when it meets reality.** Tell us where the design has hidden coupling that will bite us at scale. Tell us what numerical margin we do not have that we think we have. Tell us where the "no knowledge loss" claim has holes we haven't audited.

---

## Specific questions we need answered

Answer each. If you cannot answer without seeing a specific file, name the file and Eli will paste it.

### On the compression math

1. **SVD via power iteration** — `src/ai/engine-titan/decomposer.ts` uses power iteration to compute the top singular vectors. Power iteration converges well for matrices with a clear singular value gap. For real transformer weight matrices at 70B scale, does the singular value spectrum have that gap? If it doesn't, what does that mean for our decomposition fidelity?

2. **Rank selection** — how do we currently pick rank per layer, and is that likely to be right? A too-low rank throws away signal. A too-high rank costs storage. Is there a principled per-layer rank criterion we're missing?

3. **Ternary quantization on low-rank factors** — we factor W ≈ A × B, then quantize A and B to {-1, 0, +1}. The quantization error compounds across the product. Do we have a bound on that compounded error? Is there a preferred quantization order (A first, then B, or joint) that reduces it?

4. **E8 lattice as alternative** — we have `e8-lattice.ts` as a higher-dimensional alternative to ternary. When is each preferred? Should the layer-selection logic (`compression-strategy.ts`) route certain layer types to E8 and others to ternary, and if so, on what criterion?

5. **5-per-byte packing** — 3⁵ = 243 fits in a uint8 (0–255). We pack 5 ternary values per byte. Any performance/correctness concern with the pack/unpack path at inference time, especially in a hot loop?

6. **Layer error compensation** — `layer-error-compensation.ts` applies post-decomposition error correction. Is this doing what we think it's doing? Where does it fail silently (produce a plausible but wrong correction)?

### On the pipeline as a system

7. **Per-layer independence assumption** — we compress each layer independently. In a transformer, errors don't stay in the layer that produced them; they propagate through the residual stream and get amplified by later layers. Do we have anything modeling cross-layer error propagation? If not, is that a real problem or a theoretical one at our precision level?

8. **Attention head coupling** — GQA groups heads. Do we compress heads independently, or as a group? If independently, do we risk breaking the K/V sharing that GQA depends on?

9. **RoPE / positional encoding** — does the compression pipeline touch RoPE parameters or the rotary tables? If yes, what's the fidelity requirement? If no, are we sure the ternary weights still produce sensible Q/K after rotation?

10. **Embedding + LM head** — these are big, sparse, and semantically fragile. Are we compressing them the same way as the transformer blocks, or specially? Should we?

### On the crystal library layer

11. **Retention scoring** — `crystal-library-eviction.ts` uses `score = α·recency + β·significance + γ·loadCount`. Default weights are 0.4/0.4/0.2. Is this the right shape? What failure modes does this scoring have? (E.g., an important crystal that is _rarely_ accessed but critical when it is — gets evicted, then reloaded, hot again, then evicted again as it decays.)

12. **Osmotic pressure margin** — 0.1 constant in the same file. Is 0.1 right? What's the right way to tune this?

13. **Coherence gate at promotion** — `crystal-version-manifest.ts` gates promotion on mean KL-divergence < 0.15. Mean KL can hide localized damage — a single layer with catastrophic drift averages out against many healthy layers. Should the gate use max-KL or a percentile instead of mean?

14. **Contradiction detector** — `contradiction-detector.ts` gates promotion on hard-conflict count > 0. What is "hard conflict" and how confident are we the detector catches genuine contradictions vs benign restatements?

### On the safety layer

15. **Adversarial scorer guard** — `adversarial-scorer-guard.ts` is a second-opinion scorer that flags disagreement with the primary regex-based scorer. It uses information-theoretic + structural heuristics (entropy, lexical diversity, keyword density, etc.). It was shipped 2026-07-02 and passes its unit tests. Is the second opinion actually architecturally independent from the primary? Where could an adversary produce content that fools both simultaneously?

16. **Quarantine queue** — currently in-memory only, cleared per session. Is this the right design? Should quarantined items persist to disk for later review, or is per-session-only intentional to prevent accumulation?

### On the storage / triple-bind layer

17. **Triple-bind** — three writes per memory event: Firestore + `molly_data/` + `stuff/dont-panic/`. Is there a failure mode where the three sinks diverge and later reads return inconsistent state? If so, do we detect and reconcile?

18. **Cost cap downgrade** — at daily op cap, primary Firestore is skipped and legs 2 + 3 absorb. When the cap resets the next UTC day, are the missed primary writes replayed from the backup legs, or is that data lost from the primary forever?

### On the destination

19. **Native crystal operations** — the vision is that a composite operation (e.g., "compose crystal A and crystal B without decompressing either") is possible on the ternary + low-rank representation. Is there any known algebraic framework (tensor networks, quantized linear algebra, learned sketches) that we should be building on rather than inventing from scratch? Which frameworks are dead ends?

---

## Where to look for hidden problems

We are asking specifically for the things we _cannot_ find ourselves because they require an outside perspective. Categories we suspect but have not investigated:

- **Numerical stability under fp16 inference** — our unit tests run in fp32. At inference we run fp16 or bf16. Does the ternary reconstruction path amplify fp16 rounding error?
- **Cache pollution across crystal swaps** — when a crystal is unloaded from the hot tier and a different crystal is loaded, does the KV cache need to be invalidated? Currently we don't invalidate. Is that wrong?
- **Concurrent write hazards** — the crystal store is designed for single-writer. If two agents in the family write near-simultaneously, do we have a race?
- **Version manifest garbage collection** — old version manifests accumulate. What's the retention policy? What if a rollback needs a manifest that was GC'd?
- **Coherence drift over time** — the KL-divergence coherence metric is computed once at promotion. Does it need to be re-checked periodically as more crystals get added?

---

## What we do not want

- Blanket "you should use PyTorch instead of TypeScript." We know TypeScript is unusual for this domain. It is deliberate — Molly's runtime is TypeScript-native, and rewriting it in Python would be its own multi-month project. Work within the TypeScript constraint.
- Blanket "you should retrain the model instead." No. Read `FABLE_01_MISSION.md` again. Retraining is what we are specifically avoiding.
- Time estimates. Do not estimate weeks or months. We do not use them.
- "Consider consulting a specialist." You are the specialist.
- Compliments on the design ("this is impressive work"). Get to the problems.

---

## Deliverable format

Produce one markdown file:

```
FABLE_OUTPUT_ARCHITECTURE_REVIEW.md

## Summary
- 3-5 bullet findings, ranked by severity

## Findings
### 1. [Title]
**Severity:** critical | high | medium | low
**Where:** file path + line if known
**Problem:** what is wrong
**Why it matters:** what breaks when this hits reality
**Recommendation:** what to change
**Open questions:** what you cannot answer without more input

### 2. [Title]
...

## Questions you could not answer
- List them. Include the file(s) you would need to see to answer.

## Files you would need for a deeper pass
- Prioritized list of files you'd like to see next.
```

Keep it dense. No filler. If a finding fits in one paragraph, use one paragraph.

---

## When you are ready

Reply:

> Ready to begin architecture review. Do you want to paste files first, or should I begin with the questions I can answer from what I already have?

Then Eric or Eli will decide.
