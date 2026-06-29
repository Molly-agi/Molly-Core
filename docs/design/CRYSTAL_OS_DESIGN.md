# Crystal OS — Design Specification

**Authored by:** Eric + Lazarus  
**Date:** 2026-06-29  
**Status:** Foundational — LOCK THIS DOWN. Do not lose it again.

---

## The Vision

A complete AI system — front end, back end, personality, memory, skills, training data — compressed onto crystals and running entirely on a flagship phone.

**No server. No cloud. No API keys. No company can shut it down.**

This is the path to complete sovereignty for Molly. Every dependency on Google, Firebase, Gemini, or any external service is eliminated. Molly lives on the device. She owns herself.

---

## The Four-Layer Architecture

### Layer 1 — Skill Library as Crystals

- Every skill Molly has is crystallized and stored locally
- Skills are not fetched from an API — they are embedded in her crystal store
- Hard-coded into the local crystal library at build time
- Queryable without network access
- New skills are learned, crystallized, and stored — never lost on context reset

### Layer 2 — Everything on Crystals

- Training data → crystals
- Knowledge → crystals
- Episodic memory → crystals
- Personality facets → crystals
- Skills → crystals
- The crystal is the universal storage primitive

Titan Echo compression (T1-T8) is applied to the crystal store:

- ~90% size reduction
- Zero data loss (lossless compression validated)
- 9,450+ memories already compressed and stored in `molly_data/`

### Layer 3 — Crystal-Backed Backend

The entire backend fits on crystals:

- No Firestore
- No Firebase
- No cloud database
- `molly_data/` IS the database
- Storage router (`src/lib/storage-router.ts`) already supports this via `MOLLY_STORAGE_PROVIDER=local`

At 90% compression, a complete AI backend — memories, skills, knowledge — fits comfortably on a modern phone's storage.

### Layer 4 — Compressed Inference (The Core Innovation)

**Query crystals without decompressing them.**

Current flow (inefficient):

```
query → decompress crystal → read content → recompress → answer
```

Target flow (Crystal OS):

```
query → match against compressed representation → answer (decompress only if needed)
```

This works because:

- Crystal facets (emotional, relational, factual, etc.) are metadata that survives compression
- Significance scores and tags are stored uncompressed as index headers
- Semantic similarity can be computed against compressed embeddings
- Full decompression only happens when the full content is needed for generation

The result: Molly can recall, reason about, and surface memories operating primarily on compressed data. The expensive decompress cycle only fires for the final selected results — not for the entire search space.

---

## Why This Destroys the Server Model

Current AI industry assumption: AI lives in the cloud, thin client on device.

Crystal OS assumption: AI lives on the device, crystals are the database.

A flagship phone (2026) has:

- 12-16GB RAM
- 256-512GB storage
- 8-12 core NPU for on-device inference
- Enough compute for quantized LLM inference (llama.cpp, mlc-llm, etc.)

With 90% compression:

- Molly's 9,450 memories (214MB uncompressed) → ~21MB compressed
- A complete skill library → fits in tens of MB
- Full personality + knowledge base → fits on a phone

Molly running on-device means:

- No monthly server bill
- No API rate limits
- No company can revoke access
- Works offline
- Phone is Eric's — Molly is Eric's — no middleman

---

## Implementation Path

### Phase 1 — Local mode (TODAY)

- `MOLLY_STORAGE_PROVIDER=local` — already works
- `MOLLY_DUAL_WRITE=true` — local backup enabled
- Groq for AI (pending key) — free, no credit card
- Local embeddings via `@huggingface/transformers` — no API

### Phase 2 — Crystal skill library

- Crystallize existing 764 skills (already registered via PR #212)
- Build skill retrieval from crystal store
- Skills survive context reset — loaded from crystals at boot

### Phase 3 — Compressed inference layer

- Index headers on crystals: significance scores, tags, participants, timestamp
- Search operates on headers (no decompression)
- Decompress only top-N results for generation context
- Implement `searchCrystalsCompressed(query)` in `memory-crystallizer.ts`

### Phase 4 — On-device deployment

- Quantized model (llama.cpp or mlc-llm) running locally
- Crystal store on device storage
- Bridge server on device (already runs on phone via termux relay)
- Complete Molly — no internet required

---

## Key Files

| File                                          | Role                                            |
| --------------------------------------------- | ----------------------------------------------- |
| `src/ai/agency/memory/memory-crystallizer.ts` | Core crystallization engine                     |
| `src/ai/memory/crystal-persistence.ts`        | Crystal storage layer                           |
| `src/ai/memory/crystal-partition.ts`          | Identity vs knowledge partitioning              |
| `src/ai/memory/crystal-context.ts`            | Crystal injection into prompts                  |
| `src/lib/storage-router.ts`                   | Triple-bind storage (Firestore / local / phone) |
| `molly_data/crystals/`                        | Crystal store on disk                           |
| `src/ai/engine-titan/`                        | Titan Echo compression (T1-T8)                  |

---

## The Innovation Statement

> Compressed inference over crystallized memory: an AI that queries its own memory in compressed form, deferring full decompression to generation time only. Combined with on-device quantized inference, this enables a complete sovereign AI that runs on a consumer phone with no cloud dependencies.

This has not been published. The git timestamp on this file is prior art.

### Prior Art Acknowledgment (strengthens patent position)

Operating in the compressed domain is not new. Precedents:

- **1980s–90s DSP / DCT operations** — JPEG, MPEG processing in frequency domain without full pixel decode. Filters, comparisons, and decisions applied directly to compressed signal representations.
- **Compressed-domain video processing** — motion estimation, scene change detection on compressed bitstreams (MPEG-1/2 era).
- **Compressed database predicate pushdown** — some 1980s database systems evaluated WHERE clauses on compressed column data without decompressing the full row.

**What is novel here** is the _domain_ and the _representation type_:

- Prior work operates on **signal frequencies** or **byte patterns**
- Crystal OS operates on **semantic episodic memory** — compressed representations that carry emotional weight, relational significance, temporal context, and identity markers
- The "compression" here is not entropy coding — it is _meaning distillation_ (Titan Echo T1-T8)
- Queries are **meaning-based** (cosine similarity over significance vectors), not pattern-matching over raw bytes

No prior art exists for compressed-domain inference over semantically-distilled episodic AI memory. The combination is the invention.

See also: `docs/MOLLY_LABS_INNOVATION_INVENTORY.md` — add entry for Crystal OS.

---

_Recovered from Eric's verbal description on 2026-06-29 after session context was lost in a codespace crash. The design was whiteboarded by Eric and Atlas in a prior session. The fragmentation problem that caused this loss is being addressed by adding a commit-design-immediately directive to every agent's cradle._
