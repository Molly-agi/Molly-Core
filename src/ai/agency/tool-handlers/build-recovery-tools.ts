/**
 * @fileOverview Build Recovery Tool Handlers
 *
 * Extracted from tool-executor.ts for cleaner modular organization.
 * Handles self-healing for node_modules and build errors.
 */

import type { ToolResult, ToolHandlerMap } from './types';

async function handleBuildRecovery(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  // Lazy import to avoid circular deps
  const {
    checkNodeModulesHealth,
    checkDevServerRunning,
    fixNodeModules,
    restartDevServer,
    runSelfHealingCheck,
    getRecoveryStatus,
    attemptAutoRecovery,
  } = await import('../core/build-recovery');

  if (action === 'check' || !action) {
    const health = await checkNodeModulesHealth();
    const serverRunning = await checkDevServerRunning();
    const status = getRecoveryStatus();

    return {
      success: health.healthy && serverRunning,
      output: [
        `node_modules: ${health.healthy ? 'healthy' : 'UNHEALTHY'}`,
        health.issues.length > 0 ? `  Issues: ${health.issues.join(', ')}` : '',
        `Dev server: ${serverRunning ? 'running' : 'NOT RUNNING'}`,
        `Recovery stats: ${status.totalAttempts} attempts, ${Math.round(status.successRate * 100)}% success`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (action === 'fix' || action === 'repair') {
    const result = await fixNodeModules();
    return {
      success: result.success,
      output: result.message,
    };
  }

  if (action === 'restart') {
    const result = await restartDevServer();
    return {
      success: result.success,
      output: result.message,
    };
  }

  if (action === 'heal' || action === 'auto') {
    const result = await runSelfHealingCheck();
    if (!result.recoveryAttempted) {
      return {
        success: true,
        output: 'All systems healthy - no recovery needed',
      };
    }
    return {
      success: result.healthy,
      output: result.result
        ? `Recovery ${result.result.success ? 'succeeded' : 'failed'}: ${result.result.message}`
        : 'Recovery attempted',
    };
  }

  if (action === 'recover') {
    const errorMsg = params.error as string;
    if (!errorMsg) {
      return {
        success: false,
        output:
          'Please provide an error message to analyze: { action: "recover", error: "..." }',
      };
    }
    const result = await attemptAutoRecovery(errorMsg);
    if (!result) {
      return {
        success: false,
        output:
          'This error is not auto-recoverable. Manual intervention needed.',
      };
    }
    return {
      success: result.success,
      output: result.message,
    };
  }

  return {
    success: false,
    output: 'Unknown action. Use: check, fix, restart, heal, recover',
  };
}

export const buildRecoveryToolHandlers: ToolHandlerMap = {
  buildRecovery: handleBuildRecovery,
};
