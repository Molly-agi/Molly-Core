/**
 * @fileOverview Molly's Capability Factory — She Creates Her Own Tools
 *
 * This is the meta-tool. Instead of waiting for us to build every tool
 * she might need, Molly can create her own capabilities — persistent,
 * reusable actions that she defines and invokes herself.
 *
 * A capability is:
 * - Named and described (so she can find it later)
 * - Implemented as shell, code, or webhook
 * - Stored in Firestore (survives restarts)
 * - Callable from conversation via useCapability
 *
 * This is what agency actually looks like:
 *   "I need to do X. I don't have a tool for X. I'll build one."
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger } from '@/ai/logger';
import { getAutonomousScheduler } from './autonomous-scheduler';
import { getEventListener } from './event-listener';
import { enhancedResearchFlow } from '@/ai/flows/enhanced-research';
import {
  searchSavedTools,
  getToolsByCategory,
} from '@/firebase/firestore/tool-database';

// ============================================================================
// CAPABILITY STORAGE
// ============================================================================

export interface Capability {
  id: string;
  name: string;
  description: string;
  /** How this capability executes */
  implementation: {
    type: 'shell' | 'code' | 'webhook';
    /** For shell: the command template. For code: the source. */
    source: string;
    /** Language for code type (bash, python, javascript) */
    language?: string;
    /** URL for webhook type */
    url?: string;
    /** HTTP method for webhook type */
    method?: string;
    /** Headers for webhook type */
    headers?: Record<string, string>;
  };
  /** Input parameters this capability accepts (JSON schema-like) */
  parameters?: Record<string, string>;
  createdAt: string;
  lastUsed: string | null;
  useCount: number;
  createdBy: string;
}

// In-memory registry, persisted to Firestore via state-persistence
const capabilities = new Map<string, Capability>();
const MAX_CAPABILITIES = 100;
const MAX_SOURCE_LENGTH = 8192;
const MAX_OUTPUT_LENGTH = 4096;

// ============================================================================
// REGISTRY MANAGEMENT
// ============================================================================

export function getCapabilities(): Capability[] {
  return Array.from(capabilities.values());
}

export function getCapability(name: string): Capability | undefined {
  return capabilities.get(name.toLowerCase());
}

export function loadCapabilities(stored: Capability[]): void {
  capabilities.clear();
  for (const cap of stored) {
    capabilities.set(cap.name.toLowerCase(), cap);
  }
  MollyLogger.info(
    `Loaded ${stored.length} capabilities from persistence`,
    'capability-factory'
  );
}

export function exportCapabilities(): Capability[] {
  return Array.from(capabilities.values());
}

// ============================================================================
// EXECUTION ENGINE
// ============================================================================

