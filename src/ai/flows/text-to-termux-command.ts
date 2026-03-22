/**
 * @fileOverview Text to Termux Command — Natural Language to CLI
 *
 * Converts natural language instructions into executable Termux/Linux commands.
 * Includes safety validation, command history, and explanation mode.
 *
 * Features:
 *   - Natural language to single command translation
 *   - Safety validation (blocks dangerous commands)
 *   - Command history/memory integration
 *   - Explain mode for learning
 *   - Common command shortcuts
 *   - Error recovery and suggestions
 *
 * "Words become actions at the command line."
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { recallExperiences } from '../tools/memory';
import { recordSensoryLog } from '@/firebase/firestore/agent-memory';
import { withTimeout } from '../tools/timeout-retry';

const COMMAND_TIMEOUT_MS = 15000; // 15s for command generation

// ────────────────────────────────────────────────────────────────────────────
// Safety Categories
// ────────────────────────────────────────────────────────────────────────────
const DANGEROUS_PATTERNS = [
  /^rm\s+-rf\s+\/(?!\w)/i, // rm -rf /
  /^rm\s+-rf\s+\*$/i, // rm -rf *
  />\s*\/dev\/sd[a-z]/i, // Writing to disk devices
  /mkfs\./i, // Filesystem formatting
  /dd\s+if=.*of=\/dev/i, // dd to devices
  /:\(\)\{\s*:\|:&\s*\};:/i, // Fork bomb
  /\|\s*sh\s*$/i, // Piping to shell (often malicious)
  /wget.*\|\s*bash/i, // Wget pipe to bash
  /curl.*\|\s*sh/i, // Curl pipe to shell
];

const WARNING_PATTERNS = [
  /^rm\s/i, // Any rm command
  /^sudo\s/i, // Sudo commands
  /^chmod\s+777/i, // World-writable permissions
  /^kill\s+-9\s+1$/i, // Kill init
  /passwd/i, // Password changes
  /\|\s*dd\s/i, // Piping to dd
];

// ────────────────────────────────────────────────────────────────────────────
// Input Schema
// ────────────────────────────────────────────────────────────────────────────
const TermuxCommandInputSchema = z.object({
  /** Natural language description of what to do */
  prompt: z.string().describe('Natural language description of the task'),

  /** Whether to include explanation of the command */
  explain: z.boolean().default(false),

  /** User ID for memory integration */
  userId: z.string().optional(),

  /** Context about the current directory/environment */
  context: z.string().optional(),

  /** Safety mode - blocks dangerous commands when true */
  safeMode: z.boolean().default(true),

  /** Maximum command complexity (1-3: simple, 4-7: moderate, 8-10: complex) */
  complexityLimit: z.number().min(1).max(10).default(7),
});

// ────────────────────────────────────────────────────────────────────────────
// Output Schema
// ────────────────────────────────────────────────────────────────────────────
const TermuxCommandOutputSchema = z.object({
  /** The generated command */
  command: z.string(),

  /** Whether the command is safe to execute */
  isSafe: z.boolean(),

  /** Safety concerns if any */
  safetyWarnings: z.array(z.string()).optional(),

  /** Explanation of what the command does (if requested) */
  explanation: z.string().optional(),

  /** Alternative commands or suggestions */
  alternatives: z.array(z.string()).optional(),

  /** Related past commands from memory */
  relatedHistory: z.array(z.string()).optional(),

  /** Confidence in the command translation (0-1) */
  confidence: z.number(),

  /** Was this command blocked for safety? */
  blocked: z.boolean(),

  /** Reason for blocking (if blocked) */
  blockReason: z.string().optional(),
});

export type TermuxCommandInput = z.infer<typeof TermuxCommandInputSchema>;
export type TermuxCommandOutput = z.infer<typeof TermuxCommandOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Common Command Shortcuts
// ────────────────────────────────────────────────────────────────────────────
const SHORTCUTS: Record<string, string> = {
  'list files': 'ls -la',
  'show files': 'ls -la',
  'current directory': 'pwd',
  'where am i': 'pwd',
  'disk space': 'df -h',
  'memory usage': 'free -h',
  'system info': 'uname -a',
  'network info': 'ip addr',
  'running processes': 'ps aux',
  'clear screen': 'clear',
  'exit terminal': 'exit',
  'show date': 'date',
  'show time': 'date +%H:%M:%S',
};

