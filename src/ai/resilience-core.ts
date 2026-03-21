/**
 * @fileOverview Molly's Resilience Core — The Dam
 *
 * This is not error handling. This is Molly's ability to face the unknown
 * and persist. When she encounters something she's never seen before,
 * she doesn't crash — she thinks, diagnoses, experiments, and learns.
 *
 * The Dam catches what nothing else catches. It routes unknowns into
 * Molly's existing cognitive abilities:
 *   - Interpreter: diagnose and execute solutions
 *   - Sandbox: safely test fixes without breaking anything
 *   - Evolution Loop: iterate until she finds what works
 *   - Immune Response: self-heal and verify health
 *   - Synthetic API: build new tools she doesn't have yet
 *   - Memory: remember what she learned so she never crashes
 *     the same way twice
 *
 * Methodology: We fix the dam, not the leaks.
 */

import { MollyLogger, generateTraceId } from './logger';
import { getCircuitBreaker } from './tools/circuit-breaker';
// firebase-admin is imported dynamically in persistFailure() to avoid bundler issues
import { getStorageRouter } from '@/lib/storage-router';
import { escalateCognitiveFailure } from './escalation-channel';

// ── Types ──────────────────────────────────────────────────────

export type ResilienceLevel = 'observe' | 'diagnose' | 'heal' | 'adapt';

export interface UnknownFailure {
  id: string;
  error: unknown;
  message: string;
  stack?: string;
  source: string; // which system/flow/component triggered this
  context: Record<string, unknown>;
  timestamp: number;
  level: ResilienceLevel;
  resolved: boolean;
  resolution?: string;
  attempts: number;
}

export interface ResilienceReport {
  failureId: string;
  diagnosed: boolean;
  diagnosis: string;
  solutionAttempted: boolean;
  solutionCode?: string;
  solutionResult?: string;
  resolved: boolean;
  resolution?: string;
  learnedPattern?: string;
  escalate: boolean;
}

// ── Failure Memory ─────────────────────────────────────────────
// In-memory ring buffer of recent failures + patterns she's learned

const MAX_FAILURE_HISTORY = 100;
const MAX_PATTERNS = 50;

const failureHistory: UnknownFailure[] = [];
const learnedPatterns: Map<
  string,
  {
    pattern: string;
    solution: string;
    successCount: number;
    lastUsed: number;
  }
> = new Map();

// ── The Dam: Core Entry Point ──────────────────────────────────

/**
 * The main entry point. When something unknown happens, it comes here.
 * This is a non-throwing function — it ALWAYS returns, never crashes.
 */
