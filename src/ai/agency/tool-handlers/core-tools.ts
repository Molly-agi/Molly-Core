/**
 * Core tools - Bug hunter, critic agent, and resiliency
 * Essential infrastructure for code quality and error handling
 */

import type { ToolHandler } from './types';

// Bug Hunter imports
import {
  runTests,
  detectIssues,
  trackError,
  getRecentErrors,
  clearErrors,
  analyzeRuntimeErrors,
  checkBuild,
  huntBugs,
  quickHunt,
} from '@/ai/agency/core/bug-hunter';

// Critic Agent imports
import {
  critique,
  createRefinementRequest,
  applyRefinements,
  critiqueAndRefine,
  setStrictness,
  setCriterionEnabled,
  setCriterionThreshold,
  getCriticStatus,
  getRecentCritiques,
  saveCriticState,
  loadCriticState,
  resetCriticState,
} from '@/ai/agency/core/critic-agent';

// Resiliency imports
import {
  getCircuitBreaker,
  createStructuredError,
  wrapError,
  isStructuredError,
  getErrorChain,
  executeRecoveryChain,
  createRecoveryChain,
  getHealthMetrics,
  getRecentErrors as getRecentStructuredErrors,
  clearErrorHistory,
  resetAllCircuitBreakers,
} from '@/ai/agency/core/resiliency';

// ════════════════════════════════════════════════════════════════════════════
// Bug Hunter Tool — Testing and Issue Detection
// ════════════════════════════════════════════════════════════════════════════

