/**
 * @fileOverview System & core tool handlers
 *
 * Tools for basic system operations: shell commands, file reading, health checks.
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { ToolHandler } from './types';

const WORKSPACE_ROOT = process.cwd();

// Safe command allowlist (read-only subset for autonomous use)
const ALLOWED_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'echo',
  'pwd',
  'whoami',
  'date',
  'uptime',
  'df',
  'du',
  'free',
  'ps',
  'which',
  'file',
  'stat',
  'tree',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git --no-pager',
  'npm run lint',
  'npm test',
];

/**
 * Shell metacharacters that enable command injection.
 * These must be blocked even in "allowed" commands.
 */
const DANGEROUS_SHELL_CHARS = /[$`;&<>(){}[\]\n\\]/;

/**
 * Check if a command is safe for autonomous execution
 */
export function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();

  // Block shell metacharacters that enable injection attacks
  if (DANGEROUS_SHELL_CHARS.test(trimmed)) {
    return false;
  }

  const segments = trimmed.split(/\s*\|\s*/);
  return segments.every((segment) => {
    const seg = segment.trim();
    // Require word boundary after allowed prefix
    return ALLOWED_COMMANDS.some(
      (allowed) => seg === allowed || seg.startsWith(allowed + ' ')
    );
  });
}

/**
 * Security: only allow access to project files, block sensitive paths
 */
export function resolveSafePath(relativePath: string): string | null {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  if (/\.env/i.test(resolved)) return null;
  const sensitivePatterns = [/\.pem$/i, /service.account/i, /credentials/i];
  if (sensitivePatterns.some((p) => p.test(resolved))) return null;
  return resolved;
}

/**
 * Execute read-only shell commands
 */
export const codespaceShell: ToolHandler = async (params) => {
  const command = params.command as string;
  if (!command) {
    return { success: false, output: 'No command provided' };
  }
  if (!isCommandSafe(command)) {
    return {
      success: false,
      output:
        'Command blocked for safety. Autonomous mode only allows read-only commands.',
    };
  }
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: WORKSPACE_ROOT,
        timeout: 15000,
        maxBuffer: 1024 * 512,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, output: stderr || error.message });
        } else {
          resolve({
            success: true,
            output: stdout || stderr || '(no output)',
          });
        }
      }
    );
  });
};

/**
 * Read project files safely
 */
export const readProjectFile: ToolHandler = async (params) => {
  const filePath = params.path as string;
  if (!filePath) {
    return { success: false, output: 'No path provided' };
  }
  const safePath = resolveSafePath(filePath);
  if (!safePath) {
    return {
      success: false,
      output: 'Access denied: path outside workspace or blocked',
    };
  }
  try {
    const content = await fs.readFile(safePath, 'utf-8');
    const truncated =
      content.length > 10000
        ? content.slice(0, 10000) +
          `\n... (truncated, ${content.length} chars total)`
        : content;
    return { success: true, output: truncated };
  } catch {
    return { success: false, output: `File not found: ${filePath}` };
  }
};

/**
 * Get basic system health metrics
 */
export const getSystemHealth: ToolHandler = async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const loadAvg = os.loadavg();

  return {
    success: true,
    output: [
      `CPU: ${cpus.length} cores, load: ${loadAvg[0].toFixed(2)}`,
      `RAM: ${Math.round(usedMem / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB (${Math.round((usedMem / totalMem) * 100)}% used)`,
      `Free: ${Math.round(freeMem / 1024 / 1024)}MB`,
      `Uptime: ${Math.round(os.uptime() / 60)} minutes`,
      `Platform: ${os.platform()} ${os.arch()}`,
    ].join('\n'),
  };
};

/**
 * Export all system tool handlers
 */
export const systemToolHandlers: Record<string, ToolHandler> = {
  codespaceShell,
  readProjectFile,
  getSystemHealth,
};
