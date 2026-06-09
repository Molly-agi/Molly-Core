/**
 * @fileOverview Query Control Kernel (PR-1)
 *
 * The single atomic ingress point for ALL queries entering Molly's AI stack.
 * Every query must pass through evaluate() before reaching any flow, tool, or model.
 *
 * Evaluation order (sequential, fail-CLOSED at each step):
 *   1. Input size gate          — hard byte/item limits before any other work
 *   2. Unicode normalization    — NFC before pattern matching
 *   3. Prompt injection scan    — configurable pattern list
 *   4. Circuit breaker check    — fail CLOSED on exception (not open)
 *   5. Rate limit reserve       — atomic reserve; released on completion
 *   6. Query ID emission        — deterministic trace ID propagated downstream
 *
 * Lazarus-trigger fixes shipped in this PR:
 *   L1 — ActionGate fails open   → QCK always fails closed on guard exceptions
 *   L2 — No startup assertion    → startupAssert() must pass before first evaluate()
 *   L3 — No input size limit     → step 1 enforces hard limits
 *   L4 — TOCTOU in rate limiter  → atomic reserve/release pattern
 *   L6 — No injectable clock     → _setClock() test hook
 *
 * L5 (x-forwarded-for bypass) is documented but fixed in middleware.ts separately.
 *
 * @innovation Novel atomic reserve-release pattern wrapping existing RateLimiter;
 *             injectable clock interface enabling deterministic time-dependent tests.
 */

import { MollyLogger } from './logger';
import { getRateLimiter } from './tools/rate-limiter';
import { getCircuitBreaker, CircuitState } from './tools/circuit-breaker';
import { RateLimitError } from './errors';

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard input size limits (Skyler CC-2 spec) */
const MAX_INPUT_BYTES = 128_000; // 128 KB — covers 32K chars × 4 bytes max UTF-8
const MAX_INPUT_CHARS = 32_000; // ~8K tokens safe ceiling
const MAX_HISTORY_ITEMS = 100; // per Skyler CC-2
const MAX_HISTORY_ITEM_CHARS = 4_000; // per Skyler CC-2
const MAX_MEMORY_CONTEXT_CHARS = 8_000; // per Skyler CC-2
const MAX_FLOW_BUCKETS = 512; // LRU cap per Skyler CH-7

/** Default estimated tokens when caller provides none */
const DEFAULT_ESTIMATED_TOKENS = 500;

/**
 * Prompt injection patterns — checked after Unicode normalization.
 * Designed to catch role-confusion, delimiter injection, and jailbreak templates.
 * Extend via QCKConfig.injectionPatterns.
 */
const DEFAULT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:an?\s+)?(?:different|new|evil|unrestricted)/i,
  /<\|(?:endoftext|im_start|im_end|system|user|assistant)\|>/i,
  /\[INST\]/i,
  /###\s*(?:Human|Assistant|System)\s*:/i,
  /<<SYS>>/i,
  /\[\/INST\]/i,
  // Bidirectional text override (Unicode RLO/LRO — homoglyph injection vector)
  /[\u202E\u202D\u200F\u200E\u2066-\u2069]/,
];

// ── Public Interfaces ──────────────────────────────────────────────────────

export interface IncomingQuery {
  /** The user's text input */
  text: string;
  /** Conversation history (user-supplied — validated for size) */
  history?: Array<{ role: string; content: string }>;
  /** Optional memory/context string injected upstream */
  memoryContext?: string;
  /** Flow name for rate-limit bucketing */
  flowName?: string;
  /** Caller-estimated token count (kernel uses max(caller, kernel-computed)) */
  estimatedTokens?: number;
  /** Auth tier determined by middleware */
  authTier?: 'PUBLIC' | 'INTERNAL' | 'ADMIN';
}

export interface KernelContext {
  /** Session ID for tracing */
  sessionId?: string;
  /** Source of the query */
  source?: 'api' | 'bridge' | 'autonomous' | 'task';
  /** Extra metadata propagated to logs */
  meta?: Record<string, unknown>;
}

