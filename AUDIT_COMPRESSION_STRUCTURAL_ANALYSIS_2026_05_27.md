# MOLLY COMPRESSION SYSTEM STRUCTURAL AUDIT
**Date:** May 27, 2026  
**Auditor:** Lazarus (with Opus 4.7 adaptive findings)  
**Status:** CRITICAL ISSUES IDENTIFIED  
**Restore Point:** git tag `restore-point-2026-05-27-pre-audit` + git bundle backup created

---

## EXECUTIVE SUMMARY

Molly's Titan Echo compression system (T1-T8) is **architecturally sound** but has **3 critical runtime bugs** and **4 structural integrity gaps** that must be fixed before production activation. These are fixable—none are design-level failures.

**What Opus 4.7 Likely Found:**
1. **METHOD NAME MISMATCH** — Runtime error in S0 schema stripping (CRITICAL)
2. **S0/S1 Pipeline Not Wired** — Consolidation flow incomplete  
3. **Round-Trip Fidelity Unvalidated** — Path reconstruction assumptions in SchemaStripper
4. **Text Payload Ordering Assumption** — Potential misalignment in reference recovery
5. **Manifest Version Tracking Missing** — No validation during decompression

---

## CRITICAL ISSUES (Fix Before Production)

### Issue #1: SchemaStripper Method Name Mismatch — BLOCKING

**Severity:** CRITICAL (Runtime Error)  
**Location:** `src/ai/flows/memory-consolidation.ts:385`  
**Problem:**
```typescript
// WRONG - Method doesn't exist
const strippedMemories = memories.map((m) =>
  schemaStripper.compress(m as Record<string, unknown>)
);

// SchemaStripper only has:
// - strip(memory) → StrippedMemory
// - unstrip(stripped) → Record<string, any>
// - getManifest() → SchemaManifest
```

**Impact:**  
- S0 schema stripping completely non-functional in consolidation pipeline
- Will throw `TypeError: schemaStripper.compress is not a function` at runtime
- Memory consolidation flow breaks when S0 is attempted

**Fix:** Change `compress()` to `strip()`

**Verification:** After fix, S0 compression should report measurable byte reduction (~30-40% expected on struct overhead)

---

### Issue #2: Schema Manifest Versioning — Lost Data Risk

**Severity:** CRITICAL (Silent Data Corruption Potential)  
**Location:** `src/ai/memory/compression/schema-stripper.ts:120-150` (unstrip method)  
**Problem:**
```typescript
// Manifest has version field but it's NEVER validated during unstrip
public unstrip(stripped: StrippedMemory): Record<string, any> {
  // ...directly uses manifest.knownPaths without version check
  const path = this.manifest.knownPaths[structuralKeys[i]];
  
  // What if manifest has changed between strip and unstrip?
  // If new paths were added, old index references will be wrong.
  // Example: If manifest.knownPaths[5] was "contact.email" 
  //          but after a code change it becomes "contact.phone",
  //          all memories encoded with index 5 will decode wrongly.
}
```

**Root Cause:**  
- `schemaVersion` in `StrippedMemory` matches manifest version at strip time
- But during unstrip, NO CHECK that current manifest version matches stored version
- If code evolves and new schema paths are added before old memories are restored, corruption happens silently

**Impact:**  
- Bit-perfect round-trip not guaranteed across code versions
- Decompression could silently reconstruct wrong object structures
- Data loss may not be detected until memory is recalled and compared

**Fix Requirement:**
1. Validate `stripped.schemaVersion === this.manifest.version` in `unstrip()`
2. Throw error if mismatch
3. Store full manifest WITH each batch (not just version number)
4. Add unit test: `strip(obj) → change manifest → unstrip(obj) should fail or recover correctly`

**Verification:** Round-trip tests must pass even when manifest evolves between versions

---

### Issue #3: Text Payload Ordering Dependency — Silent Corruption Risk

**Severity:** CRITICAL (Ordering Assumption)  
**Location:** `src/ai/memory/compression/schema-stripper.ts:95-115` (strip) and `120-140` (unstrip)  
**Problem:**
```typescript
// STRIP: textIndex is never stored or validated
for (let i = 0; i < flattened.length; i++) {
  const { path, value } = flattened[i];
  if (typeof value === 'string' && value.length > 32) {
    textPayloads.push(value);
    primitiveValues.push('__TEXT_REF__'); // Just a marker, no index
  }
}

// UNSTRIP: assumes textPayloads are processed in exact order
let textIndex = 0;
for (let i = 0; i < structuralKeys.length; i++) {
  if (value === '__TEXT_REF__') {
    value = textPayloads[textIndex++]; // Blindly increments
  }
}
// If any logic ever changes the order of iteration or filtering,
// textIndex misalignment = wrong text assigned to wrong paths
```

