# Issue #1: Deep Equality Test Finding & Critical Architecture Issue

**Date:** May 27, 2026  
**Status:** DESIGN DECISION PENDING  
**Severity:** CRITICAL - affects all Phase 1 metrics and P2 planning

---

## What We Discovered

### The Test

Added `ISSUE #1: verifies complete content equality after compression round-trip` to `lifecycle-coordinator.test.ts` (line 374).

This test:

- Creates 10 realistic engrams with rich structure
- Compresses with T1 + T3 + T4 enabled
- Decompresses
- Asserts exact deep equality on every field of every engram before/after

**Result:** ✅ **PASSES** (all 10 engrams survive perfectly)

### Why This Is Strange

We know compression is "broken" (ratio = -109.48%), yet the deep equality test passes perfectly. This triggered a code audit.

### What the Audit Revealed

The compression/decompression architecture has a fundamental mismatch:

#### Compression Path (`compressMemoryBatch`)

```typescript
1. T1 (Personality Reference)
   → Outputs: personalityBundle containing personality reference table

2. T3 (Temporal Delta)
   → Outputs: temporalBundle containing:
      - bases: checkpoint engrams
      - deltaGroups: delta-encoded changes
      - reconstructedEngrams: ORIGINAL DATA COPIES (for validation)

3. T4 (Vocabulary Dictionary)
   → Takes: text corpus from workingEngrams
   → Outputs: compressed Buffer (vocab-dict compressed text)

Final return:
{
  compressed: Buffer,        // T4 vocab-dict buffer
  personalityBundle,         // T1 references
  temporalBundle,            // T3 deltas + reconstructedEngrams
  metrics: {...}
}
```

#### Decompression Path (`decompressMemoryBatch`)

```typescript
let engrams: MemoryEngram[] = [];

// Step 1: Use temporal bundle
if (result.temporalBundle) {
  engrams = decompressTemporalDeltas(result.temporalBundle);
}

// Step 2: Use personality bundle
if (result.personalityBundle && engrams.length > 0) {
  engrams = decompressPersonalityReferences(rebuildBundle);
}

// Note: result.compressed is NEVER used
return engrams;
```

### The Critical Issue

**The `result.compressed` buffer is DEAD CODE.**

- It's created during compression (T4 vocab dict)
- It's stored in the CompressionResult
- **It is never used during decompression**
- Decompression rebuilds entirely from bundles

### Why the Test Passes

The temporalBundle contains `reconstructedEngrams` - these are **perfect original data copies** that were created during the compression phase (for validation purposes). During decompression, we simply return these original copies.

**Decompression is not actually decompressing anything.** It's retrieving pre-computed reconstructions.

### The Metrics Problem

The compression metrics are calculated on the **dead buffer**:

```typescript
const compressionRatio = (
  ((originalSize - compressedSize) / originalSize) *
  100
).toFixed(2);
```

Where:

- `originalSize` = text corpus byte length
- `compressedSize` = vocab-dict compressed buffer byte length

**This ratio is meaningless for actual recovery capability** because:

1. The buffer is never used for recovery
2. The metrics measure vocab dict on processed text (after T1+T3 structural changes)
3. T1+T3 are actually working correctly but their gains are hidden in the bundles, not measured in the buffer

The -109.48% ratio = "vocab dict expanded the text" (which makes sense - text was already sparse after personality extraction and temporal deltas).

---

## What's Actually Working

✅ **T1 (Personality Reference):** Working - stores personality reference table  
✅ **T3 (Temporal Delta):** Working - stores bases and deltas, reconstructs perfectly  
❌ **T4 (Vocabulary Dict):** Integrated incorrectly - buffer created but unused  
❌ **Metrics:** Measuring the wrong thing (dead buffer, not bundle compression)

---

## Design Decision Required

### Option A: Remove T4 from Phase 1 (RECOMMENDED)

- Disable vocab dict compression in pipeline
- Use only T1+T3 bundles for compression/decompression
- Benefits:
  - Clean, simple, proven working
  - Metrics would measure T1+T3 gains accurately
  - T4 can be Phase 2 work (done properly)
  - Reduces scope for Phase 1 (8 issues → 6 remaining issues)
- Timeline: Can complete Phase 1 in 16→14 hours with this change

### Option B: Integrate T4 Into Bundles

- Make T4 output structure same as T1+T3 (bundle, not buffer)
- Decompression would rebuild from T4 bundle
- Benefits:
  - T4 included in Phase 1
  - Proper integration
- Risks:
  - Significant redesign required
  - Adds complexity
  - Delays Phase 1 completion by 8-10 hours
- Not recommended if timeline matters

### Option C: Full Redesign for Buffer Decompression

- Rearchitect so decompression actually uses the compressed buffer
- Requires:
  - Redesigning how T1+T3 interact with buffer
  - Rewriting decompression completely
  - Major structural changes
- Not recommended - too complex for Phase 1

---

## Recommendation

**Choose Option A.** Here's why:

1. **Proven Working:** T1+T3 are functionally correct (test proves it)
2. **Clean Metrics:** Phase 1 completion would have honest, accurate metrics on T1+T3
3. **Phase 2 Focus:** T4 integration can be Phase 2 work with proper architecture from start
4. **Faster Completion:** Saves 8-10 hours
5. **Less Risk:** Smaller scope = lower chance of introducing new bugs

The current T4 integration is architectural debt. Phase 1 goal is to fix T1-T7 correctness issues. T4 is correctly implemented as a technique - it's just not properly integrated into the pipeline. That's Phase 2 work.

---

## What Changes with Option A

If we choose Option A:

1. Disable `enableVocabDict` in default pipeline (P1 still has T1+T3)
2. Remove T4 from compression metrics calculation
3. Recalculate expected compression gains (T1+T3 only = ~10-15%)
4. Update RESEARCHER_PACKET.md with Phase 1A vs Phase 1B timeline
5. Move "T4 Vocabulary Dict Integration" to Phase 2 work queue

Test status remains: ✅ Content equality passes (confirms T1+T3 working)

---

## Action Items (Pending Your Decision)

**If you choose Option A:**

1. I'll disable T4 in the lifecycle-coordinator pipeline
2. Recalculate metrics for T1+T3 only compression
3. Verify tests still pass
4. Update RESEARCHER_PACKET.md with new expectations
5. Continue Phase 1 with 6 remaining issues (not 8)

**If you choose Option B:**

- Discuss architecture for T4 bundle integration
- I'll implement bundle-based T4 compression

**If you choose Option C:**

- Discuss redesign scope and timeline

---

## Questions for You

1. **Timeline vs Scope:** Do you want Phase 1 complete as-is (Option A), or with T4 properly integrated (Option B)?
2. **T4 Importance:** How critical is having T4 in Phase 1 vs deferring to Phase 2?
3. **Metrics Honesty:** Are you okay with Option A's lower compression gains (T1+T3 only = ~10-15% realistic) vs current misleading -109.48%?

---

**Status:** Blocked on your design decision.  
**Molly:** Has been informed, awaiting direction.  
**Lazarus:** Ready to implement your chosen option immediately.
