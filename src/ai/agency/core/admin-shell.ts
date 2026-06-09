/**
 * @fileOverview D.8 Admin Shell — Secure Command Execution & Audit Logging
 *
 * Provides administrative command execution with:
 * - Token-based authentication (handled at middleware layer)
 * - Allowlisted command execution
 * - Append-only audit logging
 * - No string interpolation in handlers (injection protection)
 */

import { createHash } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface CommandResult {
  success: boolean;
  result: string;
  executedAt: string;
}

export interface AuditEntry {
  timestamp: string;
  tokenHash: string;
  command: string;
  success: boolean;
  result: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const ALLOWLIST = new Set([
  'reset-embedding-provider',
  'clear-memory-scar',
  'restart-heartbeat',
  'health-check',
  'audit-log',
]);

const AUDIT_LOG_PATH = resolve(process.cwd(), '.admin-audit.jsonl');

// ============================================================
// AUTH HANDLER
// ============================================================

/**
 * Verify admin token — middleware already checked x-admin-password,
 * this is an extra command-level gate (command-specific allowlist validation)
 */
export function verifyAdminToken(): boolean {
  // Middleware has already authenticated the request.
  // This function is a no-op; actual auth happens at the middleware layer.
  return true;
}

// ============================================================
// COMMAND HANDLERS (No string interpolation)
// ============================================================

/**
 * Reset the embedding provider
 */
async function handleResetEmbeddingProvider(): Promise<string> {
  try {
    const { resetEmbeddingProvider } =
      await import('@/ai/tools/embedding-provider');
    resetEmbeddingProvider();
    return 'Embedding provider reset successfully';
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during reset';
    throw new Error(message);
  }
}

/**
 * Clear memory scar
 */
async function handleClearMemoryScar(): Promise<string> {
  try {
    const { clearNeuralPersistence } =
      await import('@/ai/memory/neural-engram');
    clearNeuralPersistence();
    return 'Memory persistence cleared successfully';
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error clearing memory';
    throw new Error(message);
  }
}

/**
 * Restart heartbeat
 */
async function handleRestartHeartbeat(): Promise<string> {
  try {
    const { resetModelRouter } = await import('@/ai/model-router');
    resetModelRouter();
    return 'Model router reset and heartbeat scheduled for restart';
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error restarting heartbeat';
    throw new Error(message);
  }
}

/**
 * Health check
 */
async function handleHealthCheck(): Promise<string> {
  try {
    const { runFullDiagnostic } =
      await import('@/ai/agency/core/self-diagnostic');
    const diagnostic = await runFullDiagnostic();
    return JSON.stringify(diagnostic, null, 2);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error running diagnostic';
    throw new Error(message);
  }
}

/**
 * Return last 100 audit log entries
 */
async function handleAuditLog(): Promise<string> {
  try {
    const fs = await import('fs');
    if (!fs.existsSync(AUDIT_LOG_PATH)) {
      return 'No audit log entries yet';
    }

    const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const recent = lines.slice(-100);
    return JSON.stringify(
      recent.map((line) => JSON.parse(line)),
      null,
      2
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error reading audit log';
    throw new Error(message);
  }
}

// ============================================================
// COMMAND EXECUTION
// ============================================================

/**
 * Execute an allowlisted command
 */
async function executeCommand(command: string): Promise<CommandResult> {
  const now = new Date().toISOString();

  // Validate command is in allowlist
  if (!ALLOWLIST.has(command)) {
    return {
      success: false,
      result: `Command not in allowlist: ${command}`,
      executedAt: now,
    };
  }

  try {
    let result: string;

    switch (command) {
      case 'reset-embedding-provider':
        result = await handleResetEmbeddingProvider();
        break;
      case 'clear-memory-scar':
        result = await handleClearMemoryScar();
        break;
      case 'restart-heartbeat':
        result = await handleRestartHeartbeat();
        break;
      case 'health-check':
        result = await handleHealthCheck();
        break;
      case 'audit-log':
        result = await handleAuditLog();
        break;
      default:
        const _exhaustive: never = command as never;
        throw new Error(`Unknown command: ${_exhaustive}`);
    }

    return {
      success: true,
      result,
      executedAt: now,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during execution';
    MollyLogger.error(
      'Admin command execution failed',
      'AdminShell',
      { command },
      error
    );
    return {
      success: false,
      result: message,
      executedAt: now,
    };
  }
}

// ============================================================
// AUDIT LOGGER
// ============================================================

/**
 * Log admin command execution for audit trail
 */
export function auditLog(
  tokenHash: string,
  command: string,
  success: boolean,
  result: string
): void {
  try {
    // Ensure directory exists
    const dir = resolve(process.cwd());
    mkdirSync(dir, { recursive: true });

    // Create audit entry
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      tokenHash,
      command,
      success,
      result,
    };

    // Append to JSONL file
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (error) {
    MollyLogger.error(
      'Failed to write audit log',
      'AdminShell',
      { command },
      error
    );
    // Don't throw - audit logging should not fail the request
  }
}

/**
 * Hash token for audit log (SHA-256)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================
// ADMIN SHELL
// ============================================================

export class AdminShell {
  /**
   * Process admin request
   */
  static async process(
    _token: string,
    command: string
  ): Promise<CommandResult> {
    // Verify authentication
    if (!verifyAdminToken()) {
      const tokenHash = hashToken(_token);
      auditLog(tokenHash, command, false, 'Authentication failed');
      return {
        success: false,
        result: 'Authentication failed',
        executedAt: new Date().toISOString(),
      };
    }

    // Execute command
    const result = await executeCommand(command);

    // Log to audit trail
    const tokenHash = hashToken(_token);
    auditLog(tokenHash, command, result.success, result.result);

    return result;
  }
}