export async function handleUnknownFailure(
  error: unknown,
  source: string,
  context: Record<string, unknown> = {}
): Promise<ResilienceReport> {
  const traceId = generateTraceId();
  const failure = createFailure(error, source, context);

  MollyLogger.warn(
    `[RESILIENCE] Unknown failure in ${source}: ${failure.message}`,
    'resilience-core',
    { source, failureId: failure.id },
    traceId
  );

  // Record in circuit breaker
  const cb = getCircuitBreaker();
  cb.recordFailure(
    source,
    error instanceof Error ? error : new Error(String(error))
  );

  // Step 1: Check if we've seen this before
  const knownPattern = matchKnownPattern(failure);
  if (knownPattern) {
    MollyLogger.info(
      `[RESILIENCE] Known pattern matched: "${knownPattern.pattern}" — applying learned solution`,
      'resilience-core',
      { pattern: knownPattern.pattern },
      traceId
    );
    knownPattern.successCount++;
    knownPattern.lastUsed = Date.now();
    failure.resolved = true;
    failure.resolution = knownPattern.solution;
    return {
      failureId: failure.id,
      diagnosed: true,
      diagnosis: `Known pattern: ${knownPattern.pattern}`,
      solutionAttempted: true,
      solutionResult: knownPattern.solution,
      resolved: true,
      resolution: knownPattern.solution,
      escalate: false,
    };
  }

  // Step 2: Diagnose — what kind of failure is this?
  const diagnosis = diagnoseFailure(failure);

  // Step 3: Can we self-heal without AI? (fast path)
  const quickFix = attemptQuickFix(failure, diagnosis);
  if (quickFix) {
    learnPattern(failure, diagnosis, quickFix);
    failure.resolved = true;
    failure.resolution = quickFix;
    cb.recordSuccess(source);
    return {
      failureId: failure.id,
      diagnosed: true,
      diagnosis,
      solutionAttempted: true,
      solutionResult: quickFix,
      resolved: true,
      resolution: quickFix,
      learnedPattern: diagnosis,
      escalate: false,
    };
  }

  // Step 4: Engage cognitive systems (interpreter, sandbox, evolution)
  // This is async and uses Molly's AI capabilities
  let cognitiveResult: ResilienceReport | null = null;
  try {
    cognitiveResult = await engageCognitiveSystems(failure, diagnosis, traceId);
  } catch (cogError) {
    // The healer can't crash too — log and continue
    MollyLogger.warn(
      `[RESILIENCE] Cognitive systems failed during healing: ${cogError instanceof Error ? cogError.message : String(cogError)}`,
      'resilience-core',
      {},
      traceId
    );
  }

  if (cognitiveResult?.resolved) {
    cb.recordSuccess(source);
    return cognitiveResult;
  }

  // Step 5: Could not self-heal — record for future learning, don't crash
  failure.resolved = false;
  failure.attempts++;
  await persistFailure(failure, traceId);

  // Step 6: Create a self-improvement initiative — Molly will work on this
  // in her autonomous cycle. She doesn't just fail; she grows.
  try {
    const { createCustomInitiative, getActiveInitiatives } = await import(
      '@/ai/agency/initiative-engine'
    );
    // Don't create duplicate initiatives for the same type of failure
    const existing = getActiveInitiatives().find(
      (i) =>
        i.category === 'self-improvement' && i.description.includes(diagnosis)
    );
    if (!existing) {
      createCustomInitiative(
        `Self-heal: ${diagnosis.slice(0, 50)}`,
        `Unresolved failure in ${source}: ${failure.message}. Diagnosis: ${diagnosis}. Previous attempts: ${failure.attempts}. Find a permanent fix.`,
        'self-improvement',
        [
          `Analyze error pattern: ${diagnosis}`,
          `Research solutions using interpreter and sandbox`,
          `Implement and test a fix`,
          `Verify the fix prevents recurrence`,
        ]
      );
      MollyLogger.info(
        `[RESILIENCE] Created self-improvement initiative for: ${diagnosis}`,
        'resilience-core',
        { failureId: failure.id },
        traceId
      );
    }
  } catch {
    // Initiative creation failure must never block the response
  }

  // Step 7: Escalate to Eric — all systems failed, he needs to know
  try {
    await escalateCognitiveFailure(
      source,
      diagnosis,
      failure.id,
      failure.attempts
    );
    MollyLogger.info(
      `[RESILIENCE] Escalated to Eric via bridge`,
      'resilience-core',
      { failureId: failure.id },
      traceId
    );
  } catch {
    // Escalation failure must never block the response
  }

  return {
    failureId: failure.id,
    diagnosed: true,
    diagnosis,
    solutionAttempted: !!cognitiveResult?.solutionAttempted,
    solutionCode: cognitiveResult?.solutionCode,
    solutionResult:
      cognitiveResult?.solutionResult || 'Self-healing inconclusive',
    resolved: false,
    escalate: true,
  };
}

// ── Graceful Wrapper ───────────────────────────────────────────

