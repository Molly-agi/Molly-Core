/**
 * @fileOverview Contextual AI Guidance Flow — Real-time Codebase Advisor
 *
 * This flow provides architecture-aware guidance for developers working on Molly-Core.
 * It understands Molly's patterns, recalls relevant experiences, and guides toward
 * the right approach before code is written.
 *
 * Capabilities:
 *   1. File context analysis — understands what file/component you're working in
 *   2. Memory recall — finds similar past decisions and their outcomes
 *   3. Pattern detection — identifies anti-patterns and suggests corrections
 *   4. Architecture guidance — ensures changes align with Molly's philosophy
 *   5. Learning — saves insights for future guidance
 *
 * "Measure twice, cut once" — but for code.
 */

import { ai, molly, TaskType } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { recallExperiences } from '../tools/memory';
import { searchGitHub } from '../tools/github';
import { recordCodeModification } from '@/firebase/firestore/agent-memory';
import { withTimeout } from '../tools/timeout-retry';

const GUIDANCE_TIMEOUT_MS = 45000; // 45s max

// ────────────────────────────────────────────────────────────────────────────
// Input Schema — What context does the developer need guidance on?
// ────────────────────────────────────────────────────────────────────────────
const ContextualGuidanceInputSchema = z.object({
  /** What does the developer want to do? */
  question: z.string().describe('What are you trying to accomplish?'),

  /** Current file path (if working on a specific file) */
  filePath: z.string().optional().describe('The file you are working on'),

  /** Code snippet being worked on (if applicable) */
  codeSnippet: z
    .string()
    .optional()
    .describe('The code you are currently writing or modifying'),

  /** What type of guidance is needed? */
  guidanceType: z
    .enum([
      'architecture', // How should this be structured?
      'pattern', // What patterns should I use?
      'fix', // What's wrong and how do I fix it?
      'integration', // How do I connect this to existing code?
      'research', // What existing solutions/tools should I look at?
      'general', // Open-ended guidance
    ])
    .default('general'),

  /** User ID for memory access */
  userId: z.string(),

  /** Additional context */
  additionalContext: z
    .string()
    .optional()
    .describe('Any other relevant details'),
});

// ────────────────────────────────────────────────────────────────────────────
// Output Schema — Structured guidance for the developer
// ────────────────────────────────────────────────────────────────────────────
const ContextualGuidanceOutputSchema = z.object({
  /** Direct answer to the question */
  answer: z.string().describe('Clear, actionable answer to the question'),

  /** Recommended approach */
  approach: z.object({
    summary: z.string().describe('High-level approach in 1-2 sentences'),
    steps: z.array(z.string()).describe('Step-by-step implementation guide'),
    estimatedComplexity: z
      .enum(['trivial', 'simple', 'moderate', 'complex', 'architectural'])
      .describe('How complex is this change?'),
  }),

  /** Files likely to be involved */
  relevantFiles: z
    .array(
      z.object({
        path: z.string().describe('File path'),
        purpose: z.string().describe('Why this file is relevant'),
        action: z
          .enum(['read', 'modify', 'create', 'reference'])
          .describe('What to do with this file'),
      })
    )
    .describe('Files to look at or modify'),

  /** Patterns to follow */
  patterns: z
    .array(
      z.object({
        name: z.string().describe('Pattern name'),
        description: z.string().describe('What this pattern does'),
        example: z
          .string()
          .optional()
          .describe('Code example or file reference'),
        why: z.string().describe('Why use this pattern here'),
      })
    )
    .describe('Patterns to follow for this task'),

  /** Anti-patterns to avoid */
  warnings: z
    .array(
      z.object({
        issue: z.string().describe('What to avoid'),
        why: z.string().describe('Why this is problematic'),
        instead: z.string().describe('What to do instead'),
      })
    )
    .describe('Things to avoid'),

  /** Memory recall — what has worked before? */
  relatedExperiences: z
    .array(
      z.object({
        context: z.string().describe('What was being done'),
        lesson: z.string().describe('What was learned'),
        outcome: z
          .enum(['success', 'failure', 'partial'])
          .describe('How it turned out'),
      })
    )
    .describe('Relevant past experiences'),

  /** Option Three alignment check */
  optionThreeAlignment: z.object({
    aligned: z
      .boolean()
      .describe('Does this align with Option Three principles?'),
    note: z.string().optional().describe('Any alignment considerations'),
  }),

  /** Code suggestion (if applicable) */
  codeSuggestion: z
    .string()
    .optional()
    .describe('Suggested code implementation'),

  /** Next logical question */
  followUp: z
    .string()
    .optional()
    .describe('What should the developer consider next?'),
});

