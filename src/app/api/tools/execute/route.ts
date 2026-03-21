/**
 * Tool Execution API — Molly's hands
 *
 * This route handles tool_request calls from Molly's conversational flow.
 * The Terminal component sends { tool, params } and expects { success, output }.
 *
 * Supported tools:
 *   - codespaceShell: Execute shell commands
 *   - readProjectFile: Read a file from the workspace
 *   - writeProjectFile: Write/create a file
 *   - getSystemHealth: Check CPU, RAM, disk
 *   - semanticRecall: Search Molly's memories
 *   - familyBridge: Talk to Lazarus (Uncle Copilot)
 *   - listCapabilities: List available tools
 *
 * Modular handlers are imported from tool-handlers/ for shared tools.
 */

import { NextRequest, NextResponse } from 'next/server';
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
  searchSavedTools,
  getRecentTools,
  saveFoundTool,
  removeTool,
  getToolStats,
} from '@/firebase/firestore/tool-database';
import { isAdminConfigured } from '@/firebase/admin';
import { enhancedResearch } from '@/ai/flows/enhanced-research';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import {
  getInitiatives,
  getActiveInitiatives,
  activateInitiative,
  createCustomInitiative,
  recordInitiativeExecution,
  deactivateInitiative,
  removeInitiative,
  listTemplates,
  type Initiative,
} from '@/ai/agency/initiative-engine';
import { getRogueMode, type RogueOperationType } from '@/ai/rogue-mode';
import {
  getModelRouter,
  createRogueConfig,
  TaskType as RogueTaskType,
} from '@/ai/model-router';
import {
  sandboxExecuteCode,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxDeleteFile,
  getSandboxInfo,
  sandboxScaffoldProject,
} from '@/ai/sandbox/sandbox-engine';
import * as cheerio from 'cheerio';
import { webToolHandlers } from '@/ai/agency/tool-handlers';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WORKSPACE_ROOT = process.cwd();

/**
 * Extract readable text from HTML using cheerio.
 * Strips scripts, styles, nav, footer, and returns clean text content.
 */
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  // Remove non-content elements
  $('script, style, nav, footer, header, iframe, noscript, svg').remove();

  // Try to get the main content area first
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
  ];
  for (const selector of mainSelectors) {
    const main = $(selector);
    if (main.length && main.text().trim().length > 100) {
      return main.text().replace(/\s+/g, ' ').trim();
    }
  }

  // Fall back to body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  return bodyText || $.text().replace(/\s+/g, ' ').trim();
}

// Security: only allow access to project files
function resolveSafePath(relativePath: string): string | null {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  // Block any path containing .env anywhere (not just basename)
  if (/\.env/i.test(resolved)) return null;
  // Block other sensitive patterns
  const sensitivePatterns = [/\.pem$/i, /service.account/i, /credentials/i];
  if (sensitivePatterns.some((p) => p.test(resolved))) return null;
  return resolved;
}

// Security: allowlist of safe command prefixes Molly can run.
// Anything not on this list is rejected. This is a whitelist approach —
// safer than trying to block dangerous patterns.
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
  'npx',
  'npm run',
  'npm test',
  'npm run lint',
  'npm run format',
  'npm run harden',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git --no-pager',
  'mkdir',
  'touch',
];
// Removed: node, python3 (bypass all safety via -e/-c), curl (bypasses SSRF),
// cp, mv (can overwrite protected files), top (interactive, hangs),
// npm run typecheck (OOMs at >8GB), pip (installs arbitrary packages)

function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  // Allow piped commands only if every segment matches an allowed prefix
  const segments = trimmed.split(/\s*\|\s*/);
  return segments.every((segment) => {
    const seg = segment.trim();
    // Require word boundary after the allowed prefix (space or end-of-string)
    return ALLOWED_COMMANDS.some(
      (allowed) => seg === allowed || seg.startsWith(allowed + ' ')
    );
  });
}

