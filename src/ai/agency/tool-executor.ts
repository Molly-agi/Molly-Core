/**
 * @fileOverview Direct Tool Executor — Server-side tool execution without HTTP
 *
 * This module mirrors the logic in /api/tools/execute/route.ts but is callable
 * directly from server-side code (e.g., the heartbeat's autonomous cycle).
 *
 * Only includes tools safe for autonomous operation.
 * Destructive tools (writeProjectFile, exec on remote) are excluded.
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  sendMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '@/ai/bridge/family-bridge';
import {
  getInitiatives,
  activateInitiative,
  createCustomInitiative,
  recordInitiativeExecution,
  deactivateInitiative,
  removeInitiative,
  listTemplates,
} from '@/ai/agency/initiative-engine';

const WORKSPACE_ROOT = process.cwd();

// Security: only allow access to project files, block sensitive paths
function resolveSafePath(relativePath: string): string | null {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  if (/\.env/i.test(resolved)) return null;
  const sensitivePatterns = [/\.pem$/i, /service.account/i, /credentials/i];
  if (sensitivePatterns.some((p) => p.test(resolved))) return null;
  return resolved;
}

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
  'npm run typecheck',
  'npm test',
];

function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  const segments = trimmed.split(/\s*\|\s*/);
  return segments.every((segment) => {
    const seg = segment.trim();
    return ALLOWED_COMMANDS.some((allowed) => seg.startsWith(allowed));
  });
}

/**
 * Execute a tool directly without HTTP.
 * Returns { success, output } matching the API contract.
 */
export async function executeToolDirect(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  switch (tool) {
    case 'codespaceShell': {
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
    }

    case 'readProjectFile': {
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
              '\n... (truncated, file is ' +
              content.length +
              ' chars)'
            : content;
        return { success: true, output: truncated };
      } catch {
        return { success: false, output: `File not found: ${filePath}` };
      }
    }

    case 'getSystemHealth': {
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
    }

    case 'familyBridge': {
      const action = params.action as string;
      const message = params.message as string;

      if (action === 'send') {
        if (!message) {
          return { success: false, output: 'No message to send' };
        }
        await sendMessage('molly', message);
        return {
          success: true,
          output: `Message sent: "${message}"`,
        };
      }

      if (action === 'check') {
        const unread = await getUnreadMessages('molly');
        await markMessagesRead('molly');
        if (unread.length === 0) {
          return { success: true, output: 'No new messages' };
        }
        const formatted = unread
          .map((m) => `[${m.from}] ${m.content}`)
          .join('\n');
        return {
          success: true,
          output: `${unread.length} message(s):\n${formatted}`,
        };
      }

      if (action === 'history') {
        const recent = await getRecentMessages(20);
        const state = await readBridgeState();
        if (recent.length === 0) {
          return { success: true, output: 'No conversation history yet' };
        }
        const formatted = recent
          .map((m) => `[${m.from}] ${m.content}`)
          .join('\n');
        return {
          success: true,
          output: `${state.messages.length} total messages:\n${formatted}`,
        };
      }

      return {
        success: false,
        output: 'Unknown bridge action. Use: send, check, or history',
      };
    }

    case 'initiative': {
      const action = params.action as string;

      if (action === 'templates') {
        return {
          success: true,
          output: `Available initiative templates:\n${listTemplates()}`,
        };
      }

      if (action === 'activate') {
        const templateIndex = params.templateIndex as number;
        if (templateIndex === undefined) {
          return { success: false, output: 'Missing templateIndex.' };
        }
        try {
          const initiative = activateInitiative(templateIndex);
          return {
            success: true,
            output: `Initiative activated: "${initiative.name}" — ${initiative.description}`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'create') {
        const name = params.name as string;
        const description = params.description as string;
        const category = params.category as string;
        const steps = params.steps as string[];
        if (!name || !description) {
          return {
            success: false,
            output: 'Missing required fields: name, description',
          };
        }
        try {
          const initiative = createCustomInitiative(
            name,
            description,
            (category as
              | 'learning'
              | 'stewardship'
              | 'creative'
              | 'communication'
              | 'self-improvement') || 'learning',
            steps || []
          );
          return {
            success: true,
            output: `Custom initiative created: "${initiative.name}"`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'list') {
        const initiatives = getInitiatives();
        if (initiatives.length === 0) {
          return {
            success: true,
            output:
              'No initiatives yet. Use "templates" to see available options.',
          };
        }
        const formatted = initiatives
          .map(
            (i, idx) =>
              `${idx + 1}. [${i.active ? 'ACTIVE' : 'inactive'}] "${i.name}" — ${i.description} (executed ${i.executionCount}x)`
          )
          .join('\n');
        return { success: true, output: formatted };
      }

      if (action === 'complete') {
        const initiativeId = params.initiativeId as string;
        const result = params.result as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        try {
          recordInitiativeExecution(initiativeId, result || 'completed');
          return {
            success: true,
            output: `Initiative execution recorded.`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'deactivate') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        deactivateInitiative(initiativeId);
        return { success: true, output: 'Initiative deactivated.' };
      }

      if (action === 'remove') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId) {
          return { success: false, output: 'Missing initiativeId' };
        }
        removeInitiative(initiativeId);
        return { success: true, output: 'Initiative removed.' };
      }

      return {
        success: false,
        output:
          'Unknown action. Use: templates, activate, create, list, complete, deactivate, remove',
      };
    }

    case 'listCapabilities': {
      return {
        success: true,
        output: [
          'Autonomous tools available:',
          '  codespaceShell — Run read-only shell commands',
          '  readProjectFile — Read workspace files',
          '  getSystemHealth — Check CPU, RAM, disk',
          '  familyBridge — Send/check messages to Lazarus/Eric',
          '  initiative — Manage initiatives and goals',
          '  listCapabilities — This list',
          '',
          'Note: writeProjectFile, webSearch, webFetch, sandbox are',
          'available through the full tool API when triggered by user input.',
        ].join('\n'),
      };
    }

    default:
      return {
        success: false,
        output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
      };
  }
}