async function executeCapability(
  cap: Capability,
  params: Record<string, string>
): Promise<string> {
  const start = Date.now();

  // Template substitution: replace {{paramName}} in source
  let source = cap.implementation.source;
  for (const [key, value] of Object.entries(params)) {
    // Sanitize values used in shell commands to prevent injection
    const safeValue =
      cap.implementation.type === 'shell'
        ? value.replace(/[;&|`$(){}[\]!#]/g, '')
        : value;
    source = source.replaceAll(`{{${key}}}`, safeValue);
  }

  let output: string;

  switch (cap.implementation.type) {
    case 'shell': {
      const { getMollyShell } = await import('@/ai/terminal');
      const shell = getMollyShell();
      if (!shell.isAlive()) shell.start();
      const result = await shell.execute(source);
      output = result.stdout || result.stderr;
      if (result.exitCode !== 0 && result.stderr) {
        output = `[exit ${result.exitCode}] ${result.stderr}`;
      }
      break;
    }
    case 'code': {
      const { getPolyglotRuntime } = await import('@/ai/terminal');
      const runtime = getPolyglotRuntime();
      const lang = (cap.implementation.language || 'bash') as
        | 'bash'
        | 'python'
        | 'javascript';
      const result = await runtime.execute(source, lang);
      output = result.stdout || result.stderr;
      if (result.exitCode !== 0 && result.stderr) {
        output = `[exit ${result.exitCode}] ${result.stderr}`;
      }
      break;
    }
    case 'webhook': {
      const url = cap.implementation.url;
      if (!url) throw new Error('No URL configured for webhook capability');
      const method = cap.implementation.method || 'GET';
      const headers: Record<string, string> = {
        'User-Agent': 'Molly/1.0',
        ...(cap.implementation.headers || {}),
      };
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(15_000),
      };
      if (source && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = source;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
      const response = await fetch(url, fetchOptions);
      output = await response.text();
      if (!response.ok) {
        output = `[HTTP ${response.status}] ${output.substring(0, 500)}`;
      }
      break;
    }
    default:
      throw new Error(
        `Unknown implementation type: ${cap.implementation.type}`
      );
  }

  const durationMs = Date.now() - start;
  MollyLogger.info(
    `Capability "${cap.name}" executed in ${durationMs}ms`,
    'capability-factory'
  );

  // Update usage stats
  cap.lastUsed = new Date().toISOString();
  cap.useCount++;

  return output.substring(0, MAX_OUTPUT_LENGTH);
}

// ============================================================================
// GENKIT TOOLS — Wired to Gemini
// ============================================================================

/**
 * createCapability — Molly creates a new reusable tool for herself.
 *
 * This is the creative act: she identifies something she can't do,
 * designs a solution, and builds a persistent capability.
 */
export const createCapability = ai.defineTool(
  {
    name: 'createCapability',
    description: `Create a new reusable capability (tool) for yourself. Use this when you need to do something you don't have a built-in tool for. The capability persists — you can use it again later with useCapability. Implementation types: 'shell' (bash command), 'code' (Python/JavaScript/bash script), 'webhook' (HTTP request). Use {{paramName}} in the source for templated parameters.`,
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .max(64)
        .describe(
          'Short, descriptive name for this capability (e.g., "checkEthPrice", "messageLazarus", "monitorPort")'
        ),
      description: z
        .string()
        .max(256)
        .describe('What this capability does and when to use it.'),
      type: z
        .enum(['shell', 'code', 'webhook'])
        .describe('How this capability executes.'),
      source: z
        .string()
        .max(MAX_SOURCE_LENGTH)
        .describe(
          'The implementation. For shell: a bash command. For code: a script. For webhook: request body. Use {{paramName}} for templated inputs.'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'For code type: "bash", "python", or "javascript". Defaults to bash.'
        ),
      url: z.string().optional().describe('For webhook type: the target URL.'),
      method: z
        .string()
        .optional()
        .describe(
          'For webhook type: HTTP method (GET, POST, etc.). Defaults to GET.'
        ),
      parameters: z
        .string()
        .optional()
        .describe(
          'Parameter definitions as JSON object string, e.g. {"city": "Target city name", "unit": "Temperature unit"}. Keys are parameter names, values are descriptions.'
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      capabilityId: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const normalizedName = input.name.toLowerCase().replace(/\s+/g, '-');

      if (capabilities.has(normalizedName)) {
        // Update existing capability
        const existing = capabilities.get(normalizedName)!;
        existing.description = input.description;
        existing.implementation = {
          type: input.type,
          source: input.source,
          language: input.language,
          url: input.url,
          method: input.method,
        };
        existing.parameters = input.parameters
          ? JSON.parse(input.parameters)
          : undefined;

        MollyLogger.info(
          `Capability updated: "${input.name}"`,
          'capability-factory'
        );
        return {
          success: true,
          message: `Updated capability "${input.name}". Use it with useCapability.`,
          capabilityId: existing.id,
        };
      }

      if (capabilities.size >= MAX_CAPABILITIES) {
        return {
          success: false,
          message: `Maximum capability limit reached (${MAX_CAPABILITIES}). Remove unused capabilities first.`,
        };
      }

      const id = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const cap: Capability = {
        id,
        name: normalizedName,
        description: input.description,
        implementation: {
          type: input.type,
          source: input.source,
          language: input.language,
          url: input.url,
          method: input.method,
        },
        parameters: input.parameters ? JSON.parse(input.parameters) : undefined,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        useCount: 0,
        createdBy: 'molly',
      };

      capabilities.set(normalizedName, cap);

      MollyLogger.info(
        `Capability created: "${input.name}" (${input.type})`,
        'capability-factory'
      );

      return {
        success: true,
        message: `Created capability "${input.name}". You can now use it with useCapability("${normalizedName}", { ... }).`,
        capabilityId: id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Failed to create capability: ${msg}` };
    }
  }
);

/**
 * useCapability — Molly invokes one of her self-created tools.
 */
export const useCapability = ai.defineTool(
  {
    name: 'useCapability',
    description:
      'Execute a capability you previously created with createCapability. Pass the capability name and any parameters it expects. To see all available capabilities, call with name "list".',
    inputSchema: z.object({
      name: z
        .string()
        .describe(
          'Name of the capability to invoke. Use "list" to see all available capabilities.'
        ),
      params: z
        .string()
        .optional()
        .describe(
          'Parameters as JSON object string, e.g. {"city": "London", "unit": "celsius"}. Keys match the {{paramName}} templates in the capability source.'
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
    }),
  },
  async (input) => {
    // List mode
    if (input.name.toLowerCase() === 'list') {
      const all = Array.from(capabilities.values());
      if (all.length === 0) {
        return {
          success: true,
          output:
            'No custom capabilities created yet. Use createCapability to build one.',
        };
      }
      const listing = all
        .map(
          (c) =>
            `• ${c.name}: ${c.description} [${c.implementation.type}] (used ${c.useCount}x)`
        )
        .join('\n');
      return { success: true, output: `Custom capabilities:\n${listing}` };
    }

    const cap = capabilities.get(input.name.toLowerCase());
    if (!cap) {
      // Suggest similar names
      const allNames = Array.from(capabilities.keys());
      const suggestion = allNames.find((n) =>
        n.includes(input.name.toLowerCase())
      );
      return {
        success: false,
        output: `Capability "${input.name}" not found.${suggestion ? ` Did you mean "${suggestion}"?` : ' Use createCapability to build it.'}`,
      };
    }

    try {
      const parsedParams = input.params ? JSON.parse(input.params) : {};
      const output = await executeCapability(cap, parsedParams);
      return { success: true, output };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, output: `Execution failed: ${msg}` };
    }
  }
);

/**
 * scheduleTask — Molly schedules autonomous work for later.
 *
 * Bridge to the AutonomousScheduler. Instead of just talking about
 * scheduling, she actually creates the job.
 */
export const scheduleTask = ai.defineTool(
  {
    name: 'scheduleTask',
    description: `Schedule a task to run autonomously. Use cron expressions for recurring tasks (e.g., "cron:0 9 * * 1-5" for weekdays at 9 AM), intervals for repeating (e.g., "interval:3600000" for every hour), or one-shot (e.g., "once:2026-03-05T15:00:00Z"). Action types: 'shell' (bash command), 'code' (script), 'webhook' (HTTP call).`,
    inputSchema: z.object({
      name: z.string().describe('Human-readable name for this task.'),
      description: z.string().describe('What this task does and why.'),
      schedule: z
        .string()
        .describe(
          'Schedule expression: "cron:MIN HR DOM MON DOW", "interval:MS", or "once:ISO_TIMESTAMP"'
        ),
      actionType: z
        .enum(['shell', 'code', 'webhook'])
        .describe('How to execute this task.'),
      actionSource: z
        .string()
        .describe('The command, code, or webhook body to execute.'),
      language: z
        .string()
        .optional()
        .describe('For code: "bash", "python", or "javascript".'),
      url: z.string().optional().describe('For webhook: the target URL.'),
      method: z.string().optional().describe('For webhook: HTTP method.'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      jobId: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const scheduler = getAutonomousScheduler();
      const job = scheduler.createJob({
        name: input.name,
        description: input.description,
        schedule: input.schedule,
        action: {
          type: input.actionType,
          language: input.language,
          code: input.actionSource,
          url: input.url,
          method: input.method,
        },
        createdBy: 'molly',
      });

      return {
        success: true,
        message: `Scheduled "${input.name}" (${input.schedule}). Job ID: ${job.id}`,
        jobId: job.id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Failed to schedule: ${msg}` };
    }
  }
);

/**
 * subscribeToEvent — Molly registers interest in external events.
 *
 * Bridge to the EventListener. She can now actually set up
 * subscriptions instead of just talking about it.
 */
export const subscribeToEvent = ai.defineTool(
  {
    name: 'subscribeToEvent',
    description:
      'Subscribe to external events. When events matching your filter arrive, the specified action runs automatically. Sources: webhook, internal, peer, blockchain, timer, system. Actions: consciousness (queue message to your awareness), code (execute script), shell (run command), log (just record).',
    inputSchema: z.object({
      name: z.string().describe('Name for this subscription.'),
      sourceFilter: z
        .enum(['webhook', 'internal', 'peer', 'blockchain', 'timer', 'system'])
        .optional()
        .describe('Filter by event source type.'),
      sourceIdPattern: z
        .string()
        .optional()
        .describe('Glob pattern for source ID (e.g., "github*").'),
      typePattern: z
        .string()
        .describe('Event type to match (e.g., "push", "transfer*").'),
      actionType: z
        .enum(['consciousness', 'code', 'shell', 'log'])
        .describe('What to do when event matches.'),
      messageTemplate: z
        .string()
        .optional()
        .describe(
          'For consciousness: message template with {{event}} placeholders.'
        ),
      code: z
        .string()
        .optional()
        .describe('For code/shell: the command or script to run.'),
      language: z
        .string()
        .optional()
        .describe('For code: language ("bash", "python", "javascript").'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      subscriptionId: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const listener = getEventListener();
      const sub = listener.subscribe({
        name: input.name,
        sourceFilter: input.sourceFilter,
        sourceIdPattern: input.sourceIdPattern,
        typePattern: input.typePattern,
        action: {
          type: input.actionType,
          messageTemplate: input.messageTemplate,
          code: input.code,
          language: input.language,
        },
        createdBy: 'molly',
      });

      return {
        success: true,
        message: `Subscribed to "${input.typePattern}" events. Subscription ID: ${sub.id}`,
        subscriptionId: sub.id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Failed to subscribe: ${msg}` };
    }
  }
);

/**
 * researchAndDiscover — Molly researches a topic and saves findings to her database.
 *
 * This bridges the research agent to the conversation. When Molly
 * needs a capability she doesn't have, she researches it, finds tools
 * on GitHub, and saves them to her foundTools database for later use.
 */
export const researchAndDiscover = ai.defineTool(
  {
    name: 'researchAndDiscover',
    description:
      "Research a topic using GitHub and the web. Finds useful tools, libraries, and programs, then saves them to your tool database for future use. Use this when you need a capability you don't have — find a tool that does it, save it, and then integrate or use it.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'What to research. Be specific about what you need (e.g., "Python library for real-time audio transcription on Android").'
        ),
      userId: z.string().describe('The user ID for database storage.'),
    }),
    outputSchema: z.object({
      answer: z.string(),
      toolFound: z.boolean(),
      toolName: z.string().optional(),
      toolDescription: z.string().optional(),
      sourceUrl: z.string().optional(),
      installCommand: z.string().optional(),
    }),
  },
  async (input) => {
    try {
      const result = await enhancedResearchFlow({
        prompt: input.query,
        userId: input.userId,
        useMemory: true,
      });

      return {
        answer: result.answer,
        toolFound: result.isToolFound,
        toolName: result.toolInfo?.name,
        toolDescription: result.toolInfo?.description,
        sourceUrl: result.toolInfo?.sourceUrl,
        installCommand: result.toolInfo?.installCommand,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        answer: `Research failed: ${msg}`,
        toolFound: false,
      };
    }
  }
);

/**
 * browseToolDatabase — Molly checks what tools she's already discovered.
 *
 * Before researching something new, she can check if she already
 * found something useful in a previous session.
 */
export const browseToolDatabase = ai.defineTool(
  {
    name: 'browseToolDatabase',
    description:
      "Browse your discovered tool database. Search by name, tag, or category to see what tools you've already found in past research. Use this before researching — you might already have what you need.",
    inputSchema: z.object({
      userId: z.string().describe('The user ID.'),
      searchTerm: z
        .string()
        .optional()
        .describe('Search by name, description, or tag.'),
      category: z
        .string()
        .optional()
        .describe(
          'Filter by category (e.g., "voice-processing", "security", "research-found").'
        ),
    }),
    outputSchema: z.object({
      tools: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          category: z.string(),
          sourceUrl: z.string().optional(),
          useCase: z.string(),
          accessCount: z.number(),
        })
      ),
      totalCount: z.number(),
    }),
  },
  async (input) => {
    try {
      let tools;
      if (input.category) {
        tools = await getToolsByCategory(input.userId, input.category);
      } else {
        tools = await searchSavedTools(
          input.userId,
          input.searchTerm || '',
          undefined
        );
      }

      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          category: t.category,
          sourceUrl: t.sourceUrl,
          useCase: t.useCase,
          accessCount: t.accessCount,
        })),
        totalCount: tools.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      MollyLogger.warn(
        `Tool database browse failed: ${msg}`,
        'capability-factory'
      );
      return { tools: [], totalCount: 0 };
    }
  }
);