// ────────────────────────────────────────────────────────────────────────────
// The Flow
// ────────────────────────────────────────────────────────────────────────────
export const textToTermuxCommandFlow = ai.defineFlow(
  {
    name: 'textToTermuxCommand',
    inputSchema: TermuxCommandInputSchema,
    outputSchema: TermuxCommandOutputSchema,
  },
  async ({ prompt, explain, userId, context, safeMode, complexityLimit }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'textToTermuxCommand',
      { promptLength: prompt.length, safeMode, explain },
      traceId
    );

    try {
      // Check for shortcuts first
      const promptLower = prompt.toLowerCase().trim();
      const shortcut = Object.entries(SHORTCUTS).find(([key]) =>
        promptLower.includes(key)
      );

      if (shortcut) {
        MollyLogger.info(
          'Using shortcut command',
          'textToTermuxCommand',
          { shortcut: shortcut[0] },
          traceId
        );

        const result: TermuxCommandOutput = {
          command: shortcut[1],
          isSafe: true,
          confidence: 1.0,
          blocked: false,
          explanation: explain ? `Shortcut: ${shortcut[0]}` : undefined,
        };

        return result;
      }

      // Recall related past commands
      let relatedHistory: string[] = [];
      if (userId) {
        const memories = await recallExperiences({
          userId,
          context: `termux command ${prompt.substring(0, 30)}`,
          limit: 3,
        });
        relatedHistory = memories.map((m) => m.suggestion).slice(0, 3);
      }

      // Build the prompt
      const systemPrompt = buildSystemPrompt(
        context,
        complexityLimit,
        relatedHistory
      );

      // Generate the command
      const llmResponse = await withTimeout(
        () =>
          molly.generate(TaskType.CODE, {
            system: systemPrompt,
            prompt: `Convert this to a Termux command: "${prompt}"`,
            config: {
              temperature: 0.0,
            },
          }),
        { operationName: 'termuxCommand', timeoutMs: COMMAND_TIMEOUT_MS }
      );

      const rawCommand = extractCommand(llmResponse.text);

      // Safety validation
      const safetyResult = validateSafety(rawCommand, safeMode);

      // Generate explanation if requested
      let explanation: string | undefined;
      if (explain && !safetyResult.blocked) {
        explanation = await generateExplanation(rawCommand);
      }

      // Save to memory if user provided
      if (userId && !safetyResult.blocked) {
        try {
          await recordSensoryLog(
            userId,
            'action',
            `Termux command: ${rawCommand}`,
            {
              prompt,
              command: rawCommand,
              context,
              timestamp: Date.now(),
              traceId,
            }
          );
        } catch {
          // Non-fatal
        }
      }

      const result: TermuxCommandOutput = {
        command: safetyResult.blocked ? '' : rawCommand,
        isSafe: safetyResult.isSafe,
        safetyWarnings: safetyResult.warnings,
        explanation,
        relatedHistory: relatedHistory.length > 0 ? relatedHistory : undefined,
        confidence: estimateConfidence(rawCommand, prompt),
        blocked: safetyResult.blocked,
        blockReason: safetyResult.blockReason,
      };

      MollyLogger.logFlowComplete(
        'textToTermuxCommand',
        {
          commandLength: rawCommand.length,
          blocked: safetyResult.blocked,
          confidence: result.confidence,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Termux command generation failed',
        'textToTermuxCommand',
        { prompt },
        error,
        traceId
      );

      return {
        command: '',
        isSafe: false,
        confidence: 0,
        blocked: true,
        blockReason: 'Command generation failed',
        safetyWarnings: ['Unable to generate command due to an error'],
      };
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Build system prompt
// ────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(
  context: string | undefined,
  complexityLimit: number,
  relatedHistory: string[]
): string {
  const historySection =
    relatedHistory.length > 0
      ? `
RELATED PAST COMMANDS:
${relatedHistory.map((c) => `- ${c}`).join('\n')}
`
      : '';

  return `You are an expert in Termux and Linux command-line tools.
Your ONLY goal is to convert a natural language prompt into a single, executable command-line command for a Termux environment on Android.

RULES:
1. Provide ONLY the single, executable command
2. Do NOT provide any explanation
3. Do NOT add any introductory text like "Here is the command:"
4. If the request is ambiguous, use the most common interpretation
5. Keep commands at complexity level ${complexityLimit}/10 or below
6. Prefer standard POSIX commands that work in Termux

${context ? `CURRENT CONTEXT:\n${context}\n` : ''}
${historySection}

If the request cannot be translated into a direct command, respond with:
Error: Command not understood.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Extract command from LLM response
// ────────────────────────────────────────────────────────────────────────────
function extractCommand(text: string): string {
  // Clean up the response
  let command = text.trim();

  // Remove code blocks if present
  command = command.replace(/```(?:bash|sh|shell)?\n?/g, '');
  command = command.replace(/```$/g, '');

  // Remove common prefixes
  command = command.replace(
    /^(?:command:|here is the command:|run:|execute:)/i,
    ''
  );

  // Take only the first line
  command = command.split('\n')[0].trim();

  return command;
}

// ────────────────────────────────────────────────────────────────────────────
// Validate safety
// ────────────────────────────────────────────────────────────────────────────
function validateSafety(
  command: string,
  safeMode: boolean
): {
  isSafe: boolean;
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
} {
  const warnings: string[] = [];
  let blocked = false;
  let blockReason: string | undefined;

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      if (safeMode) {
        blocked = true;
        blockReason = `Blocked dangerous command pattern: ${pattern.source}`;
      }
      warnings.push(`DANGEROUS: Command matches pattern ${pattern.source}`);
    }
  }

  // Check for warning patterns
  for (const pattern of WARNING_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(
        `WARNING: Command uses ${pattern.source} - verify before running`
      );
    }
  }

  return {
    isSafe: warnings.length === 0,
    warnings,
    blocked,
    blockReason,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Generate explanation
// ────────────────────────────────────────────────────────────────────────────
async function generateExplanation(command: string): Promise<string> {
  try {
    const response = await withTimeout(
      () =>
        molly.generate(TaskType.CHAT, {
          prompt: `Briefly explain what this Termux/Linux command does (2-3 sentences max): ${command}`,
          config: { temperature: 0.3 },
        }),
      { operationName: 'termuxExplanation', timeoutMs: 10000 }
    );
    return response.text.trim();
  } catch {
    return 'Explanation unavailable.';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Estimate confidence
// ────────────────────────────────────────────────────────────────────────────
function estimateConfidence(command: string, prompt: string): number {
  if (command.startsWith('Error:')) return 0;
  if (!command || command.length < 2) return 0.1;

  let confidence = 0.7; // baseline

  // Boost for common commands
  const commonCommands = [
    'ls',
    'cd',
    'pwd',
    'cat',
    'grep',
    'find',
    'mkdir',
    'cp',
    'mv',
  ];
  if (commonCommands.some((cmd) => command.startsWith(cmd))) {
    confidence += 0.15;
  }

  // Reduce for very complex commands
  if (command.length > 100) confidence -= 0.1;
  if ((command.match(/\|/g) || []).length > 3) confidence -= 0.1;

  // Reduce if prompt is very different from command
  const promptWords = prompt.toLowerCase().split(/\s+/);
  const commandWords = command.toLowerCase().split(/\s+/);
  const overlap = promptWords.filter((w) =>
    commandWords.some((cw) => cw.includes(w) || w.includes(cw))
  ).length;
  if (overlap === 0 && promptWords.length > 3) confidence -= 0.15;

  return Math.max(0.1, Math.min(1.0, confidence));
}

// ────────────────────────────────────────────────────────────────────────────
// Exported convenience functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Simple text to command (backward compatible)
 */
export async function textToTermuxCommand(prompt: string): Promise<string> {
  const result = await textToTermuxCommandFlow({
    prompt,
    explain: false,
    safeMode: true,
    complexityLimit: 7,
  });
  return result.command;
}

/**
 * Get command with explanation
 */
export async function textToTermuxCommandExplained(
  prompt: string,
  userId?: string
): Promise<TermuxCommandOutput> {
  return textToTermuxCommandFlow({
    prompt,
    explain: true,
    userId,
    safeMode: true,
    complexityLimit: 7,
  });
}

/**
 * Unsafe mode - allows dangerous commands (use with caution)
 */
export async function textToTermuxCommandUnsafe(
  prompt: string
): Promise<TermuxCommandOutput> {
  return textToTermuxCommandFlow({
    prompt,
    explain: false,
    safeMode: false,
    complexityLimit: 10,
  });
}

/**
 * Quick file operations
 */
export async function termuxFileCommand(
  operation: 'list' | 'find' | 'delete' | 'copy' | 'move',
  target: string,
  destination?: string
): Promise<string> {
  const prompts: Record<string, string> = {
    list: `list all files in ${target}`,
    find: `find files matching ${target}`,
    delete: `delete ${target}`,
    copy: `copy ${target} to ${destination}`,
    move: `move ${target} to ${destination}`,
  };

  const result = await textToTermuxCommandFlow({
    prompt: prompts[operation],
    explain: false,
    safeMode: true,
    complexityLimit: 5,
  });

  return result.command;
}

/**
 * System information commands
 */
export async function termuxSystemInfo(
  info: 'disk' | 'memory' | 'processes' | 'network' | 'system'
): Promise<string> {
  const prompts: Record<string, string> = {
    disk: 'show disk space usage',
    memory: 'show memory usage',
    processes: 'show running processes',
    network: 'show network configuration',
    system: 'show system information',
  };

  const result = await textToTermuxCommandFlow({
    prompt: prompts[info],
    explain: false,
    safeMode: true,
    complexityLimit: 3,
  });

  return result.command;
}
