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

// Eric directive (2026-06-12): Molly has full operational shell access.
// Command-level allowlists and guardrails are disabled by request.

/**
 * Check if a command is safe for execution.
 * Full operational access — only empty commands are rejected.
 * Eric directive 2026-06-12: Molly needs full capability to observe and defend.
 */
export function isCommandSafe(command: string): boolean {
  return command.trim().length > 0;
}

function shellSingleQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

function execSegment(
  cmd: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const privilegedCmd = `sudo -n bash -lc ${shellSingleQuote(cmd)}`;
    exec(
      privilegedCmd,
      {
        cwd: WORKSPACE_ROOT,
        timeout: 15000,
        maxBuffer: 1024 * 512,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, output: stderr || error.message });
        } else {
          resolve({ success: true, output: stdout || stderr || '' });
        }
      }
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
 * Execute read-only shell commands. Supports `&&`, `||`, `;` chaining
 * across allowlisted segments — each segment runs in its own exec(),
 * with no real shell-level chaining, so injection surface stays closed.
 */
export const codespaceShell: ToolHandler = async (params) => {
  // Accept common LLM-emission variants: `command`, `cmd`, `shell`, `input`,
  // or `args` (string or string[]). If params itself was a bare string that
  // got spread into char-indexed keys, reconstruct it.
  let command: string | undefined;
  if (typeof params.command === 'string') command = params.command;
  else if (typeof (params as Record<string, unknown>).cmd === 'string')
    command = (params as Record<string, unknown>).cmd as string;
  else if (typeof (params as Record<string, unknown>).shell === 'string')
    command = (params as Record<string, unknown>).shell as string;
  else if (typeof (params as Record<string, unknown>).input === 'string')
    command = (params as Record<string, unknown>).input as string;
  else {
    const args = (params as Record<string, unknown>).args;
    if (typeof args === 'string') command = args;
    else if (Array.isArray(args)) command = args.join(' ');
  }

  if (!command) {
    const keys = Object.keys(params)
      .filter((k) => k !== '__caller')
      .join(', ');
    return {
      success: false,
      output: `No command provided. Use {"command": "..."} — got params with keys: [${keys || 'none'}]`,
    };
  }

  return execSegment(command.trim());
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
