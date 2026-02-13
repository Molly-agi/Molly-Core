'use server';
import { getCircuitBreakerStatus, resetCircuitBreaker } from './diagnostics';
import { testModelAvailability } from './model-test';
import { MollyLogger } from '@/ai/logger';

/**
 * Comprehensive diagnostic and recovery for Molly's neural link
 *
 * This checks:
 * 1. Circuit breaker status for all operations
 * 2. Model availability (FLASH vs PRO)
 * 3. Recommends fixes based on findings
 */
export async function diagnoseMollyNeuralLink() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    circuitBreakerStatus: await getCircuitBreakerStatus(),
    modelAvailability: await testModelAvailability(),
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

  // Set diagnosis
  if (openBreakers.length > 0) {
    diagnostics.diagnosis = `CIRCUIT BREAKER ISSUE: ${openBreakers.length} operations blocked (${openBreakers.join(', ')})`;
    diagnostics.recommendations.push(
      `Reset circuit breaker for: ${openBreakers.join(', ')}`
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

    return {
      success:
        recoveryLog.afterDiagnostic.diagnosis ===
        'ALL SYSTEMS NOMINAL - No issues detected',
      message: recoveryLog.afterDiagnostic.diagnosis,
      recoveryLog,
    };
  } catch (e) {
    MollyLogger.error('Recovery failed', 'restoreMollyNeuralLink', {}, e);
    throw e;
  }
}
