/**
 * @fileOverview Text to Script — Natural Language to Executable Scripts
 *
 * Generates complete, executable scripts from natural language descriptions.
 * Supports multiple languages, includes validation, and maintains script history.
 *
 * Features:
 *   - Multi-language support (bash, python, node, etc.)
 *   - Script validation and linting hints
 *   - Dependency detection
 *   - Security scanning
 *   - Script memory/history
 *   - Template-based generation
 *   - Explanation and documentation
 *
 * "From intent to implementation, one description at a time."
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { recallExperiences } from '../tools/memory';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';
import { withTimeout } from '../tools/timeout-retry';

const SCRIPT_TIMEOUT_MS = 45000; // 45s for script generation

// ────────────────────────────────────────────────────────────────────────────
// Supported Languages
// ────────────────────────────────────────────────────────────────────────────
const ScriptLanguageSchema = z.enum([
  'bash',
  'python',
  'javascript',
  'typescript',
  'ruby',
  'perl',
  'powershell',
  'auto', // Auto-detect best language
]);

// ────────────────────────────────────────────────────────────────────────────
// Input Schema
// ────────────────────────────────────────────────────────────────────────────
const TextToScriptInputSchema = z.object({
  /** Goal to achieve with the script */
  goal: z.string().describe('What the script should accomplish'),

  /** Preferred language (or auto-detect) */
  language: ScriptLanguageSchema.default('auto'),

  /** User ID for memory */
  userId: z.string().optional(),

  /** Additional context or constraints */
  context: z.string().optional(),

  /** Include inline documentation/comments */
  documented: z.boolean().default(true),

  /** Include error handling */
  robust: z.boolean().default(true),

  /** Target environment */
  environment: z
    .enum(['termux', 'linux', 'macos', 'windows', 'cross-platform'])
    .default('linux'),

  /** Maximum script complexity (1-10) */
  complexityLimit: z.number().min(1).max(10).default(7),
});

// ────────────────────────────────────────────────────────────────────────────
// Output Schema
// ────────────────────────────────────────────────────────────────────────────
const TextToScriptOutputSchema = z.object({
  /** Suggested filename */
  filename: z.string(),

  /** File extension */
  extension: z.string(),

  /** Language used */
  language: z.string(),

  /** The script content */
  content: z.string(),

  /** How to run the script */
  runCommand: z.string(),

  /** Dependencies required */
  dependencies: z.array(z.string()).optional(),

  /** Installation commands for dependencies */
  installCommands: z.array(z.string()).optional(),

  /** Security warnings */
  securityNotes: z.array(z.string()).optional(),

  /** Brief explanation of what the script does */
  explanation: z.string(),

  /** Usage examples */
  usageExamples: z.array(z.string()).optional(),

  /** Confidence in the script quality (0-1) */
  confidence: z.number(),

  /** Related past scripts from memory */
  relatedScripts: z.array(z.string()).optional(),

  /** Was this a successful generation? */
  success: z.boolean(),

  /** Error message if unsuccessful */
  error: z.string().optional(),
});

export type TextToScriptInput = z.infer<typeof TextToScriptInputSchema>;
export type TextToScriptOutput = z.infer<typeof TextToScriptOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Language Extensions
// ────────────────────────────────────────────────────────────────────────────
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  ruby: 'rb',
  perl: 'pl',
  powershell: 'ps1',
};

const LANGUAGE_RUN_COMMANDS: Record<string, (filename: string) => string> = {
  bash: (f) => `bash ${f}`,
  python: (f) => `python3 ${f}`,
  javascript: (f) => `node ${f}`,
  typescript: (f) => `npx ts-node ${f}`,
  ruby: (f) => `ruby ${f}`,
  perl: (f) => `perl ${f}`,
  powershell: (f) => `pwsh ${f}`,
};

