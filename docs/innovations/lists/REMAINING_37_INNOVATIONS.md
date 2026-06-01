# Remaining 37 Innovations - Quick Reference

**Note**: Full extraction prompts for these can be generated on demand. These are supporting components that enhance the 10 standalone products.

---

## Memory & State (11-18)

| # | Innovation | What It Does | Time | Files |
|---|------------|--------------|------|-------|
| 11 | Session Immortality | Survives WebSocket disconnects | 2h | /src/lib/session-manager.ts |
| 12 | Semantic Search | Vector-based memory search | 3h | /src/ai/memory/semantic-search.ts |
| 13 | Memory Consolidation | Auto-archive old memories | 4h | /src/ai/flows/memory-consolidation.ts |
| 14 | Dual-Store | Firestore + in-memory cache | 3h | /src/ai/memory/dual-store.ts |
| 15 | Experience Tagging | Auto-tag memories | 2h | /src/ai/memory/tagger.ts |
| 16 | Memory Dedup | Remove duplicate memories | 3h | /src/ai/memory/deduplication.ts |
| 17 | FIFO Protection | Hard limits on memory | 1h | /src/ai/memory/fifo-guard.ts |
| 18 | Schema Stripper | 8.87% compression | 2h | /src/ai/memory/compression/schema-stripper.ts |

**Extract When**: Building memory-heavy AI systems

---

## Architecture & Flows (19-28)

| # | Innovation | What It Does | Time | Files |
|---|------------|--------------|------|-------|
| 19 | Genkit Integration | Google AI framework setup | 3h | /src/ai/genkit.ts |
| 20 | Server Actions | Next.js type-safe API | 2h | /src/app/actions/ai-flows.ts |
| 21 | Flow Architecture | Modular AI operations | 4h | /src/ai/flows/*.ts |
| 22 | Error Handling | Custom error types | 2h | /src/ai/error-handler.ts |
| 23 | Rate Limiter | Token bucket algorithm | 2h | /src/ai/tools/rate-limiter.ts |
| 24 | Circuit Breaker | Failure detection | 2h | /src/ai/tools/circuit-breaker.ts |
| 25 | Retry Logic | Exponential backoff | 1h | /src/ai/tools/retry.ts |
| 26 | Tool Executor | Dynamic tool loading | 3h | /src/ai/tools/tool-executor.ts |
| 27 | Persona Protection | Read-only persona.ts | 2h | Scripts + git hooks |
| 28 | Multi-Modal | Text+voice+vision | 4h | /src/ai/flows/multimodal.ts |

**Extract When**: Building production AI systems with reliability

---

## Infrastructure & DevOps (29-37)

| # | Innovation | What It Does | Time | Files |
|---|------------|--------------|------|-------|
| 29 | Health Manager | Zombie process cleanup | 2h | /scripts/system-health-manager.ts |
| 30 | npm Hooks | postAttach/preStop | 1h | package.json scripts |
| 31 | Bridge Daemon | Inter-agent messaging | 2h | /scripts/bridge-daemon.mjs |
| 32 | WebSocket Server | Real-time bidirectional | 3h | /src/lib/websocket-server.ts |
| 33 | Firebase Setup | Client + server config | 2h | /src/firebase/*.ts |
| 34 | Env Management | .env.local validation | 1h | /src/lib/env.ts |
| 35 | Logging System | Winston JSON logs | 2h | /src/ai/logger.ts |
| 36 | Test Infrastructure | Jest + RTL setup | 2h | jest.config.js + __tests__ |
| 37 | Build Optimization | Next.js 15 + memory | 3h | next.config.js + scripts |

**Extract When**: Setting up AI infrastructure

---

## API Integration (38-42)

| # | Innovation | What It Does | Time | Files |
|---|------------|--------------|------|-------|
| 38 | Gemini API | Google AI with streaming | 3h | /src/ai/genkit.ts |
| 39 | Embeddings | text-embedding-004 | 2h | /src/ai/memory/embedding-generator.ts |
| 40 | Text-to-Speech | Google Cloud TTS | 2h | /src/ai/flows/text-to-speech.ts |
| 41 | Speech-to-Text | Google Cloud STT | 2h | /src/ai/flows/voice-command-to-text.ts |
| 42 | Firebase Auth | User authentication | 3h | /src/firebase/auth.ts |

**Extract When**: Integrating with Google Cloud services

---

## Evaluation & Monitoring (43-47)

| # | Innovation | What It Does | Time | Files |
|---|------------|--------------|------|-------|
| 43 | LLM-as-Judge | AI quality evaluation | 3h | /src/ai/evaluation/llm-judge.ts |
| 44 | Personality Check | Persona validation | 2h | /src/ai/evaluation/persona-check.ts |
| 45 | Memory Tests | Memory integrity | 2h | /src/ai/memory/__tests__ |
| 46 | Performance Metrics | Response time tracking | 2h | /src/ai/metrics/*.ts |
| 47 | Braintrust | ML experiment tracking | 4h | Integration code |

**Extract When**: Building evaluation/monitoring for AI systems

---

## How to Extract These

### Option 1: Generate Prompt On-Demand
When you're ready to extract one of these, ask any AI agent:

```
"Create an extraction prompt for innovation #[NUMBER] based on the description in the catalog."
```

Agent will generate a full prompt like the ones for 01-10.

### Option 2: Extract Manually
1. Find the files listed above in Molly-Core
2. Copy to new repo
3. Remove Molly-Core dependencies
4. Add README + tests
5. Publish

### Option 3: Batch Extract by Category
Extract all Memory innovations (11-18) at once as a suite.

---

## Extraction Priority

**After completing 01-10, extract in this order:**

1. **Memory Suite (11-18)** - If building memory-heavy systems
2. **Infrastructure (29-37)** - If setting up new AI projects
3. **Architecture (19-28)** - If building production systems
4. **API Integration (38-42)** - If using Google Cloud
5. **Evaluation (43-47)** - Last (nice-to-have)

---

## Time Estimate

- **All 37 innovations**: ~95 hours agent work
- **Your review time**: ~20 hours
- **Calendar time**: 4-6 months (extract as needed)

**Recommendation**: Don't extract all 37. Extract only what you need for specific products or client projects.

---

**Created**: 2026-06-01
**For**: Eric Orion
**By**: Atlas
