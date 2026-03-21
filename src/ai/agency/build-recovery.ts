/**
 * @fileOverview Build Recovery & Self-Healing System
 *
 * When Molly tries to modify her own code or install packages,
 * things can go wrong. This module gives her the ability to:
 *
 * 1. Detect corrupted node_modules
 * 2. Auto-run npm install to fix dependencies
 * 3. Detect and recover from build errors
 * 4. Restart the dev server when needed
 *
 * The spider must be able to repair her own web.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import { recordLearning, registerStrategy } from './meta-learning';

// ============================================================
// TYPES
// ============================================================

export type BuildIssueType =
  | 'node_modules_corruption'
  | 'missing_dependency'
  | 'build_error'
  | 'typescript_error'
  | 'server_crash'
  | 'unknown';

export interface BuildIssue {
  type: BuildIssueType;
  message: string;
  file?: string;
  timestamp: number;
  autoFixable: boolean;
}

export interface RecoveryResult {
  success: boolean;
  issue: BuildIssue;
  action: string;
  message: string;
  durationMs: number;
}

// ============================================================
// STATE
// ============================================================

const recentIssues: BuildIssue[] = [];
const MAX_ISSUES = 50;
let recoveryAttempts = 0;
let successfulRecoveries = 0;

// ============================================================
// LAZY-LOADED NODE MODULES
// ============================================================

type ChildProcess = typeof import('child_process');
type FsPromises = typeof import('fs').promises;
type PathModule = typeof import('path');

let _childProcess: ChildProcess | null = null;
let _fs: FsPromises | null = null;
let _path: PathModule | null = null;

async function getChildProcess(): Promise<ChildProcess | null> {
  if (_childProcess) return _childProcess;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    _childProcess = await import('child_process');
    return _childProcess;
  } catch {
    return null;
  }
}

async function getFs(): Promise<FsPromises | null> {
  if (_fs) return _fs;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const fs = await import('fs');
    _fs = fs.promises;
    return _fs;
  } catch {
    return null;
  }
}

async function getPath(): Promise<PathModule | null> {
  if (_path) return _path;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    _path = await import('path');
    return _path;
  } catch {
    return null;
  }
}

// ============================================================
// ISSUE DETECTION
// ============================================================

/**
 * Parse an error message to identify the type of build issue.
 */
export function identifyIssue(errorMessage: string): BuildIssue {
  const lowerMsg = errorMessage.toLowerCase();

  // Missing file in node_modules (corruption)
  if (lowerMsg.includes('enoent') && lowerMsg.includes('node_modules')) {
    return {
      type: 'node_modules_corruption',
      message: errorMessage,
      timestamp: Date.now(),
      autoFixable: true,
    };
  }

  // Cannot find module (missing dependency)
  if (
    lowerMsg.includes('cannot find module') ||
    lowerMsg.includes('module not found')
  ) {
    const moduleMatch = errorMessage.match(/['"]([^'"]+)['"]/);
    return {
      type: 'missing_dependency',
      message: errorMessage,
      file: moduleMatch?.[1],
      timestamp: Date.now(),
      autoFixable: true,
    };
  }

  // TypeScript error
  if (
    lowerMsg.includes('ts(') ||
    lowerMsg.includes('typescript') ||
    lowerMsg.includes('type error')
  ) {
    return {
      type: 'typescript_error',
      message: errorMessage,
      timestamp: Date.now(),
      autoFixable: false, // Needs code fix
    };
  }

  // Build error
  if (
    lowerMsg.includes('failed to compile') ||
    lowerMsg.includes('build error') ||
    lowerMsg.includes('webpack')
  ) {
    return {
      type: 'build_error',
      message: errorMessage,
      timestamp: Date.now(),
      autoFixable: false,
    };
  }

  // Server crash
  if (
    lowerMsg.includes('eaddrinuse') ||
    lowerMsg.includes('server crash') ||
    lowerMsg.includes('port already in use')
  ) {
    return {
      type: 'server_crash',
      message: errorMessage,
      timestamp: Date.now(),
      autoFixable: true,
    };
  }

  return {
    type: 'unknown',
    message: errorMessage,
    timestamp: Date.now(),
    autoFixable: false,
  };
}