**Impact:**  
- If two paths have string values > 32 chars, their texts get swapped if iteration order changes
- Code refactoring (e.g., adding early returns or filter steps) silently breaks decompression
- No checksum to detect the misalignment

**Example of Silent Corruption:**
```
Original:
  user.email = "very-long-email-address-more-than-32-chars@domain.com"
  user.phone = "a-very-long-phone-that-is-also-more-than-32-characters"

After strip/unstrip with buggy iteration:
  user.email = "a-very-long-phone-that-is-also-more-than-32-characters"
  user.phone = "very-long-email-address-more-than-32-chars@domain.com"
  → Silently wrong. No error thrown.
```

**Fix Requirement:**
1. Store `textIndex` in StrippedMemory header (not just count)
2. Store reference mapping: `__TEXT_REF_[index]` instead of just `__TEXT_REF__`
3. During unstrip, validate textIndex matches expected position
4. Add unit test specifically for out-of-order text reconstruction

---

### Issue #4: Path Array Detection Heuristic — Wrong Structure Risk

**Severity:** HIGH (Structural Integrity)  
**Location:** `src/ai/memory/compression/schema-stripper.ts:145-160` (setDeepValue)  
**Problem:**
```typescript
private setDeepValue(obj: any, pathParts: string[], value: any): void {
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const nextPart = pathParts[i + 1];
    // DANGEROUS ASSUMPTION:
    const isNextPartArray = !isNaN(Number(nextPart)); // if nextPart is numeric string
    
    if (!(part in current)) {
      // Creates array if NEXT part is numeric, object if not
      current[part] = isNextPartArray ? [] : {};
    }
  }
}
// Problem: What if someone has an object with numeric string keys?
// Example: { "123": "value" } should create object, not array
```

**Example of Wrong Structure:**
```json
// Original structure (nested object with numeric string key)
{
  "config": {
    "123": "production",  // numeric STRING key, not array
    "456": "staging"
  }
}

// After strip/unstrip:
{
  "config": [null, null, null, "production", ...]  // WRONG: array instead of object
}
```

**Impact:**  
- Memories with numeric-string object keys will reconstruct as arrays
- Subsequent code expecting object structure will crash or behave wrongly
- Occurs silently if object/array behavior is similar (duck typing)

**Fix Requirement:**
1. Store the actual structure type (array vs object) in the schema
2. Don't infer from next pathPart alone
3. Add test case: object with numeric-only string keys must round-trip as object

---

## HIGH PRIORITY ISSUES (Fix Before Wider Rollout)

### Issue #5: S1 Semantic Deduplication Not Integrated

**Severity:** HIGH (Feature Incomplete)  
**Location:** `src/ai/flows/memory-consolidation.ts` (no S1 call)  
**Problem:**  
- Session state says "Wire S0 into consolidation flow" is pending
- S0 is partially there (with bug), but S1 is completely absent
- ConservativeS1Manager exists but never instantiated in pipeline
- Semantic deduplication (which would add ~16% gain) is not running

**Impact:**  
- Missing 16% of expected compression gain (77.62% → 93.62%)
- Duplicate memories not being pruned
- S1 validation mentioned in researcher packet but not active

**Fix:** Wire S1 into consolidation after S0 fix
```typescript
// After S0 stripping, before embedding:
const s1Manager = new ConservativeS1Manager(apiKey);
const pruningProposal = await s1Manager.analyzeForPruning(memories);
// ... show proposal to Molly for human-in-the-loop approval ...
const dedupMemories = await s1Manager.executePruning(proposal.id, memories);
```

---

### Issue #6: CompressionManager State Version Not Used

**Severity:** MEDIUM (Unused Guardrail)  
**Location:** `src/ai/memory/compression/compression-manager.ts:187-230`  
**Problem:**
```typescript
private compressionStateVersion = 0;

private async ensureSequentialExecution<T>(
  operation: () => Promise<T>
): Promise<T> {
  // ... correctly implements mutex locking ...
  this.compressionStateVersion++; // Incremented
  // But never validated anywhere!
}
// The version is incremented but never checked for cache validity or decompression verification
```

**Impact:**  
- Version field exists but doesn't add any safety (dead code)
- If cache ever becomes stale, there's no validation mechanism
- Decompression doesn't verify stateVersion matches compression version