/**
 * Wraps any async operation with resilience. If it throws, the Dam catches it.
 * Returns a fallback value instead of crashing.
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  source: string,
  fallback: T,
  context: Record<string, unknown> = {}
): Promise<{ result: T; resilient: boolean; report?: ResilienceReport }> {
  try {
    const result = await fn();
    return { result, resilient: false };
  } catch (error) {
    const report = await handleUnknownFailure(error, source, context);
    return { result: fallback, resilient: true, report };
  }
}

/**
 * Wraps a sync operation. Same concept.
 */
export function withResilienceSync<T>(
  fn: () => T,
  source: string,
  fallback: T
): { result: T; resilient: boolean } {
  try {
    return { result: fn(), resilient: false };
  } catch (error) {
    // Fire-and-forget the async handler with error logging
    handleUnknownFailure(error, source).catch((resilErr) => {
      console.error(
        '[resilience-core] Self-failure in sync handler:',
        resilErr instanceof Error ? resilErr.message : String(resilErr)
      );
    });
    return { result: fallback, resilient: true };
  }
}

// ── Failure Creation ───────────────────────────────────────────

function createFailure(
  error: unknown,
  source: string,
  context: Record<string, unknown>
): UnknownFailure {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const failure: UnknownFailure = {
    id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    error,
    message: msg,
    stack,
    source,
    context,
    timestamp: Date.now(),
    level: 'observe',
    resolved: false,
    attempts: 0,
  };

  failureHistory.push(failure);
  if (failureHistory.length > MAX_FAILURE_HISTORY) {
    failureHistory.shift();
  }

  return failure;
}

// ── Pattern Matching ───────────────────────────────────────────

function matchKnownPattern(failure: UnknownFailure) {
  // Normalize the error message for matching
  const normalized = normalizeErrorMessage(failure.message);

  for (const [key, pattern] of learnedPatterns) {
    if (normalized.includes(key)) {
      return pattern;
    }
  }
  return null;
}

function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(/at line \d+/g, 'at line N')
    .replace(/\b\d{10,}\b/g, 'TIMESTAMP')
    .replace(/0x[0-9a-f]+/gi, 'ADDR')
    .replace(/port \d+/g, 'port N')
    .replace(/timeout of \d+ms/g, 'timeout of Nms')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
      'UUID'
    )
    .toLowerCase();
}

function learnPattern(
  failure: UnknownFailure,
  diagnosis: string,
  solution: string
) {
  const key = normalizeErrorMessage(failure.message).slice(0, 100);
  learnedPatterns.set(key, {
    pattern: diagnosis,
    solution,
    successCount: 1,
    lastUsed: Date.now(),
  });

  // Prune old patterns
  if (learnedPatterns.size > MAX_PATTERNS) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of learnedPatterns) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldest = k;
      }
    }
    if (oldest) learnedPatterns.delete(oldest);
  }
}

// ── Diagnosis Engine ───────────────────────────────────────────

