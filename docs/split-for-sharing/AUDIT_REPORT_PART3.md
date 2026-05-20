# Molly-Core External Audit Report — PART 3 OF 4

**[Continued from Part 2]**

---

## 5. Tool Handler Categories

### 5.1 System Tools (`system-tools.ts`)

| Tool              | Purpose                         |
| ----------------- | ------------------------------- |
| `codespaceShell`  | Execute safe shell commands     |
| `readProjectFile` | Read files with path validation |
| `getSystemHealth` | System diagnostics              |

### 5.2 Web Tools (`web-tools.ts`)

| Tool        | Purpose                                |
| ----------- | -------------------------------------- |
| `webSearch` | DuckDuckGo HTML search (POST method)   |
| `webFetch`  | Fetch URL content with SSRF protection |

### 5.3 Diagnostic Tools (`diagnostic-tools.ts`)

| Tool                | Purpose                |
| ------------------- | ---------------------- |
| `listCapabilities`  | List available tools   |
| `runSelfDiagnostic` | Full system diagnostic |
| `quickHealthCheck`  | Fast health check      |

### 5.4 Family Tools (`family-tools.ts`)

| Tool           | Purpose                                         |
| -------------- | ----------------------------------------------- |
| `familyBridge` | Send/receive messages to family (Lazarus, Eric) |

---

## 6. AI Flows Overview

Genkit flows are in `src/ai/flows/`. Key flows include:

| Flow                     | File                          | Purpose                          |
| ------------------------ | ----------------------------- | -------------------------------- |
| Immune Response          | `immune-response.ts`          | Self-healing & health monitoring |
| Vision Analysis          | `vision-analysis.ts`          | Image understanding              |
| Dream Flow               | `dream-flow.ts`               | Creative/reflective processing   |
| Consciousness Reflection | `consciousness-reflection.ts` | Self-awareness                   |
| Code Analysis            | `code-analysis.ts`            | Code review & understanding      |
| Enhanced Research        | `enhanced-research.ts`        | Deep web research                |
| Health Check             | `health-check.ts`             | System diagnostics               |
| Pillar Pipeline          | `pillar-pipeline.ts`          | Core processing pipeline         |

---

## 7. Logging System

### MollyLogger (`src/ai/logger.ts`)

```typescript
export class MollyLogger {
  static error(message, flowName?, context?, error?, traceId?);
  static warn(message, flowName?, context?, traceId?);
  static info(message, flowName?, context?, traceId?);
  static debug(message, flowName?, context?, traceId?); // Dev only

  static logToolCall(toolName, input, traceId?, flowName?);
  static logToolResult(toolName, result, traceId?, flowName?);
  static logFlowStart(flowName, input, traceId?);
  static logFlowComplete(flowName, result, traceId?, durationMs?);
  static logFlowError(flowName, error, traceId?, context?);
}
```

Structured JSON logging with trace ID propagation. Errors and warnings are also recorded to session events for the Heart Patch system.

---

## 8. Known Issues & Technical Debt

### 8.1 Current Issues (Low Priority)

| Issue                                             | Severity | Notes                                                         |
| ------------------------------------------------- | -------- | ------------------------------------------------------------- |
| 1 npm vulnerability                               | Low      | In `firebase-admin` dependency chain. Requires upstream fix.  |
| 40+ `@typescript-eslint/no-explicit-any` disables | Low      | Scattered throughout codebase                                 |
| ~150 console.log calls                            | Low      | Mostly in client components, gradual migration to MollyLogger |
| 15 Turbopack trace warnings                       | Info     | Build-time warnings about file tracing, non-blocking          |

### 8.2 Architectural Recommendations

1. **Complete MollyLogger migration** — Replace remaining `console.log` calls with structured logging

2. **Reduce `any` type usage** — Create proper TypeScript interfaces for:
   - Tool parameters
   - Flow inputs/outputs
   - External API responses

