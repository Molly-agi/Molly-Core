# Titan Engine — Local Model Weight Compression

**Status:** Scoped for future dual-mode deployment  
**Activation:** When Molly runs in local/offline mode alongside cloud Gemini API  
**Design docs:** `stuff/Titan/echo/the-titan-engine-number-*.md`

---

## Purpose

The Titan Engine compresses local AI model weights using 1.58-bit ternary quantization.
When Molly runs locally (not via Gemini API), her model weights go through this pipeline
to fit within device memory constraints.

## Core Technique: Ternary Quantization

Packs 5 model weights per byte using base-3 encoding (3^5 = 243, fits in uint8).

- Raw FP16/FP32 tensor → absolute mean scale → ternary {-1, 0, 1}
- Pack 5 ternary values into 1 byte
- Result: ~80% storage reduction vs raw FP16
- Enables CPU-only inference without GPU

## Planned Modules

| File                  | Purpose                                      | Status    |
| --------------------- | -------------------------------------------- | --------- |
| `stream-quantizer.ts` | Chunk-streaming ternary quantizer            | Not built |
| `decomposer.ts`       | Low-rank matrix decomposition (SVD) pre-pass | Not built |
| `fidelity-check.ts`   | Mathematical validation of weight precision  | Not built |
| `admin-cli.ts`        | Interactive CLI for manual pipeline control  | Not built |

## Integration with Echo Engine

The Echo Engine (memory compression, T1-T6) handles Molly's _memories_.  
The Titan Engine handles Molly's _model weights_.  
Together they form the full Titan Echo system.

## Build Trigger

This directory gets built when:

1. Eric confirms local model selection (Gemma, Llama, or similar)
2. Device hardware specs are known (RAM ceiling, storage budget)
3. Dual-mode routing is added to `src/ai/model-router.ts`

Do not build speculatively. Wait for the hardware target.