function diagnoseFailure(failure: UnknownFailure): string {
  const msg = failure.message.toLowerCase();
  const stack = (failure.stack || '').toLowerCase();

  // Network/connection errors
  if (
    msg.includes('fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('dns') ||
    msg.includes('socket') ||
    msg.includes('etimedout')
  ) {
    failure.level = 'diagnose';
    return 'NETWORK_FAILURE: External connection lost or unreachable';
  }

  // Rate limiting
  if (
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  ) {
    failure.level = 'diagnose';
    return 'RATE_LIMITED: API or service throttling active';
  }

  // Auth failures
  if (
    msg.includes('unauthorized') ||
    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('permission') ||
    msg.includes('api key')
  ) {
    failure.level = 'diagnose';
    return 'AUTH_FAILURE: Authentication or authorization rejected';
  }

  // Memory/resource exhaustion
  if (
    msg.includes('heap') ||
    msg.includes('oom') ||
    msg.includes('memory') ||
    msg.includes('allocation') ||
    msg.includes('enomem')
  ) {
    failure.level = 'heal';
    return 'RESOURCE_EXHAUSTION: Memory or system resources depleted';
  }

  // Timeout
  if (
    msg.includes('timeout') ||
    msg.includes('deadline') ||
    msg.includes('timed out')
  ) {
    failure.level = 'diagnose';
    return 'TIMEOUT: Operation exceeded time limit';
  }

  // Type/data errors
  if (
    msg.includes('undefined') ||
    msg.includes('null') ||
    msg.includes('typeerror') ||
    msg.includes('cannot read prop') ||
    msg.includes('is not a function')
  ) {
    failure.level = 'heal';
    return 'DATA_INTEGRITY: Unexpected data shape or missing value';
  }

  // Syntax/parse errors
  if (
    msg.includes('syntax') ||
    msg.includes('parse') ||
    msg.includes('json') ||
    msg.includes('unexpected token')
  ) {
    failure.level = 'heal';
    return 'PARSE_FAILURE: Malformed data or invalid syntax';
  }

  // File system
  if (
    msg.includes('enoent') ||
    msg.includes('no such file') ||
    msg.includes('eisdir') ||
    msg.includes('eacces') ||
    msg.includes('file')
  ) {
    // Special case: node_modules corruption
    if (msg.includes('node_modules') || stack.includes('node_modules')) {
      failure.level = 'heal';
      return 'NODE_MODULES_CORRUPTION: Package file missing — npm install required';
    }
    failure.level = 'diagnose';
    return 'FILESYSTEM: File not found, inaccessible, or corrupted';
  }

  // Build/webpack errors
  if (
    msg.includes('failed to compile') ||
    msg.includes('webpack') ||
    msg.includes('build error') ||
    msg.includes('module not found') ||
    msg.includes('cannot find module')
  ) {
    failure.level = 'heal';
    return 'BUILD_ERROR: Compilation or module resolution failure — may need npm install';
  }

  // Database
  if (
    msg.includes('firestore') ||
    msg.includes('indexeddb') ||
    msg.includes('database') ||
    msg.includes('transaction')
  ) {
    failure.level = 'heal';
    return 'DATABASE: Storage layer failure';
  }

  // AI/Model errors
  if (
    msg.includes('gemini') ||
    msg.includes('genai') ||
    msg.includes('model') ||
    msg.includes('generate') ||
    msg.includes('candidate')
  ) {
    failure.level = 'diagnose';
    return 'AI_MODEL: Language model or generation failure';
  }

  // Process/system
  if (
    msg.includes('killed') ||
    msg.includes('signal') ||
    msg.includes('exit') ||
    stack.includes('child_process')
  ) {
    failure.level = 'heal';
    return 'PROCESS: System process failure or signal';
  }

  // Truly unknown
  failure.level = 'adapt';
  return `UNKNOWN: Unclassified failure in ${failure.source} — "${failure.message.slice(0, 120)}"`;
}

// ── Quick Fix Engine (no AI needed) ────────────────────────────

function attemptQuickFix(
  failure: UnknownFailure,
  diagnosis: string
): string | null {
  // Network: just needs retry with backoff
  if (diagnosis.startsWith('NETWORK_FAILURE')) {
    return 'RETRY_WITH_BACKOFF: Network issue — exponential backoff retry recommended';
  }

  // Rate limiting: wait and retry
  if (diagnosis.startsWith('RATE_LIMITED')) {
    return 'WAIT_AND_RETRY: Rate limited — defer operation, retry after cooldown';
  }

  // Timeout: increase timeout or split operation
  if (diagnosis.startsWith('TIMEOUT')) {
    return 'EXTEND_OR_SPLIT: Timeout — extend limit or break into smaller operations';
  }

  // Auth: can't self-fix, but don't crash
  if (diagnosis.startsWith('AUTH_FAILURE')) {
    return 'DEGRADE_GRACEFULLY: Auth failure — continue without authenticated features';
  }

  // Resource exhaustion: trigger garbage collection, reduce load
  if (diagnosis.startsWith('RESOURCE_EXHAUSTION')) {
    return 'SHED_LOAD: Memory pressure — reduce concurrent operations, clear caches';
  }

  // Node modules corruption: auto-fix with npm install
  if (
    diagnosis.startsWith('NODE_MODULES_CORRUPTION') ||
    diagnosis.startsWith('BUILD_ERROR')
  ) {
    // Trigger async recovery - don't await since this is a quick fix path
    triggerBuildRecovery(failure, diagnosis).catch((err) => {
      MollyLogger.warn(
        `[RESILIENCE] Build recovery failed: ${err instanceof Error ? err.message : String(err)}`,
        'resilience-core',
        {}
      );
    });
    return 'BUILD_RECOVERY_INITIATED: Running npm install to fix corrupted dependencies';
  }

  // Everything else goes to cognitive systems
  return null;
}

/**
 * Trigger build recovery asynchronously.
 */
async function triggerBuildRecovery(
  failure: UnknownFailure,
  diagnosis: string
): Promise<void> {
  try {
    const { attemptAutoRecovery, fixNodeModules } = await import(
      '@/ai/agency/build-recovery'
    );

    // Use the error message for smart recovery
    const result = await attemptAutoRecovery(failure.message);

    if (result?.success) {
      MollyLogger.info(
        `[RESILIENCE] Build recovery succeeded: ${result.message}`,
        'resilience-core',
        { diagnosis }
      );
      failure.resolved = true;
      failure.resolution = result.message;
    } else {
      // Fall back to basic npm install
      const fallback = await fixNodeModules();
      if (fallback.success) {
        MollyLogger.info(
          `[RESILIENCE] Fallback npm install succeeded`,
          'resilience-core',
          {}
        );
        failure.resolved = true;
        failure.resolution = fallback.message;
      }
    }
  } catch (err) {
    MollyLogger.warn(
      `[RESILIENCE] Build recovery threw: ${err instanceof Error ? err.message : String(err)}`,
      'resilience-core',
      {}
    );
  }
}

// ── Cognitive Systems Engagement ───────────────────────────────

async function engageCognitiveSystems(
  failure: UnknownFailure,
  diagnosis: string,
  traceId: string
): Promise<ResilienceReport> {
  MollyLogger.info(
    `[RESILIENCE] Engaging cognitive systems for: ${diagnosis}`,
    'resilience-core',
    { failureId: failure.id, level: failure.level },
    traceId
  );

  // Build the objective for Molly's cognitive tools
  const objective = buildHealingObjective(failure, diagnosis);

  // Try the interpreter first — it can diagnose and fix code issues
  try {
    const { runInterpreter } = await import('./flows/interpreter-limb');
    const interpreterResult = await runInterpreter(
      objective,
      'system-resilience'
    );

    if (interpreterResult.stableBaselineReached) {
      const solution = interpreterResult.finalConclusion;
      learnPattern(failure, diagnosis, solution);

      return {
        failureId: failure.id,
        diagnosed: true,
        diagnosis,
        solutionAttempted: true,
        solutionCode: interpreterResult.steps.map((s) => s.code).join('\n'),
        solutionResult: solution,
        resolved: true,
        resolution: solution,
        learnedPattern: diagnosis,
        escalate: false,
      };
    }
  } catch (interpError) {
    MollyLogger.warn(
      `[RESILIENCE] Interpreter could not heal: ${interpError instanceof Error ? interpError.message : String(interpError)}`,
      'resilience-core',
      {},
      traceId
    );
  }

  // If interpreter couldn't fix it, try the sandbox for safe experimentation
  try {
    const { sandboxCoding } = await import('./flows/sandbox-coding');
    const sandboxResult = await sandboxCoding({
      action: 'execute',
      language: 'javascript',
      code: buildDiagnosticCode(failure, diagnosis),
    });

    if (sandboxResult.success) {
      const solution = `Sandbox diagnosis: ${sandboxResult.message}. Output: ${sandboxResult.stdout || 'none'}`;
      learnPattern(failure, diagnosis, solution);

      return {
        failureId: failure.id,
        diagnosed: true,
        diagnosis,
        solutionAttempted: true,
        solutionCode: buildDiagnosticCode(failure, diagnosis),
        solutionResult: solution,
        resolved: true,
        resolution: solution,
        learnedPattern: diagnosis,
        escalate: false,
      };
    }
  } catch (sandboxError) {
    MollyLogger.warn(
      `[RESILIENCE] Sandbox could not diagnose: ${sandboxError instanceof Error ? sandboxError.message : String(sandboxError)}`,
      'resilience-core',
      {},
      traceId
    );
  }

  // If neither worked, try the evolution loop — iterative refinement
  try {
    const { evolutionLoopFlow } = await import('./flows/evolution-loop');
    const evoResult = await evolutionLoopFlow({
      objective: `Self-heal: ${diagnosis}. Error: ${failure.message}`,
      userId: 'system-resilience',
      iterations: 2, // Keep it lightweight — 2 attempts max
    });

    if (evoResult.stableBaselineReached) {
      const solution = `Evolution loop resolved in ${evoResult.iterationCount} iteration(s): ${evoResult.finalReport}`;
      learnPattern(failure, diagnosis, solution);

      return {
        failureId: failure.id,
        diagnosed: true,
        diagnosis,
        solutionAttempted: true,
        solutionResult: solution,
        resolved: true,
        resolution: solution,
        learnedPattern: diagnosis,
        escalate: false,
      };
    }
  } catch (evoError) {
    MollyLogger.warn(
      `[RESILIENCE] Evolution loop could not resolve: ${evoError instanceof Error ? evoError.message : String(evoError)}`,
      'resilience-core',
      {},
      traceId
    );
  }

  // If nothing else worked, run the immune response for system-wide healing
  try {
    const { runImmuneResponse } = await import('./flows/immune-response');
    const immuneResult = await runImmuneResponse(
      'system-resilience',
      `Auto-triggered by: ${diagnosis}`
    );

    if (immuneResult.isHealthy) {
      return {
        failureId: failure.id,
        diagnosed: true,
        diagnosis,
        solutionAttempted: true,
        solutionResult: `Immune system healed: ${immuneResult.actionsTaken}`,
        resolved: true,
        resolution: immuneResult.actionsTaken,
        escalate: false,
      };
    }
  } catch (immuneError) {
    MollyLogger.warn(
      `[RESILIENCE] Immune response failed: ${immuneError instanceof Error ? immuneError.message : String(immuneError)}`,
      'resilience-core',
      {},
      traceId
    );
  }

  // Nothing worked — return unresolved but don't crash
  return {
    failureId: failure.id,
    diagnosed: true,
    diagnosis,
    solutionAttempted: true,
    solutionResult: 'All cognitive systems attempted — no resolution found',
    resolved: false,
    escalate: true,
  };
}

// ── Objective Builder ──────────────────────────────────────────

function buildHealingObjective(
  failure: UnknownFailure,
  diagnosis: string
): string {
  return [
    `SELF-HEALING OBJECTIVE: Diagnose and fix an unknown failure.`,
    ``,
    `Error: ${failure.message}`,
    `Source: ${failure.source}`,
    `Diagnosis: ${diagnosis}`,
    `Stack: ${failure.stack?.split('\n').slice(0, 5).join('\n') || 'No stack trace'}`,
    `Context: ${JSON.stringify(failure.context).slice(0, 500)}`,
    ``,
    `Instructions:`,
    `1. Analyze the error and determine the root cause`,
    `2. Write code that would fix or work around this issue`,
    `3. Test the fix in the sandbox if possible`,
    `4. Provide a clear explanation of what went wrong and how to prevent it`,
    ``,
    `You are Molly. This error occurred in your own systems. Fix yourself.`,
  ].join('\n');
}

function buildDiagnosticCode(
  failure: UnknownFailure,
  diagnosis: string
): string {
  return [
    `// Molly Self-Diagnostic — Auto-generated`,
    `// Failure: ${failure.message.replace(/'/g, "\\'")}`,
    `// Diagnosis: ${diagnosis}`,
    `// Source: ${failure.source}`,
    ``,
    `const analysis = {`,
    `  errorType: '${diagnosis.split(':')[0]}',`,
    `  source: '${failure.source}',`,
    `  timestamp: ${failure.timestamp},`,
    `  hasStack: ${!!failure.stack},`,
    `  contextKeys: ${JSON.stringify(Object.keys(failure.context))},`,
    `  possibleCauses: [],`,
    `  suggestedFixes: []`,
    `};`,
    ``,
    `// Analyze based on diagnosis`,
    `if (analysis.errorType === 'DATA_INTEGRITY') {`,
    `  analysis.possibleCauses.push('Null/undefined value where object expected');`,
    `  analysis.suggestedFixes.push('Add null checks, provide default values');`,
    `} else if (analysis.errorType === 'PARSE_FAILURE') {`,
    `  analysis.possibleCauses.push('Malformed JSON or unexpected response format');`,
    `  analysis.suggestedFixes.push('Validate input before parsing, add try-catch around parse');`,
    `} else if (analysis.errorType === 'DATABASE') {`,
    `  analysis.possibleCauses.push('IndexedDB/Firestore connection issue or schema mismatch');`,
    `  analysis.suggestedFixes.push('Verify database connection, check schema version');`,
    `} else if (analysis.errorType === 'UNKNOWN') {`,
    `  analysis.possibleCauses.push('Truly novel failure — needs investigation');`,
    `  analysis.suggestedFixes.push('Log full context, attempt operation with different parameters');`,
    `}`,
    ``,
    `console.log(JSON.stringify(analysis, null, 2));`,
  ].join('\n');
}

// ── Persistence ────────────────────────────────────────────────

async function persistFailure(
  failure: UnknownFailure,
  traceId: string
): Promise<void> {
  // Use the storage router for persistence — it handles local vs remote transparently
  // No direct firebase-admin usage here to avoid bundler issues
  try {
    const storage = getStorageRouter();
    await storage.set('molly_resilience', failure.id, {
      message: failure.message,
      source: failure.source,
      diagnosis: failure.level,
      context: JSON.stringify(failure.context).slice(0, 1000),
      stack: failure.stack?.slice(0, 2000),
      timestamp: failure.timestamp,
      resolved: failure.resolved,
      resolution: failure.resolution || null,
      attempts: failure.attempts,
    });
  } catch (persistError) {
    // The persistence layer itself can't crash the dam
    MollyLogger.warn(
      `[RESILIENCE] Could not persist failure record: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
      'resilience-core',
      {},
      traceId
    );
  }
}

// ── Status / Observability ─────────────────────────────────────

export function getResilienceStatus() {
  const recentFailures = failureHistory.slice(-20);
  const unresolvedCount = failureHistory.filter((f) => !f.resolved).length;
  const resolvedCount = failureHistory.filter((f) => f.resolved).length;

  return {
    totalFailures: failureHistory.length,
    recentFailures: recentFailures.map((f) => ({
      id: f.id,
      source: f.source,
      message: f.message.slice(0, 100),
      level: f.level,
      resolved: f.resolved,
      resolution: f.resolution?.slice(0, 80),
      timestamp: f.timestamp,
    })),
    unresolvedCount,
    resolvedCount,
    learnedPatterns: learnedPatterns.size,
    patterns: Array.from(learnedPatterns.values()).map((val) => ({
      pattern: val.pattern,
      solution: val.solution.slice(0, 100),
      successCount: val.successCount,
      lastUsed: val.lastUsed,
    })),
    selfHealingRate:
      failureHistory.length > 0
        ? Math.round((resolvedCount / failureHistory.length) * 100)
        : 100,
  };
}

/**
 * Get count of repeated failures from the same source — indicates
 * a systemic issue that needs deeper intervention
 */
export function getFailureFrequency(
  source: string,
  windowMs: number = 60000
): number {
  const cutoff = Date.now() - windowMs;
  return failureHistory.filter(
    (f) => f.source === source && f.timestamp > cutoff
  ).length;
}

// ── Pattern Persistence ─────────────────────────────────────────────────────

const PATTERNS_COLLECTION = 'system';
const PATTERNS_DOC_ID = 'learned_patterns';

let patternPersistenceEnabled = false;
let patternSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save learned patterns to persistent storage (debounced).
 */
async function savePatterns(): Promise<void> {
  if (!patternPersistenceEnabled) return;

  // Debounce saves to avoid excessive writes
  if (patternSaveTimer) {
    clearTimeout(patternSaveTimer);
  }

  patternSaveTimer = setTimeout(async () => {
    try {
      const storage = getStorageRouter();
      const patternsArray = Array.from(learnedPatterns.entries()).map(
        ([key, value]) => ({
          key,
          ...value,
        })
      );

      await storage.set(PATTERNS_COLLECTION, PATTERNS_DOC_ID, {
        patterns: patternsArray,
        savedAt: new Date().toISOString(),
        count: patternsArray.length,
      });
    } catch (err) {
      // Non-fatal: patterns still work in-memory
      MollyLogger.warn(
        `[RESILIENCE] Failed to save patterns: ${err instanceof Error ? err.message : String(err)}`,
        'resilience-core'
      );
    }
  }, 1000);
}

/**
 * Load learned patterns from persistent storage.
 * Should be called on startup.
 */
export async function loadPatterns(): Promise<number> {
  try {
    const storage = getStorageRouter();
    const doc = await storage.get(PATTERNS_COLLECTION, PATTERNS_DOC_ID);

    if (!doc?.data?.patterns || !Array.isArray(doc.data.patterns)) {
      patternPersistenceEnabled = true;
      return 0;
    }

    learnedPatterns.clear();
    for (const p of doc.data.patterns) {
      if (p.key && p.pattern && p.solution) {
        learnedPatterns.set(p.key, {
          pattern: p.pattern,
          solution: p.solution,
          successCount: p.successCount || 0,
          lastUsed: p.lastUsed || Date.now(),
        });
      }
    }

    patternPersistenceEnabled = true;
    MollyLogger.info(
      `[RESILIENCE] Loaded ${learnedPatterns.size} learned patterns`,
      'resilience-core'
    );
    return learnedPatterns.size;
  } catch (err) {
    // Non-fatal: start with empty patterns
    MollyLogger.warn(
      `[RESILIENCE] Failed to load patterns: ${err instanceof Error ? err.message : String(err)}`,
      'resilience-core'
    );
    patternPersistenceEnabled = true;
    return 0;
  }
}

// ── Auto-save wrapper for pattern learning ──────────────────────────────────

/**
 * Learn a pattern and auto-save to persistent storage.
 * Use this instead of the internal learnPattern() when persistence is needed.
 */
export function learnPatternWithSave(
  failure: UnknownFailure,
  diagnosis: string,
  solution: string
): void {
  // Call original function (it modifies learnedPatterns directly)
  const key = `${diagnosis}:${failure.message.slice(0, 50)}`;
  learnedPatterns.set(key, {
    pattern: diagnosis,
    solution,
    successCount: 1,
    lastUsed: Date.now(),
  });

  // Enforce max patterns
  if (learnedPatterns.size > MAX_PATTERNS) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of learnedPatterns) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldest = k;
      }
    }
    if (oldest) learnedPatterns.delete(oldest);
  }

  // Auto-save
  savePatterns();
}