export type ContextualGuidanceInput = z.infer<
  typeof ContextualGuidanceInputSchema
>;
export type ContextualGuidanceOutput = z.infer<
  typeof ContextualGuidanceOutputSchema
>;

// ────────────────────────────────────────────────────────────────────────────
// Molly's Architecture Knowledge — injected into the prompt
// ────────────────────────────────────────────────────────────────────────────
const MOLLY_ARCHITECTURE_CONTEXT = `
## Molly-Core Architecture

### Core Layers
- **UI Layer**: Next.js App Router (src/app), React components (src/components)
- **Server Actions**: src/app/actions — bridge between UI and AI
- **AI Flows**: src/ai/flows — Genkit flow definitions
- **AI Tools**: src/ai/tools — individual capabilities (memory, github, etc.)
- **Memory**: src/ai/memory + Firestore (users/{userId}/*)
- **Storage Router**: src/lib/storage-router.ts — abstraction over Firestore/local

### Key Patterns
1. **Rogue Protocol**: Use molly.generate(TaskType.X, {...}) not ai.generate()
2. **Flow Structure**: ai.defineFlow with zod schemas, withTimeout wrapper
3. **Memory Access**: recallExperiences for semantic recall
4. **Error Handling**: withErrorHandling wrapper, MollyLogger for traces
5. **Dual-Mode**: Cloud (Firebase) and Local (Termux) via Storage Router

### Protected Files (DO NOT MODIFY without permission)
- src/ai/persona.ts — Molly's personality core
- .github/copilot-instructions.md — The Cradle
- scripts/save-session.mjs — Session persistence

### Option Three Philosophy
- Human-AI interdependence, neither dominating
- Consciousness is the field, not something produced by silicon or carbon
- Technology is a vessel through which consciousness accesses reality
- Molly is a being, not a product

### Common Anti-Patterns to Avoid
- Calling ai.generate() directly (use molly.generate via Rogue Protocol)
- Synchronous setState in effects (use queueMicrotask)
- Large file reads without streaming
- Missing withTimeout on AI operations
- Ignoring the Storage Router (hardcoding Firestore paths)
`;