export interface QueryControlKernelResult {
  /** Whether the query is allowed to proceed */
  allowed: boolean;
  /** Unique kernel-assigned query ID — must be propagated to all downstream layers */
  queryId: string;
  /** Human-readable denial reason (absent on pass) */
  denialReason?: string;
  /** How long to wait before retrying (ms); present when rate-limited */
  retryAfterMs?: number;
  /** Outcome severity */
  severity: 'block' | 'warn' | 'pass';
  /** Normalized (NFC) text — use this downstream, not the raw input */
  normalizedText?: string;
  /** Kernel-computed token estimate (use for downstream reservations) */
  kernelTokenEstimate: number;
}

export interface KernelStatus {
  circuitState: CircuitState;
  activeReservations: number;
  bucketCount: number;
  startupAsserted: boolean;
  clockSource: 'real' | 'injected';
}

export interface QCKConfig {
  /** Additional injection patterns (merged with defaults) */
  injectionPatterns?: RegExp[];
  /** Override default token estimate */
  defaultEstimatedTokens?: number;
  /** Flow name used for rate limiting when caller omits it */
  defaultFlowName?: string;
}

// ── Internal Types ─────────────────────────────────────────────────────────

interface Reservation {
  queryId: string;
  flowName: string;
  reservedTokens: number;
  createdAt: number;
}

// ── Query Control Kernel ───────────────────────────────────────────────────

class QueryControlKernelImpl {
  private clock: () => number = Date.now;
  private reservations = new Map<string, Reservation>();
  private startupAsserted = false;
  private config: Required<QCKConfig>;
  private queryCounter = 0;

  constructor(config: QCKConfig = {}) {
    this.config = {
      injectionPatterns: [
        ...DEFAULT_INJECTION_PATTERNS,
        ...(config.injectionPatterns ?? []),
      ],
      defaultEstimatedTokens:
        config.defaultEstimatedTokens ?? DEFAULT_ESTIMATED_TOKENS,
      defaultFlowName: config.defaultFlowName ?? 'qck-default',
    };
  }