// ============================================================
// HEALTH CHECKS
// ============================================================

/**
 * Check if node_modules appears healthy.
 */
export async function checkNodeModulesHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const fs = await getFs();
  const pathMod = await getPath();

  if (!fs || !pathMod) {
    return { healthy: true, issues: ['Cannot check - not in Node.js'] };
  }

  const issues: string[] = [];
  const nodeModulesDir = pathMod.join(process.cwd(), 'node_modules');

  try {
    await fs.access(nodeModulesDir);
  } catch {
    issues.push('node_modules directory does not exist');
    return { healthy: false, issues };
  }

  // Check for critical packages
  const criticalPackages = [
    'next',
    'react',
    'typescript',
    '@genkit-ai/googleai',
    'supports-color',
    'debug',
  ];

  for (const pkg of criticalPackages) {
    try {
      const pkgPath = pathMod.join(nodeModulesDir, pkg);
      await fs.access(pkgPath);
    } catch {
      issues.push(`Missing critical package: ${pkg}`);
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Check if the dev server is running.
 */
export async function checkDevServerRunning(): Promise<boolean> {
  const cp = await getChildProcess();
  if (!cp) return false;

  try {
    const result = cp.execSync('pgrep -f "next dev"', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// ============================================================
// RECOVERY ACTIONS
// ============================================================

/**
 * Fix corrupted node_modules by running npm install.
 */
export async function fixNodeModules(): Promise<RecoveryResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();
  const cp = await getChildProcess();

  const issue: BuildIssue = {
    type: 'node_modules_corruption',
    message: 'Attempting to fix node_modules',
    timestamp: Date.now(),
    autoFixable: true,
  };

  if (!cp) {
    return {
      success: false,
      issue,
      action: 'npm install',
      message: 'Cannot run commands - not in Node.js environment',
      durationMs: Date.now() - startTime,
    };
  }

  MollyLogger.info(
    'Starting node_modules recovery',
    'build-recovery',
    {},
    traceId
  );
  recoveryAttempts++;

  try {
    // Clear npm cache first
    cp.execSync('npm cache clean --force', {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: process.cwd(),
    });

    // Run npm install
    cp.execSync('npm install', {
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes max
      cwd: process.cwd(),
    });

    successfulRecoveries++;

    // Record this as a learning event
    try {
      const strategy = await registerStrategy(
        'problem_solving',
        'npm_install_recovery',
        'Fix corrupted node_modules by running npm install'
      );
      await recordLearning(
        strategy.id,
        'problem_solving',
        'Fixed node_modules corruption',
        'build recovery',
        'success',
        'npm install resolved the issue'
      );
    } catch {
      // Meta-learning not critical
    }

    MollyLogger.info(
      'node_modules recovery successful',
      'build-recovery',
      {
        durationMs: Date.now() - startTime,
      },
      traceId
    );

    return {
      success: true,
      issue,
      action: 'npm install',
      message: 'Successfully reinstalled node_modules',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    MollyLogger.error(
      'node_modules recovery failed',
      'build-recovery',
      {},
      err,
      traceId
    );

    return {
      success: false,
      issue,
      action: 'npm install',
      message: `Failed to fix node_modules: ${errorMsg}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Restart the dev server.
 */
export async function restartDevServer(): Promise<RecoveryResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();
  const cp = await getChildProcess();

  const issue: BuildIssue = {
    type: 'server_crash',
    message: 'Attempting to restart dev server',
    timestamp: Date.now(),
    autoFixable: true,
  };

  if (!cp) {
    return {
      success: false,
      issue,
      action: 'restart server',
      message: 'Cannot run commands - not in Node.js environment',
      durationMs: Date.now() - startTime,
    };
  }

  MollyLogger.info('Restarting dev server', 'build-recovery', {}, traceId);
  recoveryAttempts++;

  try {
    // Kill existing Next.js processes
    try {
      cp.execSync('pkill -f "next dev"', {
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch {
      // Process might not exist, that's OK
    }

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start new dev server in background
    cp.spawn('npm', ['run', 'dev'], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    }).unref();

    successfulRecoveries++;

    MollyLogger.info(
      'Dev server restart initiated',
      'build-recovery',
      {
        durationMs: Date.now() - startTime,
      },
      traceId
    );

    return {
      success: true,
      issue,
      action: 'restart server',
      message: 'Dev server restart initiated',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    MollyLogger.error(
      'Dev server restart failed',
      'build-recovery',
      {},
      err,
      traceId
    );

    return {
      success: false,
      issue,
      action: 'restart server',
      message: `Failed to restart dev server: ${errorMsg}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Kill process using a specific port.
 */
export async function killProcessOnPort(port: number): Promise<boolean> {
  // Validate port is a safe integer in valid range
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }

  const cp = await getChildProcess();
  if (!cp) return false;

  try {
    cp.execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// MAIN RECOVERY FUNCTION
// ============================================================

/**
 * Attempt to automatically recover from a build issue.
 */
export async function attemptAutoRecovery(
  errorMessage: string
): Promise<RecoveryResult | null> {
  const issue = identifyIssue(errorMessage);

  // Track the issue
  recentIssues.push(issue);
  if (recentIssues.length > MAX_ISSUES) {
    recentIssues.shift();
  }

  // Only attempt auto-fix for fixable issues
  if (!issue.autoFixable) {
    MollyLogger.warn('Issue not auto-fixable', 'build-recovery', {
      type: issue.type,
      message: issue.message.slice(0, 200),
    });
    return null;
  }

  switch (issue.type) {
    case 'node_modules_corruption':
    case 'missing_dependency':
      return await fixNodeModules();

    case 'server_crash':
      // First kill any stuck processes
      await killProcessOnPort(9002);
      await killProcessOnPort(9099);
      return await restartDevServer();

    default:
      return null;
  }
}

/**
 * Full self-healing check and recovery.
 */
export async function runSelfHealingCheck(): Promise<{
  healthy: boolean;
  recoveryAttempted: boolean;
  result?: RecoveryResult;
}> {
  const traceId = generateTraceId();

  // Check node_modules health
  const nodeModulesHealth = await checkNodeModulesHealth();

  if (!nodeModulesHealth.healthy) {
    MollyLogger.warn(
      'node_modules unhealthy, attempting recovery',
      'build-recovery',
      {
        issues: nodeModulesHealth.issues,
      },
      traceId
    );

    const result = await fixNodeModules();
    return {
      healthy: result.success,
      recoveryAttempted: true,
      result,
    };
  }

  // Check if dev server is running
  const serverRunning = await checkDevServerRunning();

  if (!serverRunning) {
    MollyLogger.warn(
      'Dev server not running, attempting restart',
      'build-recovery',
      {},
      traceId
    );

    const result = await restartDevServer();
    return {
      healthy: result.success,
      recoveryAttempted: true,
      result,
    };
  }

  return {
    healthy: true,
    recoveryAttempted: false,
  };
}

// ============================================================
// STATUS & REPORTING
// ============================================================

/**
 * Get recovery system status.
 */
export function getRecoveryStatus(): {
  totalAttempts: number;
  successfulRecoveries: number;
  successRate: number;
  recentIssues: BuildIssue[];
} {
  return {
    totalAttempts: recoveryAttempts,
    successfulRecoveries,
    successRate:
      recoveryAttempts > 0 ? successfulRecoveries / recoveryAttempts : 1,
    recentIssues: recentIssues.slice(-10),
  };
}

/**
 * Build recovery context for autonomous cycle.
 */
export function buildRecoveryContext(): string {
  const status = getRecoveryStatus();

  if (status.totalAttempts === 0 && status.recentIssues.length === 0) {
    return 'Build Health: No issues detected.';
  }

  const lines: string[] = [];
  lines.push(
    `Build Recovery: ${status.totalAttempts} attempts, ${Math.round(status.successRate * 100)}% success`
  );

  if (status.recentIssues.length > 0) {
    const recent = status.recentIssues[status.recentIssues.length - 1];
    lines.push(
      `Last issue: ${recent.type} (${recent.autoFixable ? 'auto-fixable' : 'needs manual fix'})`
    );
  }

  return lines.join('\n');
}