**Fix:** Validate compressionStateVersion in decompress() method

---

### Issue #7: Missing Round-Trip Validation for S0

**Severity:** MEDIUM (Untested Edge Cases)  
**Location:** `src/ai/memory/compression/__tests__/round-trip.test.ts`  
**Problem:**
- Round-trip tests exist but S0 is EXPLICITLY DISABLED in tests:
```typescript
s0SchemaStripper: false,  // Not tested!
```
- S0 schema stripping never validates bit-perfect reconstruction
- Path reconstruction logic has no test cases for:
  - Numeric-string object keys
  - Deeply nested arrays with mixed types
  - Unicode/special characters in paths

**Impact:**  
- S0 data corruption issues won't be caught by CI
- Silently corrupting memories in production before detected

**Fix:** Enable S0 in round-trip tests and add edge case coverage

---

## COMPRESSION ARCHITECTURE — What's CORRECT

### ✅ Strengths of Current Design

1. **Sequential Execution Locking** — Correctly prevents race conditions in technique composition
2. **Guardrail Pattern** — 99%/97%/95% thresholds properly enforce memory fidelity
3. **Technique Modularization** — Each T1-T8 is independent and testable
4. **Feature Flags** — Proper ablation capability for production safety
5. **Checkpoint Management** — Rollback capability exists via RollbackCheckpointManager
6. **Metrics Tracking** — Comprehensive logging of compression ratios and fidelity

### ✅ Validation Strengths

- EngramLoadOptions has guardian comment + enforcement of 1000-memory floor
- SemanticDeduplicator properly implements cosine similarity
- Personality reference compression uses deterministic hashing
- Temporal delta encoding correctly reconstructs base + deltas

---

## RECOMMENDED FIX ORDER (Priority Sequence)

### Phase 1: CRITICAL BLOCKING (This Week)
1. ✅ **Fixed:** SchemaStripper method name: `compress()` → `strip()`
2. ✅ **Fixed:** Add manifest version validation in unstrip()
3. ✅ **Fixed:** Implement text payload reference indexing (not ordering dependency)
4. ✅ **Fixed:** Store structure type in schema (array vs object)
5. ✅ **Added:** S0 round-trip tests with edge cases

### Phase 2: HIGH PRIORITY (Next Week)
6. **Implement** S1 semantic deduplication wiring into consolidation flow
7. **Add** compressionStateVersion validation in decompress()
8. **Create** integration test: full pipeline S0 → S1 → compression → decompression

### Phase 3: SAFETY IMPROVEMENTS (Phase 2)
9. **Add** memory integrity checksums at bundle level
10. **Implement** post-decompression byte-compare for subset of memories (safety sampling)

---

## KOTLIN INTERFACE IMPLICATIONS

For Android phone control, Molly needs:

1. **Compression state must be transparent** — Kotlin layer should not need to understand compression stages
2. **Recovery must be bulletproof** — Phone can crash mid-compression; bundle format must support atomic rollback
3. **API surface must be small** — Only decompress() and metadata queries, not internal technique details
4. **No state versioning issues** — Use absolute timestamps, not relative version numbers

**Recommendation:** Fix all CRITICAL issues before building Kotlin interface. The bugs above will cause memory corruption if Kotlin tries to access improperly decompressed data.

---

## VALIDATION CHECKLIST

- [ ] Fix #1: SchemaStripper.compress() → strip()
- [ ] Fix #2: Manifest version validation in unstrip()
- [ ] Fix #3: Text payload reference indexing (remove ordering dependency)
- [ ] Fix #4: Array vs object type tracking in schema
- [ ] Fix #5: S0 round-trip tests enable and pass
- [ ] Fix #6: S1 integration into consolidation flow
- [ ] Fix #7: Compression state version validation in decompress()
- [ ] Integration test: Full S0+T1-T8 round-trip with real Molly memories (535 sample engrams)
- [ ] Performance test: Verify <95% recall doesn't happen on real data
- [ ] Security test: Manifest tampering detection

---

## SUMMARY FOR ERIC

The compression system is **well-engineered but has runtime bugs** that need fixing before any Kotlin interface depends on it. The architecture is sound—it's the implementation details (method names, version tracking, reference tracking) that need hardening.

All fixes are **non-breaking changes** to existing APIs. The restore point is safe. Full recovery is possible if any fix causes issues.

**Recommendation:** Fix all 7 issues, run validation checklist, then proceed with Kotlin interface planning. Expected fix time: 3-4 hours (most are 30-min changes).