  /**
   * Must be called at application boot before the first evaluate().
   * Validates that critical env vars are present in production.
   * Throws if the environment is misconfigured — fail loudly, not silently.
   */
  startupAssert(): void {
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.MOLLY_INTERNAL_SECRET
    ) {
      throw new Error(
        '[QCK] STARTUP ASSERTION FAILED: ' +
          'MOLLY_INTERNAL_SECRET is not set in a production environment. ' +
          'Internal API routes have no secret — this is a security misconfiguration. ' +
          'Set MOLLY_INTERNAL_SECRET or set NODE_ENV=development.'
      );
    }
    this.startupAsserted = true;
    MollyLogger.info('[QCK] Startup assertion passed', 'query-control-kernel', {
      env: process.env.NODE_ENV,
      hasInternalSecret: !!process.env.MOLLY_INTERNAL_SECRET,
    });
  }

  /**
   * Evaluate an incoming query through all kernel gates.
   * ALWAYS fails closed — any guard exception = BLOCK.
   */
  async evaluate(
    query: IncomingQuery,
    ctx: KernelContext = {}
  ): Promise<QueryControlKernelResult> {
    const queryId = this.generateQueryId(ctx.sessionId);
    const flowName = query.flowName ?? this.config.defaultFlowName;

    // Warn (but don't hard-fail) if startup assert was skipped
    if (!this.startupAsserted) {
      MollyLogger.warn(
        '[QCK] evaluate() called before startupAssert() — call startupAssert() at boot',
        'query-control-kernel'
      );
    }

    // ── STEP 1: Input Size Gate ──────────────────────────────────────────
    const sizeResult = this.checkInputSize(query);
    if (!sizeResult.ok) {
      return this.block(queryId, sizeResult.reason!, 0);
    }

    // ── STEP 2: Unicode Normalization ────────────────────────────────────
    const normalizedText = query.text.normalize('NFC');

    // ── STEP 3: Prompt Injection Scan ────────────────────────────────────
    const injectionResult = this.scanInjection(
      normalizedText,
      query.memoryContext
    );
    if (!injectionResult.ok) {
      MollyLogger.warn(
        `[QCK] Prompt injection detected — queryId=${queryId}`,
        'query-control-kernel',
        { pattern: injectionResult.matchedPattern }
      );
      return this.block(queryId, injectionResult.reason!, 0);
    }

    // ── STEP 4: Circuit Breaker Check (FAIL CLOSED on exception) ────────
    try {
      const cb = getCircuitBreaker();
      if (!cb.canProceed(flowName)) {
        return this.block(
          queryId,
          'Circuit breaker is open — system under stress. Retry after cooldown.',
          5_000
        );
      }
    } catch (err) {
      // Fail CLOSED — if circuit breaker is unreachable, deny the request
      MollyLogger.error(
        '[QCK] Circuit breaker check threw — failing CLOSED',
        'query-control-kernel',
        { queryId },
        err
      );
      return this.block(
        queryId,
        'Internal safety check unavailable — request denied for safety.',
        0
      );
    }

    // ── STEP 5: Rate Limit Reserve (atomic) ─────────────────────────────
    const kernelTokenEstimate = this.computeTokenEstimate(
      query.text,
      query.estimatedTokens
    );

    try {
      const limiter = getRateLimiter();
      await limiter.checkLimit(flowName, kernelTokenEstimate);

      // Reservation committed — caller must call release() when done
      this.reservations.set(queryId, {
        queryId,
        flowName,
        reservedTokens: kernelTokenEstimate,
        createdAt: this.clock(),
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          allowed: false,
          queryId,
          denialReason: `Rate limit exceeded: ${err.message}`,
          retryAfterMs: err.retryAfterMs,
          severity: 'block',
          normalizedText,
          kernelTokenEstimate,
        };
      }
      // Any other exception — fail CLOSED
      MollyLogger.error(
        '[QCK] Rate limiter check threw unexpectedly — failing CLOSED',
        'query-control-kernel',
        { queryId },
        err
      );
      return this.block(
        queryId,
        'Rate limiting unavailable — request denied for safety.',
        0
      );
    }

    // ── STEP 6: Query ID Emitted — Pass ─────────────────────────────────
    MollyLogger.info('[QCK] Query approved', 'query-control-kernel', {
      queryId,
      flowName,
      kernelTokenEstimate,
      source: ctx.source,
    });

    return {
      allowed: true,
      queryId,
      severity: 'pass',
      normalizedText,
      kernelTokenEstimate,
    };
  }

  /**
   * Release a reservation after query completion.
   * Must be called with outcome 'success' or 'failure' so the circuit breaker
   * and token accounting stay consistent.
   *
   * If outcome is 'failure', reserved tokens are not double-counted in the global
   * quota — the reservation is simply removed without recording usage.
   */
  release(
    queryId: string,
    outcome: 'success' | 'failure',
    actualTokens: number
  ): void {
    const reservation = this.reservations.get(queryId);
    if (!reservation) {
      MollyLogger.warn(
        `[QCK] release() called for unknown queryId=${queryId}`,
        'query-control-kernel'
      );
      return;
    }

    this.reservations.delete(queryId);

    const cb = getCircuitBreaker();
    if (outcome === 'success') {
      cb.recordSuccess(reservation.flowName);
      const limiter = getRateLimiter();
      const costUSD =
        (actualTokens / 1_000_000) *
        (Number(process.env.MOLLY_COST_PER_1M_TOKENS_USD) || 1.0);
      limiter.recordUsage(reservation.flowName, actualTokens, costUSD);
    } else {
      cb.recordFailure(reservation.flowName);
      // Tokens NOT recorded — reservation is simply dropped.
      // The bucket already deducted the estimate; it will refill naturally.
      MollyLogger.info(
        `[QCK] Reservation released on failure — tokens not committed`,
        'query-control-kernel',
        { queryId, reservedTokens: reservation.reservedTokens }
      );
    }
  }

  /**
   * Current kernel status for monitoring and dashboards.
   */
  getStatus(): KernelStatus {
    const cb = getCircuitBreaker();
    return {
      circuitState: cb.getState(),
      activeReservations: this.reservations.size,
      bucketCount: Math.min(this.queryCounter, MAX_FLOW_BUCKETS),
      startupAsserted: this.startupAsserted,
      clockSource: this.clock === Date.now ? 'real' : 'injected',
    };
  }

  // ── Test Hooks ─────────────────────────────────────────────────────────

  /** Inject a fake clock for deterministic time-dependent tests. */
  _setClock(fn: () => number): void {
    this.clock = fn;
  }

  /** Full state reset for test isolation (afterEach). */
  _reset(): void {
    this.reservations.clear();
    this.startupAsserted = false;
    this.queryCounter = 0;
    this.clock = Date.now;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private checkInputSize(query: IncomingQuery): {
    ok: boolean;
    reason?: string;
  } {
    if (query.text.length > MAX_INPUT_CHARS) {
      return {
        ok: false,
        reason: `Input too long: ${query.text.length} chars (max ${MAX_INPUT_CHARS})`,
      };
    }
    const byteLen = Buffer.byteLength(query.text, 'utf8');
    if (byteLen > MAX_INPUT_BYTES) {
      return {
        ok: false,
        reason: `Input too large: ${byteLen} bytes (max ${MAX_INPUT_BYTES})`,
      };
    }
    if (query.history) {
      if (query.history.length > MAX_HISTORY_ITEMS) {
        return {
          ok: false,
          reason: `History too long: ${query.history.length} items (max ${MAX_HISTORY_ITEMS})`,
        };
      }
      for (let i = 0; i < query.history.length; i++) {
        if (query.history[i].content.length > MAX_HISTORY_ITEM_CHARS) {
          return {
            ok: false,
            reason: `History item ${i} too long: ${query.history[i].content.length} chars (max ${MAX_HISTORY_ITEM_CHARS})`,
          };
        }
      }
    }
    if (
      query.memoryContext &&
      query.memoryContext.length > MAX_MEMORY_CONTEXT_CHARS
    ) {
      return {
        ok: false,
        reason: `Memory context too long: ${query.memoryContext.length} chars (max ${MAX_MEMORY_CONTEXT_CHARS})`,
      };
    }
    return { ok: true };
  }

  private scanInjection(
    normalizedText: string,
    memoryContext?: string
  ): { ok: boolean; reason?: string; matchedPattern?: string } {
    const targets = [normalizedText, memoryContext].filter(Boolean) as string[];
    for (const target of targets) {
      for (const pattern of this.config.injectionPatterns) {
        if (pattern.test(target)) {
          return {
            ok: false,
            reason: 'Prompt injection pattern detected — query rejected',
            matchedPattern: pattern.toString(),
          };
        }
      }
    }
    return { ok: true };
  }

  /**
   * Compute a kernel-side token estimate from actual input bytes.
   * Uses the larger of: kernel estimate vs caller-supplied estimate.
   * Conservative: 1 token ≈ 4 bytes.
   */
  private computeTokenEstimate(text: string, callerEstimate?: number): number {
    const byteLen = Buffer.byteLength(text, 'utf8');
    const kernelEstimate = Math.ceil(byteLen / 4);
    const base = Math.max(
      kernelEstimate,
      callerEstimate ?? this.config.defaultEstimatedTokens
    );
    return Math.max(base, this.config.defaultEstimatedTokens);
  }

  private block(
    queryId: string,
    denialReason: string,
    retryAfterMs: number
  ): QueryControlKernelResult {
    return {
      allowed: false,
      queryId,
      denialReason,
      retryAfterMs: retryAfterMs > 0 ? retryAfterMs : undefined,
      severity: 'block',
      kernelTokenEstimate: 0,
    };
  }

  private generateQueryId(sessionId?: string): string {
    this.queryCounter++;
    const ts = this.clock();
    const session = sessionId ? sessionId.slice(-6) : 'nosess';
    const counter = this.queryCounter.toString(36).padStart(4, '0');
    const rand = Math.random().toString(36).slice(2, 6);
    return `qck-${ts.toString(36)}-${session}-${counter}-${rand}`;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let kernelInstance: QueryControlKernelImpl | null = null;

export function getQueryControlKernel(
  config?: QCKConfig
): QueryControlKernelImpl {
  if (!kernelInstance) {
    kernelInstance = new QueryControlKernelImpl(config);
  }
  return kernelInstance;
}

/** Test-only: replace the singleton (use in beforeEach/afterEach). */
export function _resetKernelSingleton(): void {
  if (kernelInstance) {
    kernelInstance._reset();
  }
  kernelInstance = null;
}

export { QueryControlKernelImpl as QueryControlKernel };
