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

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const WORKSPACE_ROOT = process.cwd();

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
  'top',
  'which',
  'file',
  'stat',
  'tree',
  'node',
  'npx',
  'npm run',
  'npm test',
  'npm run typecheck',
  'npm run lint',
  'npm run format',
  'npm run harden',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git --no-pager',
  'python3',
  'pip',
  'curl',
  'mkdir',
  'touch',
  'cp',
  'mv',
];

function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  // Allow piped commands only if every segment starts with an allowed prefix
  const segments = trimmed.split(/\s*\|\s*/);
  return segments.every((segment) => {
    const seg = segment.trim();
    return ALLOWED_COMMANDS.some((allowed) => seg.startsWith(allowed));
  });
}

async function executeTool(
  tool: string,
  params: Record<string, unknown>
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
          '  listCapabilities — List all available tools',
        ].join('\n'),
      };
    }

    default:
      return {
        success: false,
        output: `Unknown tool: "${tool}". Available: codespaceShell, readProjectFile, writeProjectFile, getSystemHealth, familyBridge, browseToolDatabase, addTool, removeTool, toolStats, researchAndDiscover, listCapabilities`,
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, params } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { success: false, output: 'Missing or invalid tool name' },
        { status: 400 }
      );
    }

    const result = await executeTool(tool, params || {});

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
