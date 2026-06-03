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
  'env',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git --no-pager',
  'npm run lint',
  'npm test',
];

// Commands that look plausible but don't work inside exec() — block with clear message.
// 'history' is a bash builtin — exec() spawns a new shell with no history. Always returns nothing.
const BUILTIN_COMMANDS_THAT_DONT_WORK = ['history'];

/**
 * Shell metacharacters that enable command injection.
 * These must be blocked even in "allowed" commands.
 *
 * Note: `;` and `&` remain in this list deliberately. Chain operators
 * (`&&`, `||`, `;`) are removed by `splitChain` BEFORE individual
 * segments are validated, so any `;` or `&` still present in a segment
 * here is malicious (background `&`, extra command separator, etc.).
 */
const DANGEROUS_SHELL_CHARS = /[$`;&<>(){}[\]\n\\]/;

type ChainOp = '&&' | '||' | ';' | '';

interface ChainSegment {
  cmd: string;
  /** Operator that FOLLOWS this segment, joining it to the next. '' on the last. */
  op: ChainOp;
}

/**
 * Split a command string on top-level `&&`, `||`, and `;` operators.
 * Single `|` (pipe) is preserved inside segments — pipes are validated
 * by `isSegmentSafe`. Returns segments with the operator that follows
 * each one, so the executor knows the chain semantics.
 */
export function splitChain(input: string): ChainSegment[] {
  const parts: ChainSegment[] = [];
  let buf = '';
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (ch === '&' && next === '&') {
      parts.push({ cmd: buf.trim(), op: '&&' });
      buf = '';
      i += 2;
    } else if (ch === '|' && next === '|') {
      parts.push({ cmd: buf.trim(), op: '||' });
      buf = '';
      i += 2;
    } else if (ch === ';') {
      parts.push({ cmd: buf.trim(), op: ';' });
      buf = '';
      i += 1;
    } else {
      buf += ch;
      i += 1;
    }
  }
  parts.push({ cmd: buf.trim(), op: '' });
  return parts;
}

/**
 * Validate a single chain segment (after chain-splitting).
 * Pipes within the segment are still allowed and validated per-subsegment.
 */
function isSegmentSafe(segment: string): boolean {
  const seg = segment.trim();
  if (!seg) return false;
  if (DANGEROUS_SHELL_CHARS.test(seg)) return false;
  const baseCmd = seg.split(' ')[0];
  if (BUILTIN_COMMANDS_THAT_DONT_WORK.includes(baseCmd)) return false;
  const pipeSegs = seg.split(/\s*\|\s*/);
  return pipeSegs.every((s) => {
    const t = s.trim();
    return ALLOWED_COMMANDS.some(
      (allowed) => t === allowed || t.startsWith(allowed + ' ')
    );
  });
}

/**
 * Check if a command is safe for autonomous execution.
 * Supports chain operators `&&`, `||`, `;` between allowlisted segments.
 */
export function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const chain = splitChain(trimmed);
  // Last entry has op:'' and may be empty if input ended in an operator.
  // Any other empty segment means consecutive operators (e.g. "ls && && pwd").
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].cmd) return false;
  }
  if (!chain[chain.length - 1].cmd) return false;
  return chain.every((p) => isSegmentSafe(p.cmd));
}

/** Find the first segment whose base command is a known-broken builtin. */
function firstBlockedBuiltin(chain: ChainSegment[]): string | null {
  for (const seg of chain) {
    const baseCmd = seg.cmd.split(' ')[0];
    if (BUILTIN_COMMANDS_THAT_DONT_WORK.includes(baseCmd)) return baseCmd;
  }
  return null;
}

function execSegment(
  cmd: string
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(
      cmd,
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
 * Execute a validated chain sequentially, honoring `&&` / `||` / `;`.
 * Final success = success of the last segment that actually ran.
 */
async function runChain(
  chain: ChainSegment[]
): Promise<{ success: boolean; output: string }> {
  let lastSuccess = true;
  let lastRan = false;
  const outputs: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const { cmd } = chain[i];
    const prevOp: ChainOp = i === 0 ? ';' : chain[i - 1].op;
    if (prevOp === '&&' && !lastSuccess) continue;
    if (prevOp === '||' && lastSuccess) continue;
    const result = await execSegment(cmd);
    lastSuccess = result.success;
    lastRan = true;
    if (result.output) outputs.push(result.output);
  }
  return {
    success: lastRan ? lastSuccess : true,
    output: outputs.join('\n').trim() || '(no output)',
  };
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
  const command = params.command as string;
  if (!command) {
    return { success: false, output: 'No command provided' };
  }

  const chain = splitChain(command.trim());

  // Give specific feedback for builtins that silently fail in exec()
  const blockedBuiltin = firstBlockedBuiltin(chain);
  if (blockedBuiltin) {
    return {
      success: false,
      output: `'${blockedBuiltin}' is a shell builtin and does not work inside exec(). It always returns empty. Use 'ps aux | grep node' to inspect processes, or 'cat' a log file to review recent activity instead.`,
    };
  }

  if (!isCommandSafe(command)) {
    return {
      success: false,
      output:
        'Command blocked for safety. Autonomous mode only allows read-only commands (ls, cat, grep, find, git status/log/diff, ps, df, free, env, etc). Pipe (|) is allowed within segments; && / || / ; chain across allowlisted segments.',
    };
  }

  return runChain(chain);
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