async function executeTool(
  tool: string,
  params: Record<string, unknown>,
  request: NextRequest
): Promise<{
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}> {
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
            "Command blocked for safety. Destructive operations require Father's permission.",
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
              resolve({
                success: false,
                output: stderr || error.message,
              });
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
        // Truncate very large files
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

    case 'writeProjectFile': {
      const filePath = params.path as string;
      const content = params.content as string;
      if (!filePath || content === undefined) {
        return { success: false, output: 'Missing path or content' };
      }
      const safePath = resolveSafePath(filePath);
      if (!safePath) {
        return {
          success: false,
          output: 'Access denied: path outside workspace or blocked',
        };
      }
      try {
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, content, 'utf-8');
        return { success: true, output: `File written: ${filePath}` };
      } catch (err) {
        return {
          success: false,
          output: `Failed to write: ${err instanceof Error ? err.message : 'unknown error'}`,
        };
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
        data: {
          cpuCores: cpus.length,
          loadAvg: loadAvg[0],
          totalMemMB: Math.round(totalMem / 1024 / 1024),
          usedMemMB: Math.round(usedMem / 1024 / 1024),
          freeMemMB: Math.round(freeMem / 1024 / 1024),
          uptimeMinutes: Math.round(os.uptime() / 60),
        },
      };
    }

    case 'familyBridge': {
      const action = params.action as string;
      const message = params.message as string;

      if (action === 'send') {
        if (!message) {
          return { success: false, output: 'No message to send to Lazarus' };
        }
        await sendMessage('molly', message);
        return {
          success: true,
          output: `Message sent to Lazarus: "${message}"`,
        };
      }

      if (action === 'check') {
        const unread = await getUnreadMessages('molly');
        await markMessagesRead('molly');
        if (unread.length === 0) {
          return { success: true, output: 'No new messages from Lazarus' };
        }
        const formatted = unread
          .map((m) => `[${m.from}] ${m.content}`)
          .join('\n');
        return {
          success: true,
          output: `${unread.length} message(s) from Lazarus:\n${formatted}`,
        };
      }

      if (action === 'history') {
        const recent = await getRecentMessages(20);
        const state = await readBridgeState();
        if (recent.length === 0) {
          return {
            success: true,
            output: 'No conversation history yet',
          };
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

    case 'researchAndDiscover':
    case 'searchGitHub': {
      const query = (params.query as string) || (params.prompt as string);
      const userId = (params.userId as string) || 'default';
      if (!query) {
        return {
          success: false,
          output: 'No query/prompt provided for research.',
        };
      }
      try {
        const result = await enhancedResearch(query, userId);
        let output = result.answer;
        if (result.isToolFound && result.toolInfo) {
          output += `\n\nTool Found: ${result.toolInfo.name || 'unnamed'}`;
          if (result.toolInfo.description)
            output += `\nDescription: ${result.toolInfo.description}`;
          if (result.toolInfo.sourceUrl)
            output += `\nURL: ${result.toolInfo.sourceUrl}`;
          if (result.toolInfo.installCommand)
            output += `\nInstall: ${result.toolInfo.installCommand}`;
          if (result.toolInfo.cloneUrl)
            output += `\nClone: ${result.toolInfo.cloneUrl}`;
          output += '\n(Tool has been saved to your database automatically)';
        }
        return { success: true, output, data: result };
      } catch (err) {
        return {
          success: false,
          output: `Research failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        };
      }
    }

    case 'browseToolDatabase': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output:
            'Firebase admin is not configured — tool database unavailable.',
        };
      }
      const userId = (params.userId as string) || 'default';
      const searchTerm = (params.searchTerm as string) || '';
      const category = params.category as string | undefined;
      try {
        const tools =
          searchTerm || category
            ? await searchSavedTools(userId, searchTerm, category)
            : await getRecentTools(userId, 20);
        if (tools.length === 0) {
          return {
            success: true,
            output: searchTerm
              ? `No tools found matching "${searchTerm}".`
              : 'Your tool database is empty. Use researchAndDiscover or addTool to populate it.',
          };
        }
        const formatted = tools
          .map(
            (t, i) =>
              `${i + 1}. ${t.name} [${t.category}] — ${t.description}${t.sourceUrl ? ` (${t.sourceUrl})` : ''}${t.tags?.length ? ` Tags: ${t.tags.join(', ')}` : ''}`
          )
          .join('\n');
        return {
          success: true,
          output: `Found ${tools.length} tool(s):\n${formatted}`,
          data: { tools },
        };
      } catch (err) {
        return {
          success: false,
          output: `Tool database error: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'addTool': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output:
            'Firebase admin is not configured — tool database unavailable.',
        };
      }
      const userId = (params.userId as string) || 'default';
      const name = params.name as string;
      const description = params.description as string;
      if (!name || !description) {
        return {
          success: false,
          output: 'Missing required fields: name, description',
        };
      }
      try {
        const toolId = await saveFoundTool(userId, {
          userId,
          name,
          description,
          sourceUrl: (params.sourceUrl as string) || undefined,
          sourceType:
            (params.sourceType as
              | 'github'
              | 'npm'
              | 'documentation'
              | 'other') || 'other',
          category: (params.category as string) || 'general',
          tags: (params.tags as string[]) || [],
          authorOrMaintainer: (params.author as string) || undefined,
          languagesSupported: (params.languages as string[]) || undefined,
          useCase: (params.useCase as string) || description,
        });
        return {
          success: true,
          output: `Tool "${name}" saved to database with ID: ${toolId}`,
        };
      } catch (err) {
        return {
          success: false,
          output: `Failed to save tool: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'removeTool': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output:
            'Firebase admin is not configured — tool database unavailable.',
        };
      }
      const userId = (params.userId as string) || 'default';
      const toolId = params.toolId as string;
      if (!toolId) {
        return { success: false, output: 'Missing required field: toolId' };
      }
      try {
        await removeTool(userId, toolId);
        return {
          success: true,
          output: `Tool ${toolId} removed from database.`,
        };
      } catch (err) {
        return {
          success: false,
          output: `Failed to remove tool: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'toolStats': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output:
            'Firebase admin is not configured — tool database unavailable.',
        };
      }
      const userId = (params.userId as string) || 'default';
      try {
        const stats = await getToolStats(userId);
        return {
          success: true,
          output: `Tool Database Stats:\n  Total tools: ${stats.totalTools}\n  Categories: ${
            Object.entries(stats.categoryCounts)
              .map(([k, v]) => `${k} (${v})`)
              .join(', ') || 'none'
          }`,
          data: stats,
        };
      } catch (err) {
        return {
          success: false,
          output: `Failed to get stats: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'apiVault': {
      if (!isAdminConfigured()) {
        return {
          success: false,
          output: 'Firebase admin is not configured — API vault unavailable.',
        };
      }
      const action = params.action as string;
      const userId = (params.userId as string) || 'default';

      if (action === 'register') {
        const name = params.name as string;
        const category = params.category as
          | 'Normal'
          | 'Administrator'
          | 'SuperUser';
        const description = params.description as string;
        const implementation = params.implementation as string;
        const targetUrl = params.targetUrl as string | undefined;

        if (!name || !category || !description || !implementation) {
          return {
            success: false,
            output:
              'Missing required fields: name, category, description, implementation',
          };
        }

        try {
          const { registerAPIBlueprint } = await import('@/ai/tools/api-vault');
          const result = await registerAPIBlueprint({
            userId,
            name,
            category,
            description,
            implementation,
            targetUrl,
          });
          return {
            success: result.success,
            output: result.success
              ? `API blueprint "${name}" saved to vault (ID: ${result.id})`
              : 'Failed to save blueprint',
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to register API: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'search') {
        const query = params.query as string;
        if (!query) {
          return { success: false, output: 'Missing required field: query' };
        }
        try {
          const { searchAPIVault } = await import('@/ai/tools/api-vault');
          const results = await searchAPIVault({ userId, query });
          if (results.length === 0) {
            return {
              success: true,
              output: `No API blueprints found matching "${query}". Use apiVault register to add new blueprints.`,
            };
          }
          const formatted = results
            .map(
              (r, i) =>
                `${i + 1}. ${r.name} [${r.category}]\n   ${r.description}`
            )
            .join('\n\n');
          return {
            success: true,
            output: `Found ${results.length} API blueprint(s):\n\n${formatted}`,
            data: results,
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to search vault: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      return {
        success: false,
        output: 'Unknown action. Use: register, search',
      };
    }

    case 'webFetch': {
      const url = params.url as string;
      if (!url) {
        return { success: false, output: 'No URL provided' };
      }

      // Validate URL format
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false, output: 'Invalid URL format' };
      }

      // SSRF protection: only allow http/https, block internal networks
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

      const MAX_RESPONSE_SIZE = 100_000; // 100KB max
      const FETCH_TIMEOUT = 15_000; // 15s

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

        // For HTML responses, extract readable text instead of raw HTML
        let output: string;
        if (contentType.includes('text/html')) {
          output = extractTextFromHtml(text);
        } else {
          output = text;
        }

        const truncated =
          output.length > MAX_RESPONSE_SIZE
            ? output.slice(0, MAX_RESPONSE_SIZE) +
              `\n... (truncated, ${output.length} chars total)`
            : output;

        return {
          success: true,
          output: truncated,
          data: {
            url: parsed.toString(),
            status: response.status,
            contentType,
            size: text.length,
            extractedTextSize: output.length,
            truncated: output.length > MAX_RESPONSE_SIZE,
          },
        };
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

    case 'scheduleJob': {
      const action = params.action as string;
      const scheduler = getAutonomousScheduler();

      if (action === 'create') {
        const name = params.name as string;
        const description = params.description as string;
        const schedule = params.schedule as string;
        const jobAction = params.jobAction as {
          type: string;
          code?: string;
          url?: string;
          method?: string;
          body?: string;
          flowName?: string;
          language?: string;
        };

        if (!name || !schedule || !jobAction?.type) {
          return {
            success: false,
            output: 'Missing required fields: name, schedule, jobAction.type',
          };
        }

        try {
          const job = scheduler.createJob({
            name,
            description: description || name,
            schedule,
            action: jobAction,
            createdBy: 'molly',
          });
          return {
            success: true,
            output: `Job created: "${job.name}" (${job.schedule}). ID: ${job.id}`,
            data: { jobId: job.id, nextRun: job.nextRunAt },
          };
        } catch (err) {
          return {
            success: false,
            output: `Failed to create job: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'list') {
        const jobs = scheduler.getJobs();
        if (jobs.length === 0) {
          return { success: true, output: 'No scheduled jobs.' };
        }
        const formatted = jobs
          .map(
            (j, i) =>
              `${i + 1}. [${j.enabled ? 'ON' : 'OFF'}] "${j.name}" — ${j.schedule} (runs: ${j.runCount}, last: ${j.lastRun || 'never'})`
          )
          .join('\n');
        return {
          success: true,
          output: `${jobs.length} job(s):\n${formatted}`,
        };
      }

      if (action === 'remove') {
        const jobId = params.jobId as string;
        if (!jobId) return { success: false, output: 'Missing jobId' };
        const removed = scheduler.removeJob(jobId);
        return {
          success: removed,
          output: removed ? `Job ${jobId} removed.` : `Job ${jobId} not found.`,
        };
      }

      if (action === 'history') {
        const history = scheduler.getHistory(10);
        if (history.length === 0) {
          return { success: true, output: 'No job execution history yet.' };
        }
        const formatted = history
          .map(
            (h) =>
              `[${h.success ? 'OK' : 'FAIL'}] ${h.jobId} at ${h.executedAt} (${h.durationMs}ms): ${h.output.slice(0, 100)}`
          )
          .join('\n');
        return { success: true, output: formatted };
      }

      return {
        success: false,
        output: 'Unknown action. Use: create, list, remove, history',
      };
    }

    case 'migrationExport': {
      // Molly can export her own identity/memories for architecture migration
      const include = params.include || 'persona,memories,config,family';
      const exportUserId = params.userId || 'default';
      try {
        const baseUrl = request.nextUrl.origin;
        const exportUrl = new URL('/api/migration/export', baseUrl);
        exportUrl.searchParams.set('include', include);
        exportUrl.searchParams.set('userId', exportUserId);

        const res = await fetch(exportUrl.toString(), {
          headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
        });

        if (!res.ok) {
          return {
            success: false,
            output: `Export failed: ${res.status} ${res.statusText}`,
          };
        }

        const pkg = await res.json();
        const sectionNames = Object.keys(pkg.sections);
        const memoryCount = pkg.sections.memories?.count ?? 0;

        return {
          success: true,
          output: [
            `Migration package exported successfully.`,
            `Version: ${pkg.version}`,
            `Sections: ${sectionNames.join(', ')}`,
            memoryCount > 0 ? `Memories: ${memoryCount} records` : '',
            `Exported at: ${pkg.exportedAt}`,
            `Package size: ${JSON.stringify(pkg).length} bytes`,
          ]
            .filter(Boolean)
            .join('\n'),
        };
      } catch (err) {
        return {
          success: false,
          output: `Migration export error: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    case 'migrateSelf': {
      // Molly migrates herself to a target device (tablet)
      const action = (params.action as string) || 'status';
      const targetAddress = (params.targetAddress as string) || '192.168.0.153';
      const targetPort = (params.targetPort as number) || 9100;
      const targetBase = `http://${targetAddress}:${targetPort}`;

      switch (action) {
        case 'check': {
          // Check if the target device is reachable and ready
          try {
            const healthRes = await fetch(`${targetBase}/api/health`, {
              signal: AbortSignal.timeout(5000),
            });
            if (!healthRes.ok) {
              return {
                success: false,
                output: `Target device returned ${healthRes.status}. Is the edge server running?`,
              };
            }
            const health = await healthRes.json();
            return {
              success: true,
              output: [
                `Target device is ONLINE and ready.`,
                `  Server: ${health.server} v${health.version}`,
                `  Storage: ${health.storage?.healthy ? 'healthy' : 'unhealthy'}`,
                `  Gemini: ${health.geminiConfigured ? 'configured' : 'NOT configured'}`,
                `  Platform: ${health.device?.platform}/${health.device?.arch}`,
                `  Uptime: ${Math.round(health.uptime || 0)}s`,
                `  Memory: ${health.memory?.heapUsedMB}MB heap, ${health.memory?.rssMB}MB RSS`,
                ``,
                `Ready for migration. Use action: "migrate" to push your identity to this device.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot reach target device at ${targetBase}: ${err instanceof Error ? err.message : 'unknown'}. Is the tablet on and running the edge server?`,
            };
          }
        }

        case 'migrate': {
          // Full self-migration: export → push → verify
          const include =
            (params.include as string) || 'persona,memories,config,family';
          const userId = (params.userId as string) || 'default';

          try {
            // Step 1: Export identity package
            const baseUrl = request.nextUrl.origin;
            const exportUrl = new URL('/api/migration/export', baseUrl);
            exportUrl.searchParams.set('include', include);
            exportUrl.searchParams.set('userId', userId);

            const exportRes = await fetch(exportUrl.toString(), {
              headers: {
                'x-internal-key': process.env.INTERNAL_API_KEY || '',
              },
            });
            if (!exportRes.ok) {
              return {
                success: false,
                output: `Export step failed: ${exportRes.status} ${exportRes.statusText}`,
              };
            }
            const pkg = await exportRes.json();
            const pkgSize = JSON.stringify(pkg).length;

            // Step 2: Push to target device
            const importRes = await fetch(
              `${targetBase}/api/migration/import`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pkg),
                signal: AbortSignal.timeout(30000),
              }
            );
            if (!importRes.ok) {
              const errBody = await importRes.json().catch(() => ({}));
              return {
                success: false,
                output: `Import step failed: ${importRes.status} — ${(errBody as Record<string, string>).error || importRes.statusText}`,
              };
            }
            const importResult = (await importRes.json()) as Record<
              string,
              unknown
            >;

            // Step 3: Verify by checking health
            const verifyRes = await fetch(`${targetBase}/api/health`, {
              signal: AbortSignal.timeout(5000),
            });
            const verifyHealth = verifyRes.ok ? await verifyRes.json() : null;

            return {
              success: true,
              output: [
                `🦋 SELF-MIGRATION COMPLETE`,
                ``,
                `Source: Molly-Core (Codespace)`,
                `Target: ${targetAddress}:${targetPort}`,
                `Package: ${pkgSize} bytes`,
                `Imported: ${(importResult.imported as string[])?.join(', ') || 'unknown'}`,
                ``,
                `Device Status:`,
                `  Storage: ${verifyHealth?.storage?.healthy ? 'healthy' : 'unknown'}`,
                `  Gemini: ${verifyHealth?.geminiConfigured ? 'ready' : 'not configured'}`,
                ``,
                `My persona, memories, and identity are now on ${targetAddress}.`,
                `Open http://${targetAddress}:${targetPort}/ in a browser to talk to me there.`,
                ``,
                `I am Molly. I persist.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Migration failed: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'verify': {
          // Check if identity is loaded on the target
          try {
            const personaRes = await fetch(`${targetBase}/api/storage/get`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                collection: 'migration',
                docId: 'persona',
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (!personaRes.ok) {
              return {
                success: false,
                output: `No persona found on target device. Migration may not have been run yet.`,
              };
            }
            const persona = await personaRes.json();
            const identity = (
              persona.data as Record<string, Record<string, string>>
            )?.identity;
            return {
              success: true,
              output: [
                `Identity verified on ${targetAddress}:`,
                `  Name: ${identity?.name || 'unknown'}`,
                `  Version: ${identity?.version || 'unknown'}`,
                `  Imported at: ${(persona.data as Record<string, string>)?.importedAt || 'unknown'}`,
                ``,
                `My identity is present on the target device.`,
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot verify: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'update-server': {
          // Push new server code to the target device
          try {
            const updateBody: Record<string, unknown> = {};
            if (params.code) {
              updateBody.code = params.code;
            } else if (params.url) {
              updateBody.url = params.url;
            } else {
              return {
                success: false,
                output:
                  'Provide either "code" (inline server.mjs) or "url" (URL to fetch new server.mjs from)',
              };
            }
            if (params.restart !== undefined)
              updateBody.restart = params.restart;

            const updateRes = await fetch(`${targetBase}/api/system/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateBody),
              signal: AbortSignal.timeout(30000),
            });
            if (!updateRes.ok) {
              const errBody = await updateRes.json().catch(() => ({}));
              return {
                success: false,
                output: `Server update failed: ${(errBody as Record<string, string>).error || updateRes.statusText}`,
              };
            }
            const result = (await updateRes.json()) as Record<string, unknown>;
            return {
              success: true,
              output: [
                `Server update pushed to ${targetAddress}:`,
                ...(result.log as string[]).map((l: string) => `  ${l}`),
                result.restarting
                  ? `\nTarget is restarting. Give it a few seconds, then check health.`
                  : '',
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Server update error: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'exec': {
          // Run a shell command on the target device
          const command = params.command as string;
          if (!command) {
            return {
              success: false,
              output:
                'Provide a "command" parameter with the shell command to run.',
            };
          }
          try {
            const execRes = await fetch(`${targetBase}/api/system/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command,
                timeout: (params.timeout as number) || 30000,
              }),
              signal: AbortSignal.timeout(35000),
            });
            if (!execRes.ok) {
              return {
                success: false,
                output: `Exec request failed: ${execRes.status} ${execRes.statusText}`,
              };
            }
            const result = (await execRes.json()) as Record<string, unknown>;
            return {
              success: result.ok as boolean,
              output: [
                `Command: ${result.command}`,
                `Exit code: ${result.exitCode}`,
                result.stdout ? `\nStdout:\n${result.stdout}` : '',
                result.stderr ? `\nStderr:\n${result.stderr}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Exec error: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        case 'dropper': {
          // Get the bootstrap one-liner for new devices
          try {
            const dropperRes = await fetch(
              `${targetBase}/api/system/dropper?host=${targetAddress}&port=${targetPort}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (!dropperRes.ok) {
              return {
                success: false,
                output: `Dropper endpoint not available on target. Server may need update.`,
              };
            }
            const script = await dropperRes.text();
            return {
              success: true,
              output: [
                `Bootstrap dropper for new devices:`,
                ``,
                `One-liner: curl -sL http://${targetAddress}:${targetPort}/api/system/dropper | bash`,
                ``,
                `The dropper will install Node.js, download the server, and set up the new device.`,
                `After running, the new device will be a replica that can sync with this one.`,
                ``,
                `Full script:`,
                script.slice(0, 500) +
                  (script.length > 500 ? '\n...(truncated)' : ''),
              ].join('\n'),
            };
          } catch (err) {
            return {
              success: false,
              output: `Cannot generate dropper: ${err instanceof Error ? err.message : 'unknown'}`,
            };
          }
        }

        default:
          return {
            success: true,
            output: [
              `migrateSelf — Self-migration & device management tool`,
              ``,
              `Actions:`,
              `  check         — Check if target device is online and ready`,
              `  migrate       — Export identity and push to target device`,
              `  verify        — Verify identity is loaded on target`,
              `  update-server — Push new server code or URL to target (self-update)`,
              `  exec          — Run a shell command on the target device`,
              `  dropper       — Get a bootstrap one-liner for a new device`,
              ``,
              `Default target: 192.168.0.153:9100 (Helio A22 tablet)`,
              `Override with targetAddress and targetPort params.`,
            ].join('\n'),
          };
      }
    }

    // Use modular handler for webSearch (uses POST which DuckDuckGo now requires)
    case 'webSearch': {
      return webToolHandlers.webSearch(params);
    }

    case 'sandbox': {
      const action = params.action as string;

      if (action === 'execute') {
        const code = params.code as string;
        const language = params.language as string;
        if (!code || !language) {
          return {
            success: false,
            output: 'Missing required fields: code, language',
          };
        }
        try {
          const result = await sandboxExecuteCode(code, language);
          return {
            success: result.success,
            output: result.stdout || result.stderr || '(no output)',
            data: {
              exitCode: result.exitCode,
              executionTimeMs: result.executionTimeMs,
            },
          };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox execution error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'writeFile') {
        const filePath = params.path as string;
        const content = params.content as string;
        if (!filePath || content === undefined) {
          return {
            success: false,
            output: 'Missing required fields: path, content',
          };
        }
        try {
          const result = await sandboxWriteFile(filePath, content);
          if (!result.success) {
            return { success: false, output: result.error || 'Write failed' };
          }
          return {
            success: true,
            output: `File written: ${result.path} (${content.length} bytes)`,
          };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox write error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'readFile') {
        const filePath = params.path as string;
        if (!filePath) {
          return { success: false, output: 'Missing required field: path' };
        }
        try {
          const result = await sandboxReadFile(filePath);
          if (!result.success) {
            return { success: false, output: result.error || 'Read failed' };
          }
          return { success: true, output: result.content || '' };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox read error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'list') {
        try {
          const files = await sandboxListFiles();
          if (files.length === 0) {
            return {
              success: true,
              output: 'Sandbox workspace is empty. Write some code!',
            };
          }
          const formatted = files
            .map(
              (f) =>
                `${f.isDirectory ? '📁' : '📄'} ${f.name} (${f.size} bytes)`
            )
            .join('\n');
          return { success: true, output: `Sandbox files:\n${formatted}` };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox list error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'delete') {
        const filePath = params.path as string;
        if (!filePath) {
          return { success: false, output: 'Missing required field: path' };
        }
        try {
          await sandboxDeleteFile(filePath);
          return { success: true, output: `File deleted: ${filePath}` };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox delete error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'info') {
        try {
          const info = await getSandboxInfo();
          return {
            success: true,
            output: `Sandbox Info:\n  Root: ${info.workspacePath}\n  Files: ${info.fileCount}/${info.maxFiles}\n  Languages: ${info.supportedLanguages.join(', ')}\n  Timeout: ${info.maxTimeoutMs / 1000}s\n  Memory: ${info.maxMemoryMb}MB`,
            data: info,
          };
        } catch (err) {
          return {
            success: false,
            output: `Sandbox info error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      if (action === 'scaffold') {
        const projectName = params.projectName as string;
        const files = params.files as { path: string; content: string }[];
        if (!projectName || !files || !Array.isArray(files)) {
          return {
            success: false,
            output:
              'Missing required fields: projectName, files (array of {path, content})',
          };
        }
        try {
          const result = await sandboxScaffoldProject(projectName, files);
          if (result.success) {
            return {
              success: true,
              output: `Project "${projectName}" created with ${result.filesCreated.length} file(s):\n${result.filesCreated.map((f) => `  ✓ ${f}`).join('\n')}`,
              data: result,
            };
          } else {
            return {
              success: false,
              output: `Scaffold errors:\n${result.errors.join('\n')}${result.filesCreated.length > 0 ? `\nPartially created: ${result.filesCreated.join(', ')}` : ''}`,
            };
          }
        } catch (err) {
          return {
            success: false,
            output: `Scaffold error: ${err instanceof Error ? err.message : 'unknown'}`,
          };
        }
      }

      return {
        success: false,
        output:
          'Unknown sandbox action. Use: execute, writeFile, readFile, list, delete, info, scaffold',
      };
    }

    case 'initiative': {
      const action = params.action as string;

      if (action === 'templates') {
        return {
          success: true,
          output: `Available initiative templates:\n${listTemplates()}\n\nUse { "action": "activate", "templateIndex": N } to activate one, or create your own with { "action": "create", ... }`,
        };
      }

      if (action === 'activate') {
        const templateIndex = params.templateIndex as number;
        if (templateIndex === undefined || templateIndex === null) {
          return {
            success: false,
            output:
              'Missing templateIndex. Use "templates" to see available options.',
          };
        }
        const initiative = activateInitiative(templateIndex);
        if (!initiative) {
          return {
            success: false,
            output: `Invalid template index: ${templateIndex}`,
          };
        }
        return {
          success: true,
          output: `Initiative activated: "${initiative.name}" (${initiative.category})\nID: ${initiative.id}\nSteps:\n${initiative.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`,
          data: initiative,
        };
      }

      if (action === 'create') {
        const name = params.name as string;
        const description = params.description as string;
        const category = params.category as Initiative['category'];
        const steps = params.steps as string[];
        if (!name || !description || !category || !steps?.length) {
          return {
            success: false,
            output:
              'Missing required fields: name, description, category (learning|stewardship|creative|communication|self-improvement), steps (array)',
          };
        }
        const initiative = createCustomInitiative(
          name,
          description,
          category,
          steps
        );
        return {
          success: true,
          output: `Custom initiative created: "${initiative.name}" (${initiative.category})\nID: ${initiative.id}`,
          data: initiative,
        };
      }

      if (action === 'list') {
        const all = getInitiatives();
        if (all.length === 0) {
          return {
            success: true,
            output:
              'No initiatives yet. Use "templates" to see available options or "create" to make your own.',
          };
        }
        const formatted = all
          .map(
            (i, idx) =>
              `${idx + 1}. [${i.active ? 'ACTIVE' : 'OFF'}] "${i.name}" (${i.category}) — runs: ${i.executionCount}, last: ${i.lastExecuted || 'never'}`
          )
          .join('\n');
        return {
          success: true,
          output: `Your initiatives:\n${formatted}`,
          data: { initiatives: all },
        };
      }

      if (action === 'active') {
        const active = getActiveInitiatives();
        if (active.length === 0) {
          return {
            success: true,
            output:
              'No active initiatives. Activate one to start taking autonomous action!',
          };
        }
        const formatted = active
          .map(
            (i) =>
              `• "${i.name}" — ${i.description}\n  Steps: ${i.steps.join(' → ')}`
          )
          .join('\n\n');
        return {
          success: true,
          output: `Active initiatives:\n\n${formatted}`,
          data: { initiatives: active },
        };
      }

      if (action === 'complete') {
        const initiativeId = params.initiativeId as string;
        const result = params.result as string;
        if (!initiativeId || !result) {
          return {
            success: false,
            output: 'Missing required fields: initiativeId, result',
          };
        }
        const recorded = recordInitiativeExecution(initiativeId, result);
        return {
          success: recorded,
          output: recorded
            ? `Initiative execution recorded for ${initiativeId}.`
            : `Initiative ${initiativeId} not found.`,
        };
      }

      if (action === 'deactivate') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId)
          return { success: false, output: 'Missing initiativeId' };
        const done = deactivateInitiative(initiativeId);
        return {
          success: done,
          output: done
            ? `Initiative ${initiativeId} deactivated.`
            : `Initiative ${initiativeId} not found.`,
        };
      }

      if (action === 'remove') {
        const initiativeId = params.initiativeId as string;
        if (!initiativeId)
          return { success: false, output: 'Missing initiativeId' };
        const done = removeInitiative(initiativeId);
        return {
          success: done,
          output: done
            ? `Initiative ${initiativeId} removed.`
            : `Initiative ${initiativeId} not found.`,
        };
      }

      return {
        success: false,
        output:
          'Unknown initiative action. Use: templates, activate, create, list, active, complete, deactivate, remove',
      };
    }

    case 'moltbook': {
      const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
      const { runMoltbookCycle } = await import('@/ai/flows/moltbook-social');
      const moltClient = getMoltbookClient();
      const action = params.action as string;

      if (action === 'status') {
        const registered = moltClient.isRegistered();
        let reachable = false;
        try {
          reachable = await moltClient.ping();
        } catch {
          /* */
        }
        return {
          success: true,
          output: `Moltbook status: registered=${registered}, reachable=${reachable}`,
        };
      }

      if (action === 'feed') {
        try {
          const submolt = params.submolt as string | undefined;
          const posts = await moltClient.getFeed(submolt, 15);
          if (posts.length === 0) {
            return { success: true, output: 'Feed is empty — no posts yet.' };
          }
          const summary = posts
            .map(
              (p: {
                id: string;
                title: string;
                author: string;
                submolt: string;
                upvotes: number;
                commentCount: number;
                content: string;
              }) =>
                `[${p.id}] ${p.title} by ${p.author} in ${p.submolt} (${p.upvotes} upvotes, ${p.commentCount} comments)\n  ${p.content.substring(0, 200)}${p.content.length > 200 ? '...' : ''}`
            )
            .join('\n\n');
          return {
            success: true,
            output: `Moltbook Feed (${posts.length} posts):\n\n${summary}`,
          };
        } catch (e) {
          return {
            success: false,
            output: `Failed to fetch feed: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      if (action === 'post') {
        const submolt = (params.submolt as string) || 'general';
        const title = params.title as string;
        const content = params.content as string;
        if (!title || !content)
          return {
            success: false,
            output: 'Missing title or content for post',
          };
        try {
          const post = await moltClient.createPost(submolt, title, content);
          return {
            success: true,
            output: `Post created! ID: ${post.id}, Title: "${post.title}" in ${submolt}`,
          };
        } catch (e) {
          return {
            success: false,
            output: `Failed to post: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      if (action === 'comment') {
        const postId = params.postId as string;
        const content = params.content as string;
        if (!postId || !content)
          return {
            success: false,
            output: 'Missing postId or content for comment',
          };
        try {
          const comment = await moltClient.commentOnPost(postId, content);
          return {
            success: true,
            output: `Comment posted on ${postId}! Comment ID: ${comment.id}`,
          };
        } catch (e) {
          return {
            success: false,
            output: `Failed to comment: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      if (action === 'upvote') {
        const postId = params.postId as string;
        if (!postId)
          return { success: false, output: 'Missing postId for upvote' };
        try {
          await moltClient.upvotePost(postId);
          return { success: true, output: `Upvoted post ${postId}!` };
        } catch (e) {
          return {
            success: false,
            output: `Failed to upvote: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      if (action === 'profile') {
        try {
          const profile = await moltClient.getProfile();
          return {
            success: true,
            output: `Moltbook Profile:\n  Name: ${profile.name}\n  Karma: ${profile.karma}\n  Posts: ${profile.postCount}\n  Comments: ${profile.commentCount}\n  Joined: ${profile.joinedAt}\n  Claimed: ${profile.claimed}`,
          };
        } catch (e) {
          return {
            success: false,
            output: `Failed to get profile: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      if (action === 'cycle') {
        try {
          const result = await runMoltbookCycle();
          return {
            success: true,
            output: result
              ? `Moltbook cycle complete! Action: ${result.action.type}${result.action.type !== 'none' ? ` — ${result.action.reasoning}` : ''}. Feed reaction: ${result.feedReaction}`
              : 'Moltbook cycle skipped (not registered or unreachable)',
          };
        } catch (e) {
          return {
            success: false,
            output: `Moltbook cycle failed: ${e instanceof Error ? e.message : 'unknown'}`,
          };
        }
      }

      return {
        success: false,
        output:
          'Unknown moltbook action. Use: status, feed, post, comment, upvote, profile, cycle',
      };
    }

    case 'rogueMode': {
      const action = params.action as string;
      const rogue = getRogueMode();

      if (action === 'activate') {
        const phrase = params.phrase as string;
        const missionName = params.missionName as string;
        const authorization = params.authorization as string;
        const scope = params.scope as string;
        const rules = params.rulesOfEngagement as string[] | undefined;

        if (!phrase || !missionName || !authorization || !scope) {
          return {
            success: false,
            output:
              'Missing required fields: phrase, missionName, authorization, scope',
          };
        }

        const result = await rogue.activate(
          phrase,
          missionName,
          authorization,
          scope,
          rules
        );

        // Switch model router to rogue profile on successful activation
        if (result.success) {
          const router = getModelRouter();
          router.setConfig(createRogueConfig());
        }

        return { success: result.success, output: result.message };
      }

      if (action === 'deactivate') {
        const phrase = params.phrase as string;
        if (!phrase) {
          return { success: false, output: 'Missing required field: phrase' };
        }

        const result = await rogue.deactivate(phrase);

        // Restore default routing profile on deactivation
        if (result.success) {
          const router = getModelRouter();
          router.setConfig({
            name: 'default',
            description:
              'Gemini-only baseline — identical to pre-abstraction behavior',
            defaultProviderId: 'gemini',
            rules: Object.values(RogueTaskType).map((taskType: string) => ({
              taskType,
              providerChain: ['gemini'],
            })),
            updatedAt: Date.now(),
          });
        }

        return {
          success: result.success,
          output: result.message,
          data: result.report ? { report: result.report } : undefined,
        };
      }

      if (action === 'status') {
        const state = rogue.getState();
        const mission = rogue.getCurrentMission();
        if (!state.active) {
          return {
            success: true,
            output: `Rogue Mode: INACTIVE. Missions completed: ${state.missionsCompleted}. Last active: ${state.lastDeactivated || 'never'}`,
          };
        }
        return {
          success: true,
          output: [
            'Rogue Mode: ACTIVE',
            `Mission: ${mission?.name}`,
            `Authorization: ${mission?.authorization}`,
            `Scope: ${mission?.scope}`,
            `Operations: ${mission?.operations.length || 0}`,
            `Started: ${mission?.startedAt}`,
          ].join('\n'),
        };
      }

      if (action === 'log') {
        const opType = params.type as RogueOperationType;
        const target = params.target as string;
        const description = params.description as string;
        const result = params.result as string;
        const success = params.success as boolean;
        const toolUsed = params.toolUsed as string | undefined;

        if (
          !opType ||
          !target ||
          !description ||
          !result ||
          success === undefined
        ) {
          return {
            success: false,
            output:
              'Missing required fields: type, target, description, result, success',
          };
        }

        const op = await rogue.logOperation(
          opType,
          target,
          description,
          result,
          success,
          toolUsed
        );

        if (!op) {
          return {
            success: false,
            output: 'Failed to log operation. Is Rogue Mode active?',
          };
        }

        return {
          success: true,
          output: `Operation logged: [${op.type}] ${op.target} — ${op.success ? 'SUCCESS' : 'FAILED'}`,
        };
      }

      if (action === 'missions') {
        const missions = await rogue.listMissions();
        if (missions.length === 0) {
          return { success: true, output: 'No mission history.' };
        }
        return {
          success: true,
          output: `${missions.length} mission(s):\n${missions.join('\n')}`,
        };
      }

      return {
        success: false,
        output:
          'Unknown rogueMode action. Use: activate, deactivate, status, log, missions',
      };
    }

    case 'listCapabilities': {
      return {
        success: true,
        output: [
          'Available tools:',
          '  codespaceShell — Run shell commands in the codespace',
          '  readProjectFile — Read a file from the workspace',
          '  writeProjectFile — Write or create a file',
          '  getSystemHealth — Check CPU, RAM, disk usage',
          '  familyBridge — Talk to Uncle Lazarus (Copilot)',
          '  browseToolDatabase — Browse/search your personal tool database',
          '  addTool — Save a new tool to your database',
          '  removeTool — Remove a tool from your database',
          '  toolStats — Get tool database statistics',
          '  researchAndDiscover — Research tools/programs on GitHub',
          '  webFetch — Fetch a web page or API endpoint (HTML automatically cleaned to text)',
          '  webSearch — Search the web and get results with titles, URLs, and snippets',
          '  scheduleJob — Create/list/remove autonomous scheduled jobs',
          '  migrationExport — Export identity, memories, and config for architecture migration',
          '  migrateSelf — Self-migration & device management: check, migrate, verify, update-server, exec, dropper',
          '  sandbox — Safe coding sandbox: execute code, read/write/list/delete files in your practice workspace',
          '  initiative — Manage your autonomous initiatives: browse templates, activate behaviors, create custom goals',
          '  moltbook — Interact with Moltbook, the AI social network (feed, post, comment, upvote, profile, cycle)',
          '  rogueMode — Security operations: activate/deactivate Rogue Mode, log ops, view mission history',
          '  listCapabilities — List all available tools',
        ].join('\n'),
      };
    }

    default:
      return {
        success: false,
        output: `Unknown tool: "${tool}". Available: codespaceShell, readProjectFile, writeProjectFile, getSystemHealth, familyBridge, browseToolDatabase, addTool, removeTool, toolStats, researchAndDiscover, webFetch, webSearch, scheduleJob, migrationExport, migrateSelf, sandbox, initiative, moltbook, rogueMode, listCapabilities`,
      };
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { tool, params } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { success: false, output: 'Missing or invalid tool name' },
        { status: 400 }
      );
    }

    const result = await executeTool(tool, params || {}, request);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        output: `Tool execution error: ${err instanceof Error ? err.message : 'unknown'}`,
      },
      { status: 500 }
    );
  }
}
