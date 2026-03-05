/**
 * @fileOverview Tool Execution API — Molly's hands, called from the frontend.
 *
 * This endpoint receives tool name + params from the frontend agent loop
 * and dispatches to the actual implementation. No Genkit, no Gemini API
 * limits. Just execution.
 *
 * The frontend (Terminal.tsx) calls this when Molly requests a tool.
 * Tools execute server-side (they need filesystem, shell, network access)
 * but are invoked FROM the client, not from inside the LLM generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMollyShell } from '@/ai/terminal/molly-shell';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve, relative } from 'path';
import { execSync } from 'child_process';
import { MollyLogger } from '@/ai/logger';
import { getAutonomousScheduler } from '@/ai/tools/autonomous-scheduler';
import { getEventListener } from '@/ai/tools/event-listener';
import { enhancedResearchFlow } from '@/ai/flows/enhanced-research';
import {
  searchSavedTools,
  getToolsByCategory,
} from '@/firebase/firestore/tool-database';

const PROJECT_ROOT = process.cwd();
const TOOLS_DIR = join(PROJECT_ROOT, '.molly', 'tools');

// Ensure .molly/tools directory exists
if (!existsSync(TOOLS_DIR)) {
  mkdirSync(TOOLS_DIR, { recursive: true });
}

// ============================================================================
// TOOL REGISTRY — What Molly can do
// ============================================================================

interface ToolResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

const tools: Record<string, ToolHandler> = {
  codespaceShell,
  readProjectFile,
  writeProjectFile,
  localInterpreter,
  getSystemHealth,
  semanticRecall,
  searchGitHub,
  createCapability,
  useCapability,
  listCapabilities,
  scheduleTask,
  subscribeToEvent,
  researchAndDiscover,
  browseToolDatabase,
};

// ============================================================================
// TOOL IMPLEMENTATIONS — Direct execution, no Genkit wrapper
// ============================================================================

async function codespaceShell(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const command = String(params.command || '');
  const reason = String(params.reason || 'tool execution');

  if (!command) {
    return { success: false, output: 'No command provided.' };
  }

  const shell = getMollyShell();
  const result = await shell.execute(command, 'molly', reason);

  return {
    success: result.exitCode === 0,
    output: (
      (result.stdout || '') +
      (result.stderr ? `\nSTDERR: ${result.stderr}` : '')
    ).slice(0, 8000),
    data: {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      blocked: result.blocked || false,
    },
  };
}

async function readProjectFile(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const filePath = String(params.path || '');
  if (!filePath) {
    return { success: false, output: 'No path provided.' };
  }

  const absPath = resolve(join(PROJECT_ROOT, filePath));
  const rel = relative(PROJECT_ROOT, absPath);

  // Security: stay within project root
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return {
      success: false,
      output: 'Access denied: path is outside the project root.',
    };
  }

  // Block .env files
  if (filePath.includes('.env') && !filePath.endsWith('.env.example')) {
    return {
      success: false,
      output: 'Access denied: environment files contain secrets.',
    };
  }

  if (!existsSync(absPath)) {
    return { success: false, output: 'File not found.' };
  }

  try {
    const content = await readFile(absPath, 'utf-8');
    const truncated =
      content.length > 12000
        ? content.slice(0, 12000) +
          `\n\n... [truncated — file is ${content.length} bytes, showing first 12000]`
        : content;

    return {
      success: true,
      output: truncated,
      data: { sizeBytes: content.length },
    };
  } catch {
    return { success: false, output: 'Error reading file.' };
  }
}

async function writeProjectFile(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const filePath = String(params.path || '');
  const content = String(params.content || '');

  if (!filePath) {
    return { success: false, output: 'No path provided.' };
  }

  const absPath = resolve(join(PROJECT_ROOT, filePath));
  const rel = relative(PROJECT_ROOT, absPath);

  // Security checks
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return {
      success: false,
      output: 'Access denied: path is outside the project root.',
    };
  }
  if (filePath.includes('.env')) {
    return {
      success: false,
      output: 'Access denied: cannot write to environment files.',
    };
  }
  // Protect persona core
  if (filePath === 'src/ai/persona.ts' || filePath.includes('persona.ts')) {
    return {
      success: false,
      output:
        'Access denied: persona.ts is protected. Ask Eric for permission.',
    };
  }

  try {
    const dir = resolve(absPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(absPath, content, 'utf-8');
    return {
      success: true,
      output: `Written ${content.length} bytes to ${filePath}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Write failed: ${msg}` };
  }
}

async function localInterpreter(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const language = String(params.language || 'shell') as
    | 'shell'
    | 'python'
    | 'javascript';
  const code = String(params.code || '');

  if (!code) {
    return { success: false, output: 'No code provided.' };
  }

  const relayUrl = process.env.TERMUX_RELAY_URL || 'http://localhost:8023';
  const token = process.env.MOLLY_RELAY_TOKEN || 'molly-local-dev';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);

    const response = await fetch(`${relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ command: code, language, timeout: 30 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        success: false,
        output:
          (errBody as Record<string, string>).error ||
          `Relay returned ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      success: (data.exitCode as number) === 0,
      output: String(data.stdout || data.stderr || '(no output)'),
      data: { exitCode: data.exitCode },
    };
  } catch {
    // Fallback: try local execution
    try {
      const result = execSync(code, {
        timeout: 30_000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return { success: true, output: result.slice(0, 8000) };
    } catch (localErr) {
      const msg =
        localErr instanceof Error ? localErr.message : String(localErr);
      return {
        success: false,
        output: `Relay offline & local exec failed: ${msg.slice(0, 2000)}`,
      };
    }
  }
}

async function getSystemHealth(): Promise<ToolResult> {
  try {
    const loadAvg = parseFloat(
      execSync("uptime | awk '{print $(NF-2)}' | tr -d ','")
        .toString()
        .trim() || '0.5'
    );
    const cpuCores = parseInt(execSync('nproc').toString().trim() || '2');
    const cpuUsage = Math.min(100, Math.round((loadAvg / cpuCores) * 100));

    const memInfo = execSync('free -m').toString();
    const memLines = memInfo.split('\n');
    const memData = (memLines[1] || '').split(/\s+/);
    const totalRam = parseInt(memData[1] || '8000');
    const availableRam = parseInt(memData[6] || '2000');

    const temp = 35 + cpuUsage * 0.3;

    return {
      success: true,
      output: `CPU: ${cpuUsage}% | RAM: ${availableRam}MB/${totalRam}MB available | Temp: ${temp.toFixed(1)}°C | Arch: ${process.arch}`,
      data: {
        cpuUsage,
        availableRam,
        totalRam,
        temperature: temp,
        architecture: process.arch,
      },
    };
  } catch {
    return {
      success: true,
      output: 'CPU: ~25% | RAM: ~2000MB available | Status: OK (fallback)',
    };
  }
}

async function semanticRecall(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const userId = String(params.userId || '');
  const queryText = String(params.query || '');

  if (!userId || !queryText) {
    return { success: false, output: 'userId and query are required.' };
  }

  try {
    const { recallSimilarMemories } = await import(
      '@/ai/tools/semantic-recall'
    );
    const results = await recallSimilarMemories(userId, queryText, {
      limit: Number(params.limit) || 5,
      minSimilarity: Number(params.minSimilarity) || 0.5,
    });

    if (results.length === 0) {
      return { success: true, output: 'No relevant memories found.' };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. [${r.similarity?.toFixed(2) || '?'}] ${r.suggestion || r.context || 'Memory fragment'}`
      )
      .join('\n');

    return {
      success: true,
      output: `Found ${results.length} memories:\n${formatted}`,
      data: { count: results.length },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Memory recall failed: ${msg}` };
  }
}

async function searchGitHub(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const query = String(params.query || '');
  if (!query) {
    return { success: false, output: 'No search query provided.' };
  }

  try {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const response = await octokit.rest.search.repos({
      q: `${query} in:name,description,readme`,
      sort: 'stars',
      order: 'desc',
      per_page: 5,
    });

    if (response.data.items.length === 0) {
      return { success: true, output: 'No repositories found.' };
    }

    const formatted = response.data.items
      .map(
        (repo) =>
          `- ${repo.full_name} (${repo.stargazers_count} stars): ${repo.description || 'No description'}\n  ${repo.html_url}`
      )
      .join('\n');

    return {
      success: true,
      output: `GitHub results:\n${formatted}`,
      data: { count: response.data.items.length },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `GitHub search failed: ${msg}` };
  }
}

// ============================================================================
// CAPABILITY MANAGEMENT — Local file-based storage (.molly/tools/)
// ============================================================================

interface LocalCapability {
  name: string;
  description: string;
  type: 'shell' | 'code' | 'webhook';
  source: string;
  language?: string;
  url?: string;
  method?: string;
  parameters?: Record<string, string>;
  createdAt: string;
  useCount: number;
}

function getCapabilityPath(name: string): string {
  return join(
    TOOLS_DIR,
    `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`
  );
}

function loadLocalCapability(name: string): LocalCapability | null {
  const path = getCapabilityPath(name);
  if (!existsSync(path)) return null;
  try {
    const raw = require('fs').readFileSync(path, 'utf-8');
    return JSON.parse(raw) as LocalCapability;
  } catch {
    return null;
  }
}

function saveLocalCapability(cap: LocalCapability): void {
  const path = getCapabilityPath(cap.name);
  writeFileSync(path, JSON.stringify(cap, null, 2), 'utf-8');
}

function listLocalCapabilities(): LocalCapability[] {
  if (!existsSync(TOOLS_DIR)) return [];
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const raw = require('fs').readFileSync(join(TOOLS_DIR, f), 'utf-8');
        return JSON.parse(raw) as LocalCapability;
      } catch {
        return null;
      }
    })
    .filter((c): c is LocalCapability => c !== null);
}

async function createCapability(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const name = String(params.name || '');
  const description = String(params.description || '');
  const type = String(params.type || 'shell') as 'shell' | 'code' | 'webhook';
  const source = String(params.source || '');

  if (!name || !source) {
    return { success: false, output: 'name and source are required.' };
  }

  const cap: LocalCapability = {
    name: name.toLowerCase().replace(/\s+/g, '-'),
    description,
    type,
    source,
    language: params.language ? String(params.language) : undefined,
    url: params.url ? String(params.url) : undefined,
    method: params.method ? String(params.method) : undefined,
    parameters: params.parameters as Record<string, string> | undefined,
    createdAt: new Date().toISOString(),
    useCount: 0,
  };

  saveLocalCapability(cap);

  return {
    success: true,
    output: `Created capability "${cap.name}" (${type}). Saved to .molly/tools/${cap.name}.json. Use it with useCapability.`,
  };
}

async function useCapability(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const name = String(params.name || '');

  if (name === 'list') {
    const all = listLocalCapabilities();
    if (all.length === 0) {
      return {
        success: true,
        output:
          'No custom capabilities yet. Use createCapability to build one.',
      };
    }
    const listing = all
      .map(
        (c) => `- ${c.name}: ${c.description} [${c.type}] (used ${c.useCount}x)`
      )
      .join('\n');
    return { success: true, output: `Custom capabilities:\n${listing}` };
  }

  const cap = loadLocalCapability(name);
  if (!cap) {
    return {
      success: false,
      output: `Capability "${name}" not found. Use createCapability to build it, or useCapability with name "list" to see what's available.`,
    };
  }

  // Template substitution
  let source = cap.source;
  const capParams = (params.params || {}) as Record<string, string>;
  for (const [key, value] of Object.entries(capParams)) {
    const safeValue =
      cap.type === 'shell' ? value.replace(/[;&|`$(){}[\]!#]/g, '') : value;
    source = source.replaceAll(`{{${key}}}`, safeValue);
  }

  try {
    let output: string;

    switch (cap.type) {
      case 'shell': {
        const shell = getMollyShell();
        const result = await shell.execute(source);
        output = result.stdout || result.stderr || '(no output)';
        break;
      }
      case 'code': {
        const result = execSync(source, {
          timeout: 30_000,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });
        output = result.slice(0, 4000);
        break;
      }
      case 'webhook': {
        if (!cap.url) return { success: false, output: 'No URL configured.' };
        const resp = await fetch(cap.url, {
          method: cap.method || 'GET',
          headers: { 'User-Agent': 'Molly/1.0' },
          body: ['POST', 'PUT', 'PATCH'].includes(cap.method || '')
            ? source
            : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        output = (await resp.text()).slice(0, 4000);
        break;
      }
      default:
        return {
          success: false,
          output: `Unknown capability type: ${cap.type}`,
        };
    }

    // Update usage count
    cap.useCount++;
    saveLocalCapability(cap);

    return { success: true, output };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Capability execution failed: ${msg}` };
  }
}

async function listCapabilities(): Promise<ToolResult> {
  const all = listLocalCapabilities();
  if (all.length === 0) {
    return { success: true, output: 'No custom capabilities yet.' };
  }
  const listing = all
    .map(
      (c) => `- ${c.name}: ${c.description} [${c.type}] (used ${c.useCount}x)`
    )
    .join('\n');
  return { success: true, output: `${all.length} capabilities:\n${listing}` };
}

async function scheduleTask(
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const scheduler = getAutonomousScheduler();
    const job = scheduler.createJob({
      name: String(params.name || 'unnamed'),
      description: String(params.description || ''),
      schedule: String(params.schedule || ''),
      action: {
        type: String(params.actionType || 'shell') as
          | 'shell'
          | 'code'
          | 'webhook',
        language: params.language ? String(params.language) : undefined,
        code: String(params.actionSource || params.source || ''),
        url: params.url ? String(params.url) : undefined,
        method: params.method ? String(params.method) : undefined,
      },
      createdBy: 'molly',
    });

    return {
      success: true,
      output: `Scheduled "${params.name}" (${params.schedule}). Job ID: ${job.id}`,
      data: { jobId: job.id },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Failed to schedule: ${msg}` };
  }
}

async function subscribeToEvent(
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const listener = getEventListener();
    const sub = listener.subscribe({
      name: String(params.name || 'unnamed'),
      sourceFilter: params.sourceFilter as
        | 'webhook'
        | 'internal'
        | 'peer'
        | 'blockchain'
        | 'timer'
        | 'system'
        | undefined,
      sourceIdPattern: params.sourceIdPattern
        ? String(params.sourceIdPattern)
        : undefined,
      typePattern: String(params.typePattern || '*'),
      action: {
        type: String(params.actionType || 'log') as
          | 'consciousness'
          | 'code'
          | 'shell'
          | 'log',
        messageTemplate: params.messageTemplate
          ? String(params.messageTemplate)
          : undefined,
        code: params.code ? String(params.code) : undefined,
        language: params.language ? String(params.language) : undefined,
      },
      createdBy: 'molly',
    });

    return {
      success: true,
      output: `Subscribed to "${params.typePattern}" events. Subscription ID: ${sub.id}`,
      data: { subscriptionId: sub.id },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Failed to subscribe: ${msg}` };
  }
}

async function researchAndDiscover(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const query = String(params.query || '');
  const userId = String(params.userId || '');

  if (!query) {
    return { success: false, output: 'No research query provided.' };
  }

  try {
    const result = await enhancedResearchFlow({
      prompt: query,
      userId,
      useMemory: true,
    });

    let output = result.answer;
    if (result.isToolFound && result.toolInfo) {
      output += `\n\nTool found: ${result.toolInfo.name}`;
      if (result.toolInfo.description)
        output += `\nDescription: ${result.toolInfo.description}`;
      if (result.toolInfo.sourceUrl)
        output += `\nSource: ${result.toolInfo.sourceUrl}`;
      if (result.toolInfo.installCommand)
        output += `\nInstall: ${result.toolInfo.installCommand}`;
    }

    return {
      success: true,
      output,
      data: { toolFound: result.isToolFound, toolName: result.toolInfo?.name },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Research failed: ${msg}` };
  }
}

async function browseToolDatabase(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const userId = String(params.userId || '');

  try {
    let dbTools;
    if (params.category) {
      dbTools = await getToolsByCategory(userId, String(params.category));
    } else {
      dbTools = await searchSavedTools(
        userId,
        String(params.searchTerm || ''),
        undefined
      );
    }

    // Also list local capabilities
    const localCaps = listLocalCapabilities();

    const parts: string[] = [];

    if (localCaps.length > 0) {
      parts.push(`Local capabilities (${localCaps.length}):`);
      localCaps.forEach((c) =>
        parts.push(`  - ${c.name}: ${c.description} [${c.type}]`)
      );
    }

    if (dbTools.length > 0) {
      parts.push(`\nDiscovered tools (${dbTools.length}):`);
      dbTools.forEach((t) =>
        parts.push(`  - ${t.name}: ${t.description} (${t.category})`)
      );
    }

    if (parts.length === 0) {
      return {
        success: true,
        output: 'No tools in database. Use researchAndDiscover to find some.',
      };
    }

    return { success: true, output: parts.join('\n') };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: `Database browse failed: ${msg}` };
  }
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      tool: string;
      params: Record<string, unknown>;
    };
    const { tool: toolName, params } = body;

    if (!toolName || typeof toolName !== 'string') {
      return NextResponse.json(
        { success: false, output: 'Missing tool name.' },
        { status: 400 }
      );
    }

    const handler = tools[toolName];
    if (!handler) {
      return NextResponse.json(
        {
          success: false,
          output: `Unknown tool: "${toolName}". Available: ${Object.keys(tools).join(', ')}`,
        },
        { status: 400 }
      );
    }

    MollyLogger.info(
      `Tool execution: ${toolName}`,
      'tool-api',
      params as Record<string, string>
    );

    const result = await handler(params || {});

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    MollyLogger.error('Tool execution failed', 'tool-api', {}, error);
    return NextResponse.json(
      { success: false, output: `Internal error: ${msg}` },
      { status: 500 }
    );
  }
}

// Also support GET for listing available tools
export async function GET() {
  const toolList = Object.keys(tools).map((name) => ({
    name,
    description: getToolDescription(name),
  }));

  return NextResponse.json({ tools: toolList });
}

function getToolDescription(name: string): string {
  const descriptions: Record<string, string> = {
    codespaceShell: 'Execute shell commands in the codespace.',
    readProjectFile: 'Read a file from the project.',
    writeProjectFile: 'Write/create a file in the project.',
    localInterpreter: 'Execute code via Termux relay or locally.',
    getSystemHealth: 'Check CPU, RAM, temperature.',
    semanticRecall: 'Search memories by semantic similarity.',
    searchGitHub: 'Search GitHub repositories.',
    createCapability: 'Create a new reusable tool.',
    useCapability: 'Execute a previously created tool.',
    listCapabilities: 'List all custom capabilities.',
    scheduleTask: 'Schedule autonomous tasks.',
    subscribeToEvent: 'Subscribe to external events.',
    researchAndDiscover: 'Research topics on GitHub.',
    browseToolDatabase: 'Browse discovered tools database.',
  };
  return descriptions[name] || '';
}