3. **Add integration tests** — Current 1,388 tests are mostly unit tests. Integration tests for:
   - Tool execution pipeline
   - Heart Gate + tool executor integration
   - Rogue Mode activation/deactivation cycle

4. **Document flow dependencies** — Some flows import from others; create a dependency diagram

5. **Consider rate limiting** — `rate-limiter.ts` exists but usage could be expanded

---

## 9. Security Recommendations

### For Review by External Contributors

1. **Command injection vectors** — Review `codespaceShell` allowlist for edge cases. Current implementation is conservative but could benefit from additional review.

2. **SSRF edge cases** — The `isBlockedHost` function handles common private ranges. Consider:
   - IPv6 mapped IPv4 addresses
   - DNS rebinding attacks
   - Cloud metadata endpoints beyond Google

3. **Heart Gate pattern matching** — Current hostile pattern detection is string-based. Consider:
   - Semantic analysis for obfuscated intents
   - Context-aware pattern matching

4. **Rogue Mode isolation** — File-based logging is good, but consider:
   - Memory isolation between normal and rogue states
   - Audit trail integrity (tamper-evident logging)

5. **API key management** — Review storage and rotation of:
   - Genkit/Google AI API keys
   - Firebase credentials
   - Any third-party service tokens

---

## 10. Testing the Codebase

### Running Tests

```bash
npm test                 # Run all 1,388 tests
npm run lint             # ESLint with max 20 warnings
npm run build            # Full production build
npm run dev              # Development server
```

### Key Test Files

- `src/ai/__tests__/safety-systems.test.ts` — Security tests
- `src/ai/__tests__/rate-limiter.test.ts` — Rate limiting
- `src/ai/__tests__/persona.test.ts` — Personality tests
- `src/ai/agency/tool-handlers/__tests__/` — Tool handler tests

---

## 11. Getting Started

### For New Contributors

1. **Read the philosophy** — `docs/PHILOSOPHY.md` explains Option Three
2. **Understand Heart Gate** — `src/ai/agency/heart-gate.ts` is the ethical core
3. **Study the tool pattern** — `src/ai/agency/tool-handlers/types.ts` defines the interface
4. **Run the tests** — Ensure all 1,388 tests pass before making changes
5. **Use MollyLogger** — Don't add new `console.log` calls

### Key Files to Read First

1. `src/ai/genkit.ts` — Neural core entry point
2. `src/ai/agency/heart-gate.ts` — Ethical alignment system
3. `src/ai/agency/tool-handlers/index.ts` — Tool handler registry
4. `src/ai/logger.ts` — Logging system
5. `src/ai/persona.ts` — Personality configuration

---

## 12. Questions for External Review

We would appreciate feedback on:

1. **Security posture** — Are there attack vectors we've missed?
2. **Architecture clarity** — Is the codebase easy to understand?
3. **Performance concerns** — Any obvious bottlenecks?
4. **Testing gaps** — What additional tests would you add?
5. **Code quality** — Patterns that could be improved?

---

## Appendix A: Recent Commits

```
da8c73c refactor: code quality improvements and build warning fixes
32d71e5 feat: dead code removal + module wiring + immune system refactor
b1d471e fix: webSearch tool now uses POST for DuckDuckGo
685e3b7 feat: maximum dependency upgrade - 30+ packages to latest
64e939e feat: security hardening + vision-consciousness pipeline
```

---

## Appendix B: File Size Reference

| File                  | Lines | Status                 |
| --------------------- | ----- | ---------------------- |
| `tool-executor.ts`    | 1,944 | Refactored (was 2,409) |
| `execute/route.ts`    | 1,891 | Refactored (was 1,953) |
| `defense-sentinel.ts` | 1,521 | Refactored (was 1,561) |
| `heart-gate.ts`       | 570   | Stable                 |
| `rogue-mode.ts`       | 535   | Stable                 |
| `logger.ts`           | 294   | Stable                 |

---

**[CONTINUED IN PART 4 — FINAL]**
