/**
 * @fileOverview Deep Research Flow — Molly's Research Interface
 *
 * Genkit flow wrapper for the Deep Research client.
 * Makes research accessible through the standard flow system.
 */

import { ai } from '../../genkit-core';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../../logger';
import { getDeepResearchClient } from './client';

// ============================================================
// FLOW SCHEMAS
// ============================================================

const DeepResearchInputSchema = z.object({
  /** Research query or question */
  query: z.string().min(1),
  /** Whether to wait for completion (default: true) */
  waitForCompletion: z.boolean().optional().default(true),
  /** Session ID for grouping related research */
  sessionId: z.string().optional(),
});

const DeepResearchOutputSchema = z.object({
  /** Whether research completed successfully */
  success: z.boolean(),
  /** Research result text */
  result: z.string().optional(),
  /** Interaction ID (for polling if not waiting) */
  interactionId: z.string(),
  /** Session ID */
  sessionId: z.string(),
  /** Status of the research */
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  /** Number of sources consulted */
  sourcesConsulted: z.number().optional(),
  /** Citation URLs */
  citations: z.array(z.string()).optional(),
  /** Thinking summary (if enabled) */
  thinkingSummary: z.string().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Duration in ms */
  durationMs: z.number().optional(),
});

// ============================================================
// DEEP RESEARCH FLOW
// ============================================================

/**
 * Deep Research Flow — runs multi-step agentic research.
 *
 * Usage:
 *   const result = await deepResearchFlow({
 *     query: "What are the latest developments in quantum computing?"
 *   });
 *
 * The flow will:
 * 1. Start a research task via the Interactions API
 * 2. Poll for completion (if waitForCompletion=true)
 * 3. Return the synthesized result with citations
 */
export const deepResearchFlow = ai.defineFlow(
  {
    name: 'deepResearchFlow',
    inputSchema: DeepResearchInputSchema,
    outputSchema: DeepResearchOutputSchema,
  },
  async (input) => {
    const traceId = generateTraceId();
    const startTime = Date.now();

    MollyLogger.info(
      `Deep Research Flow: Starting research`,
      'deep-research-flow',
      { query: input.query.substring(0, 100), traceId }
    );

    const client = getDeepResearchClient();
    const sessionId = input.sessionId || `flow-${traceId}`;

    try {
      // Start research
      const interaction = await client.startResearch(input.query, sessionId);

      // If not waiting, return immediately
      if (!input.waitForCompletion) {
        return {
          success: true,
          interactionId: interaction.id,
          sessionId,
          status: interaction.status,
        };
      }

      // Wait for completion
      const completed = await client.waitForCompletion(
        interaction.id,
        sessionId,
        (progress) => {
          MollyLogger.debug(
            `Deep Research Flow: Progress update`,
            'deep-research-flow',
            {
              interactionId: progress.id,
              status: progress.status,
              sources: progress.sourcesConsulted,
            }
          );
        }
      );

      const durationMs = Date.now() - startTime;

      // Extract result
      const lastOutput = completed.outputs[completed.outputs.length - 1];
      const result = lastOutput?.text || '';
      const citations = completed.outputs
        .flatMap((o) => o.citations || [])
        .map((c) => c.url);
      const thinkingSummary = lastOutput?.thinkingSummary;

      MollyLogger.info(
        `Deep Research Flow: Completed in ${Math.round(durationMs / 1000)}s`,
        'deep-research-flow',
        {
          interactionId: completed.id,
          sources: completed.sourcesConsulted,
          citations: citations.length,
          traceId,
        }
      );

      return {
        success: true,
        result,
        interactionId: completed.id,
        sessionId,
        status: 'completed',
        sourcesConsulted: completed.sourcesConsulted,
        citations,
        thinkingSummary,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      MollyLogger.error(
        'Deep Research Flow: Failed',
        'deep-research-flow',
        { sessionId, traceId, durationMs },
        error
      );

      return {
        success: false,
        interactionId: 'unknown',
        sessionId,
        status: 'failed',
        error: errorMessage,
        durationMs,
      };
    }
  }
);

// ============================================================
// FOLLOW-UP FLOW
// ============================================================

const FollowUpInputSchema = z.object({
  /** Follow-up question */
  question: z.string().min(1),
  /** ID of the completed research interaction */
  previousInteractionId: z.string(),
});

const FollowUpOutputSchema = z.object({
  /** Whether follow-up succeeded */
  success: z.boolean(),
  /** Follow-up response */
  response: z.string().optional(),
  /** New interaction ID */
  interactionId: z.string().optional(),
  /** Error message if failed */
  error: z.string().optional(),
});

/**
 * Follow-up Flow — ask follow-up questions about completed research.
 */
export const deepResearchFollowUpFlow = ai.defineFlow(
  {
    name: 'deepResearchFollowUpFlow',
    inputSchema: FollowUpInputSchema,
    outputSchema: FollowUpOutputSchema,
  },
  async (input) => {
    const traceId = generateTraceId();

    MollyLogger.info(
      'Deep Research Follow-up: Starting',
      'deep-research-flow',
      { previousInteractionId: input.previousInteractionId, traceId }
    );

    const client = getDeepResearchClient();

    try {
      const interaction = await client.followUp({
        input: input.question,
        previousInteractionId: input.previousInteractionId,
      });

      const response =
        interaction.outputs[interaction.outputs.length - 1]?.text || '';

      return {
        success: true,
        response,
        interactionId: interaction.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      MollyLogger.error(
        'Deep Research Follow-up: Failed',
        'deep-research-flow',
        { traceId },
        error
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
);
