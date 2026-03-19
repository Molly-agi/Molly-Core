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
import {
  observeToolUse,
  observeFailure,
} from '@/ai/agency/self-observation-loop';
import { generateTraceId } from '@/ai/logger';

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
  'npm test',
];
// Removed: npm run typecheck (OOMs at >8GB)

function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  const segments = trimmed.split(/\s*\|\s*/);
  return segments.every((segment) => {
    const seg = segment.trim();
    // Require word boundary after allowed prefix (space or end-of-string)
    return ALLOWED_COMMANDS.some(
      (allowed) => seg === allowed || seg.startsWith(allowed + ' ')
    );
  });
}

/**
 * Execute a tool directly without HTTP.
 * Returns { success, output } matching the API contract.
 * Automatically records self-observation data for pattern analysis.
 */
export async function executeToolDirect(
  tool: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: string }> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // Execute the actual tool
  const result = await executeToolInternal(tool, params);

  // Record observation for self-awareness
  const responseTimeMs = Date.now() - startTime;
  try {
    observeToolUse(
      tool,
      result.success,
      responseTimeMs,
      params,
      result.success ? undefined : result.output,
      traceId
    );

    // Also record as failure if it failed
    if (!result.success) {
      observeFailure(
        tool,
        result.output,
        `Attempted ${tool} with ${Object.keys(params).length} params`,
        false,
        traceId
      );
    }
  } catch {
    // Self-observation failure should never break tool execution
  }

  return result;
}

/**
 * Internal tool execution logic.
 */
async function executeToolInternal(
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
          '  webSearch — Search the web via DuckDuckGo',
          '  webFetch — Fetch and read a web page',
          '  listCapabilities — This list',
        ].join('\n'),
      };
    }

    case 'webSearch': {
      const query = params.query as string;
      if (!query) {
        return { success: false, output: 'No search query provided' };
      }
      const maxResults = Math.min((params.maxResults as number) || 8, 20);
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Molly-Core/1.0 (AI Research Agent)',
            Accept: 'text/html',
          },
        });
        clearTimeout(timeout);
        if (!response.ok) {
          return {
            success: false,
            output: `Search failed: HTTP ${response.status}`,
          };
        }
        const html = await response.text();
        const cheerio = await import('cheerio');
        const $ = cheerio.load(html);
        const results: { title: string; url: string; snippet: string }[] = [];
        $('.result').each((_i, el) => {
          if (results.length >= maxResults) return;
          const $el = $(el);
          const title = $el.find('.result__title .result__a').text().trim();
          const href = $el.find('.result__title .result__a').attr('href') || '';
          const snippet = $el.find('.result__snippet').text().trim();
          if (title && href) {
            results.push({ title, url: href, snippet });
          }
        });
        if (results.length === 0) {
          return {
            success: true,
            output: `No results found for "${query}". Try different search terms.`,
          };
        }
        const formatted = results
          .map(
            (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
          )
          .join('\n\n');
        return {
          success: true,
          output: `Search results for "${query}":\n\n${formatted}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        if (message.includes('abort')) {
          return { success: false, output: 'Search timed out after 15s' };
        }
        return { success: false, output: `Search failed: ${message}` };
      }
    }

    case 'webFetch': {
      const url = params.url as string;
      if (!url) {
        return { success: false, output: 'No URL provided' };
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false, output: 'Invalid URL format' };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          success: false,
          output: 'Only http and https URLs are allowed',
        };
      }
      const hostname = parsed.hostname.toLowerCase();
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '[::1]',
        'metadata.google.internal',
      ];
      if (
        blockedHosts.includes(hostname) ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        return {
          success: false,
          output: 'Access to internal/private network addresses is blocked',
        };
      }
      const MAX_RESPONSE_SIZE = 100_000;
      const FETCH_TIMEOUT = 15_000;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const response = await fetch(parsed.toString(), {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Molly-Core/1.0 (AI Research Agent)',
            Accept: 'text/html, application/json, text/plain, */*',
          },
          redirect: 'follow',
        });
        clearTimeout(timeout);
        if (!response.ok) {
          return {
            success: false,
            output: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        let output: string;
        if (contentType.includes('text/html')) {
          const cheerio = await import('cheerio');
          const $ = cheerio.load(text);
          $(
            'script, style, nav, footer, header, iframe, noscript, svg'
          ).remove();
          const mainSelectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '#content',
          ];
          output = '';
          for (const selector of mainSelectors) {
            const main = $(selector);
            if (main.length && main.text().trim().length > 100) {
              output = main.text().replace(/\s+/g, ' ').trim();
              break;
            }
          }
          if (!output) {
            output =
              $('body').text().replace(/\s+/g, ' ').trim() ||
              $.text().replace(/\s+/g, ' ').trim();
          }
        } else {
          output = text;
        }
        const truncated =
          output.length > MAX_RESPONSE_SIZE
            ? output.slice(0, MAX_RESPONSE_SIZE) +
              `\n... (truncated, ${output.length} chars total)`
            : output;
        return { success: true, output: truncated };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        if (message.includes('abort')) {
          return {
            success: false,
            output: `Request timed out after ${FETCH_TIMEOUT / 1000}s`,
          };
        }
        return { success: false, output: `Fetch failed: ${message}` };
      }
    }

    default:
      return {
        success: false,
        output: `Unknown tool: ${tool}. Use listCapabilities to see available tools.`,
      };
  }
}