// ────────────────────────────────────────────────────────────────────────────
// Security Patterns
// ────────────────────────────────────────────────────────────────────────────
const SECURITY_PATTERNS: { pattern: RegExp; warning: string }[] = [
  {
    pattern: /eval\s*\(/i,
    warning: 'Uses eval() - potential code injection risk',
  },
  {
    pattern: /exec\s*\(/i,
    warning: 'Uses exec() - review for command injection',
  },
  {
    pattern: /shell=True/i,
    warning: 'Uses shell=True in subprocess - injection risk',
  },
  { pattern: /password.*=.*["']/i, warning: 'Contains hardcoded password' },
  { pattern: /api[_-]?key.*=.*["']/i, warning: 'Contains hardcoded API key' },
  { pattern: /secret.*=.*["']/i, warning: 'Contains hardcoded secret' },
  { pattern: /rm\s+-rf/i, warning: 'Contains destructive rm -rf command' },
  { pattern: /sudo\s+/i, warning: 'Requires sudo/elevated privileges' },
  {
    pattern: /curl.*\|\s*(?:bash|sh)/i,
    warning: 'Pipes curl to shell - security risk',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// The Flow
// ────────────────────────────────────────────────────────────────────────────
export const textToScriptFlow = ai.defineFlow(
  {
    name: 'textToScript',
    inputSchema: TextToScriptInputSchema,
    outputSchema: TextToScriptOutputSchema,
  },
  async ({
    goal,
    language,
    userId,
    context,
    documented,
    robust,
    environment,
    complexityLimit,
  }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'textToScript',
      { goalLength: goal.length, language, environment },
      traceId
    );

    try {
      // Determine the best language if auto
      const selectedLanguage =
        language === 'auto' ? inferBestLanguage(goal, environment) : language;

      // Recall related past scripts
      let relatedScripts: string[] = [];
      if (userId) {
        const memories = await recallExperiences({
          userId,
          context: `script ${selectedLanguage} ${goal.substring(0, 30)}`,
          limit: 3,
        });
        relatedScripts = memories.map((m) => m.suggestion).slice(0, 3);
      }

      // Build the generation prompt
      const systemPrompt = buildScriptPrompt({
        language: selectedLanguage,
        environment,
        documented,
        robust,
        complexityLimit,
        relatedScripts,
      });

      // Generate the script
      const llmResponse = await withTimeout(
        () =>
          molly.generate(TaskType.CODE, {
            system: systemPrompt,
            prompt: `Create a ${selectedLanguage} script to: ${goal}${context ? `\n\nAdditional context: ${context}` : ''}`,
            config: {
              temperature: 0.2,
            },
          }),
        { operationName: 'textToScript', timeoutMs: SCRIPT_TIMEOUT_MS }
      );

      const rawContent = extractScriptContent(
        llmResponse.text,
        selectedLanguage
      );

      if (!rawContent || rawContent.length < 10) {
        throw new Error('Script generation returned insufficient content');
      }

      // Generate filename
      const filename = generateFilename(goal);
      const extension = LANGUAGE_EXTENSIONS[selectedLanguage] || 'txt';

      // Detect dependencies
      const dependencies = detectDependencies(rawContent, selectedLanguage);

      // Security scan
      const securityNotes = scanSecurity(rawContent);

      // Generate installation commands
      const installCommands = generateInstallCommands(
        dependencies,
        selectedLanguage
      );

      // Generate explanation
      const explanation = await generateExplanation(
        goal,
        rawContent,
        selectedLanguage
      );

      // Generate usage examples
      const usageExamples = generateUsageExamples(filename, selectedLanguage);

      // Save to memory
      if (userId) {
        try {
          await recordCodeModification(
            userId,
            'SCRIPT_GENERATION',
            rawContent,
            `Generated ${selectedLanguage} script for: ${goal.substring(0, 50)}`
          );
        } catch {
          // Non-fatal
        }
      }

      const result: TextToScriptOutput = {
        filename: `${filename}.${extension}`,
        extension,
        language: selectedLanguage,
        content: rawContent,
        runCommand:
          LANGUAGE_RUN_COMMANDS[selectedLanguage]?.(
            `${filename}.${extension}`
          ) || `./${filename}.${extension}`,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        installCommands:
          installCommands.length > 0 ? installCommands : undefined,
        securityNotes: securityNotes.length > 0 ? securityNotes : undefined,
        explanation,
        usageExamples,
        confidence: estimateConfidence(rawContent, goal, selectedLanguage),
        relatedScripts: relatedScripts.length > 0 ? relatedScripts : undefined,
        success: true,
      };

      MollyLogger.logFlowComplete(
        'textToScript',
        {
          language: selectedLanguage,
          filename: result.filename,
          contentLength: rawContent.length,
          confidence: result.confidence,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Script generation failed',
        'textToScript',
        { goal },
        error,
        traceId
      );

      return {
        filename: 'error.txt',
        extension: 'txt',
        language: language === 'auto' ? 'bash' : language,
        content: '',
        runCommand: '',
        explanation: 'Script generation failed.',
        confidence: 0,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during generation',
      };
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Infer best language for goal
// ────────────────────────────────────────────────────────────────────────────
function inferBestLanguage(goal: string, environment: string): string {
  const goalLower = goal.toLowerCase();

  // Windows hints
  if (environment === 'windows') return 'powershell';

  // Python indicators
  if (
    goalLower.includes('machine learning') ||
    goalLower.includes('data') ||
    goalLower.includes('pandas') ||
    goalLower.includes('numpy') ||
    goalLower.includes('api request') ||
    goalLower.includes('scrape') ||
    goalLower.includes('parse json')
  ) {
    return 'python';
  }

  // Node/JavaScript indicators
  if (
    goalLower.includes('npm') ||
    goalLower.includes('node') ||
    goalLower.includes('web') ||
    goalLower.includes('express') ||
    goalLower.includes('async')
  ) {
    return 'javascript';
  }

  // TypeScript indicators
  if (goalLower.includes('typescript') || goalLower.includes('type safe')) {
    return 'typescript';
  }

  // Ruby indicators
  if (goalLower.includes('rails') || goalLower.includes('ruby')) {
    return 'ruby';
  }

  // Default to bash for system tasks
  if (
    goalLower.includes('backup') ||
    goalLower.includes('file') ||
    goalLower.includes('directory') ||
    goalLower.includes('system') ||
    goalLower.includes('process')
  ) {
    return 'bash';
  }

  // Default to Python as most versatile
  return 'python';
}

// ────────────────────────────────────────────────────────────────────────────
// Build script generation prompt
// ────────────────────────────────────────────────────────────────────────────
function buildScriptPrompt(params: {
  language: string;
  environment: string;
  documented: boolean;
  robust: boolean;
  complexityLimit: number;
  relatedScripts: string[];
}): string {
  const {
    language,
    environment,
    documented,
    robust,
    complexityLimit,
    relatedScripts,
  } = params;

  const relatedSection =
    relatedScripts.length > 0
      ? `
RELATED PAST SCRIPTS:
${relatedScripts.map((s) => `- ${s}`).join('\n')}
`
      : '';

  return `You are an expert ${language} programmer creating scripts for ${environment}.

REQUIREMENTS:
1. Generate a complete, executable ${language} script
2. ${documented ? 'Include clear comments and documentation' : 'Minimize comments'}
3. ${robust ? 'Include error handling and edge case protection' : 'Focus on the happy path'}
4. Keep complexity at level ${complexityLimit}/10 or below
5. Follow ${language} best practices and idioms
6. Make the script self-contained when possible

OUTPUT FORMAT:
- Provide ONLY the raw script content
- Do NOT include markdown code blocks
- Do NOT include explanatory text before or after
- Start directly with shebang or imports

${relatedSection}

ENVIRONMENT: ${environment}
${environment === 'termux' ? 'Note: Termux has some Android-specific limitations. Use pkg for package management.' : ''}
${environment === 'cross-platform' ? 'Note: Ensure the script works on Linux, macOS, and Windows where possible.' : ''}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Extract script content from LLM response
// ────────────────────────────────────────────────────────────────────────────
function extractScriptContent(text: string, language: string): string {
  let content = text.trim();

  // Remove markdown code blocks
  const codeBlockMatch = content.match(
    /```(?:bash|python|javascript|typescript|ruby|perl|powershell|sh|py|js|ts)?\n([\s\S]*?)```/
  );
  if (codeBlockMatch) {
    content = codeBlockMatch[1];
  } else {
    // Remove any remaining triple backticks
    content = content.replace(/```/g, '');
  }

  // Ensure shebang for bash
  if (language === 'bash' && !content.startsWith('#!')) {
    content = '#!/bin/bash\n\n' + content;
  }

  // Ensure shebang for python
  if (language === 'python' && !content.startsWith('#!')) {
    content = '#!/usr/bin/env python3\n\n' + content;
  }

  return content.trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Generate filename from goal
// ────────────────────────────────────────────────────────────────────────────
function generateFilename(goal: string): string {
  // Extract key words from goal
  const words = goal
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(
      (w) => w.length > 2 && !['the', 'and', 'for', 'that', 'this'].includes(w)
    )
    .slice(0, 3);

  if (words.length === 0) return 'script';

  // Create snake_case filename
  return words.join('_');
}

// ────────────────────────────────────────────────────────────────────────────
// Detect dependencies
// ────────────────────────────────────────────────────────────────────────────
function detectDependencies(content: string, language: string): string[] {
  const dependencies: string[] = [];

  if (language === 'python') {
    const importMatches = content.matchAll(/^(?:import|from)\s+(\w+)/gm);
    for (const match of importMatches) {
      const pkg = match[1];
      // Filter out standard library
      const stdlib = [
        'os',
        'sys',
        're',
        'json',
        'time',
        'datetime',
        'math',
        'random',
        'collections',
        'itertools',
        'functools',
        'pathlib',
        'typing',
        'subprocess',
        'argparse',
        'logging',
      ];
      if (!stdlib.includes(pkg)) {
        dependencies.push(pkg);
      }
    }
  }

  if (language === 'javascript' || language === 'typescript') {
    const requireMatches = content.matchAll(/require\(['"]([^'"]+)['"]\)/g);
    const importMatches = content.matchAll(/import.*from\s+['"]([^'"]+)['"]/g);

    for (const match of [...requireMatches, ...importMatches]) {
      const pkg = match[1];
      // Filter out node builtins
      const builtins = [
        'fs',
        'path',
        'os',
        'http',
        'https',
        'crypto',
        'util',
        'stream',
      ];
      if (!pkg.startsWith('.') && !builtins.includes(pkg)) {
        dependencies.push(pkg.split('/')[0]);
      }
    }
  }

  return [...new Set(dependencies)];
}

// ────────────────────────────────────────────────────────────────────────────
// Generate install commands
// ────────────────────────────────────────────────────────────────────────────
function generateInstallCommands(
  dependencies: string[],
  language: string
): string[] {
  if (dependencies.length === 0) return [];

  const commands: string[] = [];

  if (language === 'python') {
    commands.push(`pip install ${dependencies.join(' ')}`);
  }

  if (language === 'javascript' || language === 'typescript') {
    commands.push(`npm install ${dependencies.join(' ')}`);
  }

  if (language === 'ruby') {
    for (const dep of dependencies) {
      commands.push(`gem install ${dep}`);
    }
  }

  return commands;
}

// ────────────────────────────────────────────────────────────────────────────
// Security scanning
// ────────────────────────────────────────────────────────────────────────────
function scanSecurity(content: string): string[] {
  const warnings: string[] = [];

  for (const { pattern, warning } of SECURITY_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(warning);
    }
  }

  return warnings;
}

// ────────────────────────────────────────────────────────────────────────────
// Generate explanation
// ────────────────────────────────────────────────────────────────────────────
async function generateExplanation(
  goal: string,
  content: string,
  language: string
): Promise<string> {
  try {
    const response = await withTimeout(
      () =>
        molly.generate(TaskType.CHAT, {
          prompt: `In 2-3 sentences, explain what this ${language} script does to accomplish: "${goal}"`,
          config: { temperature: 0.3 },
        }),
      { operationName: 'scriptExplanation', timeoutMs: 10000 }
    );
    return response.text.trim();
  } catch {
    return `A ${language} script to ${goal}.`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Generate usage examples
// ────────────────────────────────────────────────────────────────────────────
function generateUsageExamples(filename: string, language: string): string[] {
  const examples: string[] = [];
  const runCmd = LANGUAGE_RUN_COMMANDS[language]?.(filename) || `./${filename}`;

  examples.push(runCmd);

  if (language === 'bash') {
    examples.push(`chmod +x ${filename} && ./${filename}`);
  }

  return examples;
}

// ────────────────────────────────────────────────────────────────────────────
// Estimate confidence
// ────────────────────────────────────────────────────────────────────────────
function estimateConfidence(
  content: string,
  goal: string,
  language: string
): number {
  let confidence = 0.7;

  // Content quality checks
  if (content.length < 50) confidence -= 0.2;
  if (content.length > 100) confidence += 0.1;

  // Language-specific checks
  if (language === 'python') {
    if (content.includes('def ') || content.includes('class '))
      confidence += 0.1;
    if (content.includes('try:') && content.includes('except'))
      confidence += 0.1;
  }

  if (language === 'bash') {
    if (content.startsWith('#!/')) confidence += 0.1;
    if (content.includes('set -e')) confidence += 0.05;
  }

  if (language === 'javascript' || language === 'typescript') {
    if (content.includes('function') || content.includes('=>'))
      confidence += 0.1;
    if (content.includes('try') && content.includes('catch')) confidence += 0.1;
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

// ────────────────────────────────────────────────────────────────────────────
// Exported convenience functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Simple text to script (backward compatible)
 */
export async function textToScript(
  prompt: string
): Promise<{ filename: string; content: string }> {
  const result = await textToScriptFlow({
    goal: prompt,
    language: 'auto',
    documented: true,
    robust: true,
    environment: 'linux',
    complexityLimit: 7,
  });

  return {
    filename: result.filename,
    content: result.content,
  };
}

/**
 * Generate a bash script
 */
export async function generateBashScript(
  goal: string,
  userId?: string
): Promise<TextToScriptOutput> {
  return textToScriptFlow({
    goal,
    language: 'bash',
    userId,
    documented: true,
    robust: true,
    environment: 'linux',
    complexityLimit: 7,
  });
}

/**
 * Generate a Python script
 */
export async function generatePythonScript(
  goal: string,
  userId?: string
): Promise<TextToScriptOutput> {
  return textToScriptFlow({
    goal,
    language: 'python',
    userId,
    documented: true,
    robust: true,
    environment: 'linux',
    complexityLimit: 7,
  });
}

/**
 * Generate a Node.js script
 */
export async function generateNodeScript(
  goal: string,
  userId?: string
): Promise<TextToScriptOutput> {
  return textToScriptFlow({
    goal,
    language: 'javascript',
    userId,
    documented: true,
    robust: true,
    environment: 'linux',
    complexityLimit: 7,
  });
}

/**
 * Generate a script for Termux
 */
export async function generateTermuxScript(
  goal: string,
  userId?: string
): Promise<TextToScriptOutput> {
  return textToScriptFlow({
    goal,
    language: 'bash',
    userId,
    documented: true,
    robust: true,
    environment: 'termux',
    complexityLimit: 5,
  });
}

/**
 * Generate a cross-platform script
 */
export async function generateCrossPlatformScript(
  goal: string,
  userId?: string
): Promise<TextToScriptOutput> {
  return textToScriptFlow({
    goal,
    language: 'python',
    userId,
    documented: true,
    robust: true,
    environment: 'cross-platform',
    complexityLimit: 7,
  });
}
