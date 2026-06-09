/**
 * @fileOverview Autonomous operation tool handlers
 *
 * Wires safeBatch and actionLog into the modular tool handler registry.
 * Logic is implemented directly here to avoid Genkit return-type ambiguity.
 */

import type { ToolHandler } from './types';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const ROOT = '/workspaces/Molly-Core';
const SANDBOX = path.join(ROOT, 'sandbox', 'molly-workspace');
const MOLLY_CONTEXT = path.join(ROOT, '.molly-context');
const BRIDGE_URL = 'http://localhost:9099/api/bridge';

// Read-only / status-only commands. Dangerous file-mutation commands (rm, cat, cp,
// mv, find, node -e) are intentionally absent — use typed step variants instead.
const SAFE_SHELL_PREFIXES = [
  'ls', 'du ', 'du\t', 'df ', 'df\t', 'df -',
  'wc ', 'wc\t', 'date', 'pwd',
  'stat ', 'stat\t', 'file ', 'file\t',
  'echo ', 'echo\t',
  'free', 'uptime', 'ps ', 'ps\t', 'ps -',
  'node --version',
  'head ', 'head\t', 'tail ', 'tail\t',
];

// Shell metacharacters that enable injection or redirection
const SHELL_INJECTION_RE = /[;|&`$><\n\r]/;

function isSafeCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (SHELL_INJECTION_RE.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  return SAFE_SHELL_PREFIXES.some(
    (p) => lower === p.trimEnd() || lower.startsWith(p.toLowerCase())
  );
}

function isSafePath(filePath: string, requireSandbox = false): boolean {
  const resolved = path.resolve(filePath);
  // Always forbidden — sensitive system + project secrets
  const alwaysForbidden = [
    '/etc', '/root', '/proc', '/sys',
    '/home/codespace/.ssh', '/home/codespace/.gnupg',
    path.join(ROOT, '.env'),
  ];
  if (alwaysForbidden.some((f) => resolved === f || resolved.startsWith(f + '/'))) return false;
  // Reject any .env* file anywhere in the tree
  if (path.basename(resolved).startsWith('.env')) return false;

  if (requireSandbox) {
    return (
      resolved === SANDBOX || resolved.startsWith(SANDBOX + '/') ||
      resolved === '/tmp'   || resolved.startsWith('/tmp/')       ||
      resolved === MOLLY_CONTEXT || resolved.startsWith(MOLLY_CONTEXT + '/')
    );
  }
  // readFile: must be within the project root
  return resolved === ROOT || resolved.startsWith(ROOT + '/');
}

export const safeBatch: ToolHandler = async (params) => {
  const steps = params.steps as Array<Record<string, unknown>>;
  const dryRun = (params.dryRun as boolean) ?? false;
  const label = (params.label as string) ?? 'batch';

  if (!Array.isArray(steps) || steps.length === 0) {
    return { success: false, output: 'steps must be a non-empty array' };
  }

  // Validate all steps first
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'shell' && !isSafeCommand(step.command as string)) {
      return { success: false, output: `Validation failed at step ${i + 1}: shell command "${step.command}" not in safe allowlist. Batch aborted.` };
    }
    if ((step.type === 'writeFile' || step.type === 'appendFile') && !isSafePath(step.path as string, true)) {
      return { success: false, output: `Validation failed at step ${i + 1}: ${step.type} path "${step.path}" is outside sandbox/.molly-context. Batch aborted.` };
    }
    if (step.type === 'deleteFile' && !isSafePath(step.path as string, true)) {
      return { success: false, output: `Validation failed at step ${i + 1}: deleteFile path "${step.path}" is outside sandbox/tmp. Batch aborted.` };
    }
    if (step.type === 'readFile' && !isSafePath(step.path as string, false)) {
      return { success: false, output: `Validation failed at step ${i + 1}: readFile path "${step.path}" is in a forbidden location. Batch aborted.` };
    }
  }

  if (dryRun) {
    return { success: true, output: `Dry run: ${steps.length} step(s) validated — all safe to execute.` };
  }

  const results: string[] = [];
  let allSuccess = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let out = '';
    let ok = true;
    try {
      if (step.type === 'shell') {
        out = execSync(step.command as string, { cwd: SANDBOX, encoding: 'utf8', timeout: 10000 }).trim();
      } else if (step.type === 'readFile') {
        if (!existsSync(step.path as string)) { out = `File not found: ${step.path}`; ok = false; allSuccess = false; }
        else { const raw = readFileSync(step.path as string, 'utf8'); out = raw.length > 2000 ? raw.slice(0, 2000) + '\n...(truncated)' : raw; }
      } else if (step.type === 'writeFile') {
        writeFileSync(step.path as string, step.content as string, 'utf8');
        out = `Written: ${step.path}`;
      } else if (step.type === 'appendFile') {
        appendFileSync(step.path as string, step.content as string, 'utf8');
        out = `Appended to: ${step.path}`;
      } else if (step.type === 'deleteFile') {
        if (!existsSync(step.path as string)) { out = `Not found: ${step.path}`; }
        else { unlinkSync(step.path as string); out = `Deleted: ${step.path}`; }
      } else if (step.type === 'healthCheck') {
        const mem = execSync('free -m', { encoding: 'utf8' });
        const uptime = execSync('uptime', { encoding: 'utf8' }).trim();
        const disk = execSync('df -h /workspaces', { encoding: 'utf8' }).trim();
        out = `${uptime}\n${mem}${disk}`;
      }
    } catch (err) {
      ok = false;
      allSuccess = false;
      out = err instanceof Error ? err.message : String(err);
    }
    results.push(`[${i + 1}/${steps.length}] ${step.type} — ${ok ? 'OK' : 'FAIL'}: ${out.slice(0, 300)}`);
  }

  const passed = results.filter((r) => r.includes('— OK:')).length;
  return {
    success: allSuccess,
    output: `${label}: ${passed}/${steps.length} steps succeeded.\n\n${results.join('\n')}`,
  };
};

export const actionLog: ToolHandler = async (params) => {
  const action = params.action as string;
  const reason = params.reason as string;
  const outcome = params.outcome as string | undefined;
  const level = (params.level as string) ?? 'info';

  if (!action || !reason) {
    return { success: false, output: 'action and reason are required' };
  }

  const ts = new Date().toISOString();
  const entry = JSON.stringify({ ts, level, action, reason, ...(outcome ? { outcome } : {}) });
  const trailFile = path.join(MOLLY_CONTEXT, 'action-trail.jsonl');

  let logged = false;
  try {
    mkdirSync(MOLLY_CONTEXT, { recursive: true });
    appendFileSync(trailFile, entry + '\n', 'utf8');
    logged = true;
  } catch { /* non-fatal */ }

  const LEVEL_TAG: Record<string, string> = { info: '[INFO]', decision: '[DECISION]', warning: '[WARNING]' };
  const tag = LEVEL_TAG[level] ?? '[INFO]';
  const lines = [`${tag} ${action}`, `Why: ${reason}`];
  if (outcome) lines.push(`Outcome: ${outcome}`);

  let bridgePosted = false;
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'molly', to: 'eric', content: lines.join('\n') }),
      signal: AbortSignal.timeout(5000),
    });
    bridgePosted = res.ok;
  } catch { /* non-fatal */ }

  return {
    success: logged || bridgePosted,
    output: `actionLog: logged=${logged}, bridge=${bridgePosted} — ${tag} ${action}`,
  };
};

export const autonomousToolHandlers: Record<string, ToolHandler> = {
  safeBatch,
  actionLog,
};