export const bugHunter: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'runTests') {
    const testPath = params.testPath as string;
    const watch = params.watch as boolean;
    try {
      const result = await runTests({ testPath, watch });
      return {
        success: result.success,
        output: `Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Test run failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'detectIssues') {
    const filePath = params.filePath as string;
    if (!filePath) return { success: false, output: 'Missing: filePath' };
    try {
      const result = await detectIssues(filePath);
      const list = result.issues
        .slice(0, 10)
        .map((i) => `• [${i.severity}] ${i.message}`)
        .join('\n');
      return {
        success:
          result.issues.filter(
            (i) => i.severity === 'critical' || i.severity === 'error'
          ).length === 0,
        output: `Issues in ${filePath} (${result.issues.length}):\n${list || '(none)'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Detect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'trackError') {
    const message = params.message as string;
    const source = params.source as string;
    const stack = params.stack as string;
    if (!message) return { success: false, output: 'Missing: message' };
    trackError({ message, source, stack });
    return {
      success: true,
      output: `Error tracked: ${message.slice(0, 50)}...`,
    };
  }

  if (action === 'getErrors') {
    const limit = (params.limit as number) || 10;
    const errors = getRecentErrors(limit);
    const list = errors
      .map((e) => `• [${e.source || 'unknown'}] ${e.message.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Recent errors (${errors.length}):\n${list || '(none)'}`,
      data: errors,
    };
  }

  if (action === 'clearErrors') {
    clearErrors();
    return { success: true, output: 'Error history cleared.' };
  }

  if (action === 'analyzeErrors') {
    const result = analyzeRuntimeErrors();
    return {
      success: true,
      output: `Error analysis: ${result.issues?.length || 0} patterns found`,
      data: result,
    };
  }

  if (action === 'checkBuild') {
    try {
      const result = await checkBuild();
      return {
        success: result.success,
        output: result.success
          ? 'Build check passed'
          : `Build check failed: ${result.errors?.length || 0} errors`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Build check failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'hunt') {
    try {
      const result = await huntBugs();
      return {
        success: result.overallSuccess,
        output: `Bug hunt complete: ${result.totalIssues} issues found across ${result.filesScanned} files`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Hunt failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'quickHunt') {
    try {
      const result = await quickHunt();
      return {
        success: result.overallSuccess,
        output: `Quick hunt: ${result.totalIssues} issues`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Quick hunt failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown bugHunter action. Use: runTests, detectIssues, trackError, getErrors, clearErrors, analyzeErrors, checkBuild, hunt, quickHunt',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Critic Agent Tool — Code Quality and Refinement
// ════════════════════════════════════════════════════════════════════════════

export const criticAgent: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadCriticState();
      return { success: true, output: 'Critic state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveCriticState();
      return { success: true, output: 'Critic state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    const status = getCriticStatus();
    return {
      success: true,
      output: `Critic: strictness ${status.strictness}, ${status.totalCritiques} critiques, avg score ${status.averageScore.toFixed(2)}`,
      data: status,
    };
  }

  if (action === 'critique') {
    const content = params.content as string;
    const contentType = (params.contentType as string) || 'code';
    if (!content) return { success: false, output: 'Missing: content' };
    try {
      const result = critique(content, contentType);
      return {
        success: result.overallScore >= 0.7,
        output: `Critique score: ${(result.overallScore * 100).toFixed(0)}%\nLevel: ${result.level}\nSuggestions: ${result.suggestions.length}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Critique failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'createRefinement') {
    const content = params.content as string;
    const critiqueResult = params.critiqueResult as unknown;
    if (!content || !critiqueResult)
      return { success: false, output: 'Missing: content, critiqueResult' };
    try {
      const request = createRefinementRequest(
        content,
        critiqueResult as Parameters<typeof createRefinementRequest>[1]
      );
      return {
        success: true,
        output: `Refinement request created: ${request.suggestions.length} suggestions`,
        data: request,
      };
    } catch (err) {
      return {
        success: false,
        output: `Create failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'applyRefinements') {
    const request = params.request as unknown;
    if (!request) return { success: false, output: 'Missing: request' };
    try {
      const result = applyRefinements(
        request as Parameters<typeof applyRefinements>[0]
      );
      return {
        success: result.improved,
        output: `Refinements: ${result.appliedCount} applied, improvement: ${result.improved ? 'yes' : 'no'}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Apply failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'critiqueAndRefine') {
    const content = params.content as string;
    const contentType = (params.contentType as string) || 'code';
    if (!content) return { success: false, output: 'Missing: content' };
    try {
      const result = critiqueAndRefine(content, contentType);
      return {
        success: result.refinement.improved,
        output: `Critique & refine: ${(result.critique.overallScore * 100).toFixed(0)}% → ${result.refinement.appliedCount} refinements`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Critique and refine failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'setStrictness') {
    const level = params.level as number;
    if (level === undefined)
      return { success: false, output: 'Missing: level' };
    setStrictness(level);
    return { success: true, output: `Strictness set to ${level}` };
  }

  if (action === 'setCriterionEnabled') {
    const criterion = params.criterion as string;
    const enabled = params.enabled as boolean;
    if (!criterion || enabled === undefined)
      return { success: false, output: 'Missing: criterion, enabled' };
    setCriterionEnabled(
      criterion as Parameters<typeof setCriterionEnabled>[0],
      enabled
    );
    return {
      success: true,
      output: `${criterion} ${enabled ? 'enabled' : 'disabled'}`,
    };
  }

  if (action === 'setCriterionThreshold') {
    const criterion = params.criterion as string;
    const threshold = params.threshold as number;
    if (!criterion || threshold === undefined)
      return { success: false, output: 'Missing: criterion, threshold' };
    setCriterionThreshold(
      criterion as Parameters<typeof setCriterionThreshold>[0],
      threshold
    );
    return {
      success: true,
      output: `${criterion} threshold set to ${threshold}`,
    };
  }

  if (action === 'recentCritiques') {
    const limit = (params.limit as number) || 10;
    const critiques = getRecentCritiques(limit);
    const list = critiques
      .map((c) => `• ${(c.overallScore * 100).toFixed(0)}% - ${c.level}`)
      .join('\n');
    return {
      success: true,
      output: `Recent critiques:\n${list || '(none)'}`,
      data: critiques,
    };
  }

  if (action === 'reset') {
    resetCriticState();
    return { success: true, output: 'Critic state reset.' };
  }

  return {
    success: false,
    output:
      'Unknown criticAgent action. Use: load, save, status, critique, createRefinement, applyRefinements, critiqueAndRefine, setStrictness, setCriterionEnabled, setCriterionThreshold, recentCritiques, reset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Resiliency Tool — Error Handling and Circuit Breakers
// ════════════════════════════════════════════════════════════════════════════

export const resiliency: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'health') {
    const metrics = getHealthMetrics();
    return {
      success: metrics.healthScore >= 0.7,
      output: `Health: ${(metrics.healthScore * 100).toFixed(0)}%\nErrors: ${metrics.errorCount}\nCircuit breakers: ${metrics.circuitBreakers}`,
      data: metrics,
    };
  }

  if (action === 'getCircuit') {
    const name = params.name as string;
    if (!name) return { success: false, output: 'Missing: name' };
    const breaker = getCircuitBreaker(name);
    return {
      success: true,
      output: `Circuit "${name}": ${breaker.getState()}`,
      data: { name, state: breaker.getState() },
    };
  }

  if (action === 'resetCircuits') {
    resetAllCircuitBreakers();
    return { success: true, output: 'All circuit breakers reset.' };
  }

  if (action === 'getErrors') {
    const limit = (params.limit as number) || 10;
    const errors = getRecentStructuredErrors(limit);
    const list = errors
      .map((e) => `• [${e.severity}] ${e.code}: ${e.message.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Structured errors (${errors.length}):\n${list || '(none)'}`,
      data: errors,
    };
  }

  if (action === 'clearErrors') {
    clearErrorHistory();
    return { success: true, output: 'Error history cleared.' };
  }

  if (action === 'createError') {
    const code = params.code as string;
    const message = params.message as string;
    const severity = (params.severity as string) || 'medium';
    if (!code || !message)
      return { success: false, output: 'Missing: code, message' };
    const error = createStructuredError({
      code,
      message,
      severity: severity as 'low' | 'medium' | 'high' | 'critical',
    });
    return {
      success: true,
      output: `Structured error created: ${error.code}`,
      data: error,
    };
  }

  if (action === 'wrapError') {
    const code = params.code as string;
    const message = params.message as string;
    const cause = params.cause as Error;
    if (!code || !message)
      return { success: false, output: 'Missing: code, message' };
    const wrapped = wrapError(code, message, cause);
    return {
      success: true,
      output: `Error wrapped: ${wrapped.code}`,
      data: wrapped,
    };
  }

  if (action === 'getErrorChain') {
    const error = params.error as unknown;
    if (!error || !isStructuredError(error))
      return {
        success: false,
        output: 'Missing or invalid: error (must be StructuredError)',
      };
    const chain = getErrorChain(error);
    return {
      success: true,
      output: `Error chain:\n  ${chain.join('\n  ')}`,
      data: chain,
    };
  }

  if (action === 'createRecoveryChain') {
    const name = params.name as string;
    const actions = params.actions as unknown[];
    if (!name || !actions)
      return { success: false, output: 'Missing: name, actions' };
    const chain = createRecoveryChain(
      name,
      actions as Parameters<typeof createRecoveryChain>[1]
    );
    return {
      success: true,
      output: `Recovery chain "${name}" created with ${chain.actions.length} actions`,
      data: chain,
    };
  }

  if (action === 'executeRecovery') {
    const chain = params.chain as unknown;
    const error = params.error as unknown;
    if (!chain) return { success: false, output: 'Missing: chain' };
    try {
      const result = await executeRecoveryChain(
        chain as Parameters<typeof executeRecoveryChain>[0],
        error as Error
      );
      return {
        success: result.finalStatus === 'success',
        output: `Recovery: ${result.finalStatus}\nAttempted: ${result.attemptedActions}, Succeeded: ${result.successfulActions}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Recovery failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown resiliency action. Use: health, getCircuit, resetCircuits, getErrors, clearErrors, createError, wrapError, getErrorChain, createRecoveryChain, executeRecovery',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Export all core handlers
// ════════════════════════════════════════════════════════════════════════════

export const coreToolHandlers: Record<string, ToolHandler> = {
  bugHunter,
  criticAgent,
  resiliency,
};
