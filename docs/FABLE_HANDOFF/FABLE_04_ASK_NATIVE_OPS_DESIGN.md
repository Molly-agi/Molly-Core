# FABLE — Deliverable 2: Native Crystal Operations Design

You have read `FABLE_00`, `FABLE_01`, `FABLE_02`, `FABLE_03`. This is the biggest ask.

**Deliverable name:** `FABLE_OUTPUT_NATIVE_OPS_DESIGN.md`

**Purpose:** Design the geometric layer that lets us operate on crystallized data without ever reconstructing the underlying weights.

**This is the destination Eric describes in the mission statement.** It has never been built. It is the layer that turns Crystal OS from a delivery system into a computing substrate.

---

## The problem

Today, running a forward pass on a compressed transformer layer requires:

1. Load compressed factors `A` (m × r) and `B` (r × n), both ternary-packed.
2. Unpack ternary bytes into ternary values.
3. Dequantize ternary values into fp16/fp32 with the layer's scale factor.
4. Compute `W_reconstructed = A_float × B_float`.
5. Compute output `Wx = W_reconstructed × x`.

**Steps 2–4 defeat the point.** Every forward pass materializes the full W in memory. The compression buys storage, not compute. And any operation that "combines" two crystals (Gap 8) requires reconstructing both, doing the combination in float space, then re-compressing.

## The vision

**Steps 2–4 disappear.** The forward pass reads ternary bytes and produces `Wx` directly, without ever materializing `W` or its float factors. Composing two crystals produces a new crystal representation whose semantics equal the composition of the originals, without any float intermediate.

Concretely, you want:

- **native_matvec(A_ternary, B_ternary, scale, x) → y** — compute `(A · B · x)` without reconstructing.
- **native_compose(crystal_1, crystal_2, semantic) → crystal_composite** — produce a new crystal that represents the composition (function composition? averaging? conditional selection?) of the inputs, without float reconstruction.
- **native_query(crystal_library, query_vector) → ranked_crystals** — score crystal relevance to a query in the crystal representation, not by decompressing then embedding.

---

## What we know

- The compressed form is **ternary values {-1, 0, +1} plus a per-tensor scale factor**, packed 5 values per byte (3⁵ = 243 fits in uint8).
- The pre-quantized form is **two low-rank factors A (m × r) and B (r × n) from SVD**, so rank r is small (typically r ≪ min(m, n)).
- **E8 lattice quantization** is an alternative representation for some layers (see `e8-lattice.ts`), which quantizes 8-dimensional blocks onto the E8 root lattice instead of scalar ternary.
- Molly's base model is **3B params**. The composited crystals should extend her behavior to something closer to a 70B model. So most weight matrices are on the order of thousands × thousands, ranks in the hundreds.
- Runtime is **TypeScript on Node.js**. Not CUDA. Not Python. We can call out to native code via N-API if needed, but the primary language of orchestration is TS.

---

## Why this is possible in principle

Ternary arithmetic has algebraic structure that dense float arithmetic destroys. Some observations:

- Multiplying by a ternary value is a signed conditional pass-through, not a floating-point multiply. It is bitwise-computable.
- The product of two ternary values is a ternary value: {-1, 0, +1} × {-1, 0, +1} → {-1, 0, +1}. So the intermediate matrix `AB` before scaling _has ternary-like structure_ if A and B were ternary. That structure can be exploited.
- Low-rank plus ternary means `y = A · (B · x)` can be computed as two matvec passes where each pass is an accumulator over ternary-conditional adds of vectors — no multiplies at all in the inner loop.
- The scale factor is a single float applied at the end.

These are known techniques in extreme-quantization ML (BitNet, 1.58-bit LLMs, ternary neural networks). What is **not** widely known is how to compose these operations across many crystals without going back to float.

---

## What we do not know

- Whether "native compose" is even mathematically well-defined for the operations we care about. What does it _mean_ to compose two crystals that represent different fine-tunes of the same layer?
- Whether the composition primitive should be linear (crystal averaging), gated (crystal switching per input), or something structural (concatenating rank).
- How to represent the _type_ of a crystal so the compose operation can validate compatibility statically.
- Whether the "hot tier" architecture (max ~3-4 crystals resident) is compatible with a native compose that produces new crystals dynamically (does the composite get its own hot slot?).

---

## Specific questions we need answered

1. **native_matvec in ternary space** — what is the fastest correct algorithm for computing `A · B · x` where A and B are ternary low-rank factors, in a JavaScript/TypeScript-hostable form? Pseudocode is enough. If a WASM/N-API kernel is required, say so and specify what the kernel signature should be.

2. **native_compose semantics** — enumerate the reasonable meanings of "composing" two weight-crystal representations of the same underlying layer:
   - Linear average (a + b) / 2 — what does this represent semantically?
   - Weighted mixture (α·a + β·b) — how do we pick α, β?
   - Sequential apply — treat A as a base and B as a delta?
   - Task-conditional switch — pick a or b based on an input feature?
   - Rank concatenation — [A|B] with combined rank r_a + r_b?
     For each, describe: (a) mathematical definition, (b) does the ternary form support it natively (no decompress), (c) what use case does it serve.

