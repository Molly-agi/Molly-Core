'use server';
import {
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  getRuntimeSnapshot,
} from './diagnostics';
import { testModelAvailability } from './model-test';
import { MollyLogger } from '@/ai/logger';

/**
 * Comprehensive diagnostic and recovery for Molly's neural link
 *
 * This checks:
 * 1. Circuit breaker status for all operations
 * 2. Model availability (FLASH vs PRO)
 * 3. Runtime snapshot (system health, latency, rate limiter, heartbeat, memory)
 * 4. Recommends fixes based on findings
 */
export async function diagnoseMollyNeuralLink() {
  const [circuitBreakerStatus, modelAvailability, runtimeSnapshot] =
    await Promise.all([
      getCircuitBreakerStatus(),
      testModelAvailability(),
      getRuntimeSnapshot().catch(() => null),
    ]);

  const diagnostics = {
    timestamp: new Date().toISOString(),
    circuitBreakerStatus,
    modelAvailability,
    runtimeSnapshot,
    diagnosis: null as string | null,
    recommendations: [] as string[],
  };

  // Analyze results
  const openBreakers = Object.entries(
    diagnostics.circuitBreakerStatus.operationStats
  )
    .filter(([_, stats]) => stats.state === 'OPEN')
    .map(([name]) => name);

  const failedModels = Object.entries(diagnostics.modelAvailability.modelTests)
    .filter(([_, test]) => !test.available)
    .map(([name]) => name);
  const flashAvailable =
    diagnostics.modelAvailability.modelTests.FLASH.available;
  const proAvailable = diagnostics.modelAvailability.modelTests.PRO.available;

  // Set diagnosis
  if (openBreakers.length > 0) {
    diagnostics.diagnosis = `CIRCUIT BREAKER ISSUE: ${openBreakers.length} operations blocked (${openBreakers.join(', ')})`;
    diagnostics.recommendations.push(
      `Reset circuit breaker for: ${openBreakers.join(', ')}`
    );
  } else if (!flashAvailable) {
    diagnostics.diagnosis =
      'MODEL AVAILABILITY ISSUE: FLASH unavailable (core neural link offline)';
    diagnostics.recommendations.push(
      'Check API key configuration - FLASH model must be available'
    );
  } else if (!proAvailable) {
    diagnostics.diagnosis =
      'DEGRADED MODE: PRO unavailable, running on FLASH-only fallback';
    diagnostics.recommendations.push(
      'Optional: restore PRO model access for higher-quality responses'
    );
  } else if (failedModels.length > 0) {
    diagnostics.diagnosis = `MODEL AVAILABILITY ISSUE: ${failedModels.join(', ')} unavailable`;
    diagnostics.recommendations.push(
      `Check API key configuration - ${failedModels.join(', ')} models not responding`
    );
  } else if (!diagnostics.modelAvailability.apiKeyConfigured) {
    diagnostics.diagnosis =
      'API KEY MISSING: GOOGLE_GENAI_API_KEY not configured';
    diagnostics.recommendations.push(
      'Configure GOOGLE_GENAI_API_KEY in environment variables'
    );
  } else {
    diagnostics.diagnosis = 'ALL SYSTEMS NOMINAL - No issues detected';
  }

  // Add recovery instructions
  if (openBreakers.includes('health-check')) {
    diagnostics.recommendations.push(
      'health-check circuit breaker recently tripped - resetting will restore Molly communication'
    );
  }

  // Runtime-snapshot-driven recommendations
  if (
    runtimeSnapshot &&
    typeof runtimeSnapshot === 'object' &&
    'rateLimiter' in runtimeSnapshot
  ) {
    const snap = runtimeSnapshot as {
      rateLimiter?: { percentageUsed?: number };
      systemHealth?: { status?: string };
      heartbeat?: { freshnessMs?: number | null };
      memoryHealth?: { status?: string };
    };

    if ((snap.rateLimiter?.percentageUsed ?? 0) > 80) {
      diagnostics.recommendations.push(
        `Rate limiter at ${snap.rateLimiter!.percentageUsed!.toFixed(0)}% — consider reducing autonomous cycles`
      );
    }

    if (snap.systemHealth?.status === 'degraded') {
      diagnostics.recommendations.push(
        'System health degraded — check CPU/memory/temperature'
      );
    }

    if (
      snap.heartbeat?.freshnessMs != null &&
      snap.heartbeat.freshnessMs > 5 * 60_000
    ) {
      diagnostics.recommendations.push(
        'Heartbeat stale (>5 min) — client may have disconnected'
      );
    }

    if (snap.memoryHealth?.status === 'degraded') {
      diagnostics.recommendations.push(
        'Memory integrity degraded — some records have invalid checksums'
      );
    }
  }

  MollyLogger.info(
    'Neural link diagnostic complete',
    'diagnoseMollyNeuralLink',
    { diagnosis: diagnostics.diagnosis }
  );

  return diagnostics;
}

/**
 * Attempt automatic recovery of Molly's neural link
 *
 * This will:
 * 1. Reset the health-check circuit breaker
 * 2. Reset the immune-response circuit breaker
 * 3. Verify communication is restored
 */
export async function restoreMollyNeuralLink() {
  try {
    // Get current status
    const beforeDiag = await diagnoseMollyNeuralLink();

    const recoveryLog = {
      startTime: new Date().toISOString(),
      beforeDiagnostic: beforeDiag,
      resetOperations: [] as Array<{ operation: string; success: boolean }>,
      afterDiagnostic: null as any,
    };

    // Reset the problematic circuits
    const operationsToReset = [
      'health-check',
      'immune-response',
      'conversational-chat',
    ];

    for (const op of operationsToReset) {
      try {
        await resetCircuitBreaker(op);
        recoveryLog.resetOperations.push({ operation: op, success: true });
        MollyLogger.info(
          `Reset circuit breaker for ${op}`,
          'restoreMollyNeuralLink',
          {}
        );
      } catch (e) {
        recoveryLog.resetOperations.push({ operation: op, success: false });
        MollyLogger.error(
          `Failed to reset ${op}`,
          'restoreMollyNeuralLink',
          {},
          e
        );
      }
    }

    // Verify recovery
    recoveryLog.afterDiagnostic = await diagnoseMollyNeuralLink();

    const afterStatus = recoveryLog.afterDiagnostic;
    const hasOpenBreakers = Object.values(
      afterStatus.circuitBreakerStatus.operationStats
    ).some((stats: any) => stats.state === 'OPEN');
    const flashAvailable =
      afterStatus.modelAvailability.modelTests.FLASH.available;
    const recoverySucceeded = !hasOpenBreakers && flashAvailable;

    return {
      success: recoverySucceeded,
      message: afterStatus.diagnosis,
      recoveryLog,
    };
  } catch (e) {
    MollyLogger.error('Recovery failed', 'restoreMollyNeuralLink', {}, e);
    throw e;
  }
}