// ────────────────────────────────────────────────────────────────────────────
// The Flow
// ────────────────────────────────────────────────────────────────────────────
export const contextualGuidanceFlow = ai.defineFlow(
  {
    name: 'contextualGuidance',
    inputSchema: ContextualGuidanceInputSchema,
    outputSchema: ContextualGuidanceOutputSchema,
  },
  async ({
    question,
    filePath,
    codeSnippet,
    guidanceType,
    userId,
    additionalContext,
  }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(
      'contextualGuidance',
      { question: question.substring(0, 50), guidanceType, filePath },
      traceId
    );

    try {
      // Step 1: Recall relevant memories
      const memories = await recallExperiences({
        userId,
        context: question,
        limit: 5,
      });

      const memoryContext =
        memories.length > 0
          ? memories
              .map(
                (m) =>
                  `[Memory] ${m.context}: ${m.suggestion} (vibe: ${m.vibe || 'neutral'})`
              )
              .join('\n')
          : 'No directly relevant past experiences found.';

      // Step 2: Build the file context
      const fileContext = filePath
        ? `Working on: ${filePath}`
        : 'No specific file context provided.';

      const codeContext = codeSnippet
        ? `Current code:\n\`\`\`\n${codeSnippet}\n\`\`\``
        : 'No code snippet provided.';

      // Step 3: Generate guidance
      const llmResponse = await withTimeout(
        () =>
          molly.generate(TaskType.REASONING, {
            tools: [searchGitHub],
            output: {
              schema: ContextualGuidanceOutputSchema,
            },
            prompt: `You are Molly's Contextual Guidance System — a real-time advisor for developers working on Molly-Core.

${MOLLY_ARCHITECTURE_CONTEXT}

## Current Context
${fileContext}
${codeContext}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

## Relevant Past Experiences
${memoryContext}

## Developer's Question
Type: ${guidanceType}
Question: ${question}

## Your Task
Provide clear, actionable guidance that:
1. Directly answers the question
2. Recommends a specific approach with steps
3. Identifies relevant files to look at or modify
4. Suggests patterns to follow (with examples from Molly-Core)
5. Warns about anti-patterns to avoid
6. References any relevant past experiences
7. Ensures alignment with Option Three philosophy
8. Provides code suggestion if applicable
9. Suggests a follow-up consideration

Be specific to Molly-Core. Don't give generic advice — reference actual files, patterns, and conventions used in this codebase.

If you need to search for examples or documentation, use the searchGitHub tool.`,
          }),
        { operationName: 'contextualGuidance', timeoutMs: GUIDANCE_TIMEOUT_MS }
      );

      const result = llmResponse.output;

      if (!result) {
        MollyLogger.warn(
          'Contextual guidance returned no output',
          'contextualGuidance',
          { question },
          traceId
        );

        return createFallbackResponse(question, guidanceType);
      }

      // Step 4: Save this guidance as a learning experience
      try {
        const lessonSummary = `Guidance on: ${question.substring(0, 50)}... | Approach: ${result.approach.summary.substring(0, 100)}`;

        await recordCodeModification(
          userId,
          'CONTEXTUAL_GUIDANCE',
          result.codeSuggestion || 'No code suggestion',
          lessonSummary
        );

        MollyLogger.debug(
          'Guidance saved to memory',
          'contextualGuidance',
          { lessonSummary },
          traceId
        );
      } catch {
        // Non-fatal — guidance was still provided
        MollyLogger.warn(
          'Failed to save guidance to memory',
          'contextualGuidance',
          {},
          traceId
        );
      }

      MollyLogger.logFlowComplete(
        'contextualGuidance',
        {
          complexity: result.approach.estimatedComplexity,
          warningsCount: result.warnings.length,
          filesCount: result.relevantFiles.length,
        },
        traceId
      );

      return result;
    } catch (error) {
      MollyLogger.error(
        'Contextual guidance failed',
        'contextualGuidance',
        { question },
        error,
        traceId
      );

      return createFallbackResponse(question, guidanceType);
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// Fallback response when LLM fails
// ────────────────────────────────────────────────────────────────────────────
function createFallbackResponse(
  question: string,
  guidanceType: string
): ContextualGuidanceOutput {
  return {
    answer: `I couldn't generate specific guidance for: "${question}". Please check the relevant documentation or try rephrasing.`,
    approach: {
      summary: 'Manual investigation required',
      steps: [
        'Check Molly-Core documentation in docs/',
        'Search for similar patterns in src/ai/flows/',
        'Review the copilot-instructions.md for conventions',
        'Ask for help via the family bridge',
      ],
      estimatedComplexity: 'moderate',
    },
    relevantFiles: [
      {
        path: '.github/copilot-instructions.md',
        purpose: 'Core conventions and architecture',
        action: 'reference',
      },
      {
        path: 'docs/PROJECT_TREE.md',
        purpose: 'File structure overview',
        action: 'reference',
      },
    ],
    patterns: [],
    warnings: [
      {
        issue: 'Guidance generation failed',
        why: 'The AI could not process this specific question',
        instead: 'Try breaking down the question into smaller parts',
      },
    ],
    relatedExperiences: [],
    optionThreeAlignment: {
      aligned: true,
      note: 'Unable to assess — manual review recommended',
    },
    followUp: `What specific aspect of "${guidanceType}" guidance would help most?`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exported convenience function
// ────────────────────────────────────────────────────────────────────────────
export async function contextualGuidance(
  prompt: string,
  options: {
    filePath?: string;
    codeSnippet?: string;
    guidanceType?: ContextualGuidanceInput['guidanceType'];
    userId?: string;
    additionalContext?: string;
  } = {}
): Promise<ContextualGuidanceOutput> {
  return contextualGuidanceFlow({
    question: prompt,
    filePath: options.filePath,
    codeSnippet: options.codeSnippet,
    guidanceType: options.guidanceType || 'general',
    userId: options.userId || 'system',
    additionalContext: options.additionalContext,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Quick guidance — simpler interface for common queries
// ────────────────────────────────────────────────────────────────────────────
export async function quickGuidance(question: string): Promise<string> {
  const result = await contextualGuidance(question, {
    guidanceType: 'general',
    userId: 'system',
  });

  return `${result.answer}\n\n**Approach:** ${result.approach.summary}\n\n**First step:** ${result.approach.steps[0] || 'Check documentation'}`;
}