3. **Crystal type system** — propose a minimal type-annotation for weight crystals that captures: dimensions, rank, quantizer (ternary vs E8), source layer role (attention Q/K/V/out, FFN gate/up/down, embedding, LM head), and semantic tag (base, fine-tune, adapter, delta). Just enough to make `native_compose` a type-safe operation.

4. **Composite crystal storage** — a `native_compose` produces a new crystal. Is it stored (adds to library, costs storage) or computed on the fly (costs recompute)? If stored, does it invalidate when its components update? If computed, is there a caching layer?

5. **Interaction with the hot-tier eviction** — the library has a hot/warm split with retention scoring. Do composite crystals count as one slot or as many (their component crystals)? Does the eviction policy need to know about composition structure?

6. **Query in crystal space** — Gap 7 (crystal routing) embeds queries into a float vector space and compares to a crystal's centroid embedding (also float). This is not native. Is there a native-space query mechanism where the query itself is crystallized and matching is a ternary-space operation? If yes, propose it. If no, is float-space query a permanent seam or can it be eliminated later?

7. **When does native ops beat reconstruction?** — for what sizes (m, n, r) and access patterns does native matvec actually beat "reconstruct once, cache the float W, reuse"? Give us the crossover analysis. It is entirely possible that native ops is a loss for hot crystals and only a win for warm crystals accessed once.

8. **E8 vs ternary in native ops** — if some layers use E8 and others ternary, does `native_compose` work across the boundary, or must the two layers use the same quantizer? What's the tradeoff?

---

## Constraints — hard

- **No decompression path.** The design must not include "well, in this case we just decompress." If a fallback is unavoidable, it must be documented as a failure mode, not a feature.
- **TypeScript-hostable.** Native kernels are fine (WASM, N-API). Pure Python/PyTorch is not — we cannot host it in Molly's runtime.
- **Memory-bounded.** The hot tier is capped at 3-4 crystals. Native compose cannot silently expand memory.
- **Deterministic.** No stochastic sampling in the composition operation. Same inputs → same output crystal, bit-for-bit.

## Constraints — soft

- Prefer designs that compose. `native_compose(a, b, c)` should ideally equal `native_compose(native_compose(a, b), c)` — associativity is a nice-to-have.
- Prefer designs where the composite crystal's storage is smaller than the sum of components (otherwise the library grows unbounded).
- Prefer designs that degrade gracefully to reconstruction on unsupported layer types, with a loud warning.

---

## Prior art — where to look

We are not asking you to invent from zero. Point us at what already exists that we should build on. Categories to consider:

- **Ternary / 1.58-bit LLMs** (BitNet, EETQ, GPTQ variants). What do they do for native inference on ternary weights? Do they compose?
- **Tensor networks** (MPS, TT decomposition, hierarchical Tucker). Do any of them offer a native compose primitive?
- **Neural network merging** (task arithmetic, ties-merging, dare-ties). These operate on float weights. Do any have a quantized-form equivalent?
- **LoRA composition** (MoLoRA, composition of adapters, LoRA hub). Similar shape — a set of low-rank factors composed at inference time. What's transferable?
- **Learned quantization** (VQ-VAE codebooks, product quantization for retrieval). These operate natively on quantized codes. Analogous?

**If your survey finds that the natural math is "reconstruct then compose then re-quantize," say so.** That is a legitimate answer. It means the destination as stated is not achievable and Eric needs to know. Do not fake a design to avoid that answer.

---

## Deliverable format

```
FABLE_OUTPUT_NATIVE_OPS_DESIGN.md

## Executive summary
- Is the destination achievable? (yes / partial / no with reasoning)
- The 3-5 core primitives you're proposing.
- The biggest open technical risk.

## The primitives
### native_matvec
- Signature
- Algorithm (pseudocode)
- Complexity
- Hosting requirement (pure TS, WASM, N-API)

### native_compose
- Chosen semantic (from question 2)
- Signature
- Algorithm
- Correctness / associativity properties

### native_query (or: why we can't do native query)

### Crystal type system

### Storage of composite crystals

## Interaction with existing layers
- How this changes crystal-routing.ts
- How this changes crystal-library-eviction.ts
- How this changes weight-crystal-adapter.ts
- What new files are needed

## Prior art we're building on
- Papers / systems cited with 1-2 sentence relevance

## Open problems we cannot solve here
- List

## Recommended build order
- Not a schedule. An order.

## What Eli needs to know to start
```

---

## When you are ready

Reply:

> Ready to begin native ops design. I have N questions from the ask above that I can attempt with what I have; the rest I will need file [X] to answer.

Then Eric or Eli will decide.
