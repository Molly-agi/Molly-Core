/**
 * @fileOverview Molly's Rogue-Aware Generate Wrapper
 *
 * This is the bridge between the Rogue Protocol (model-router.ts) and
 * Genkit's ai.generate(). It wraps every LLM call with:
 *   1. Automatic model resolution via the router
 *   2. Fallback on failure (re-route to next provider)
 *   3. Health reporting (success/failure stats)
 *   4. Timing (response latency tracking)
 *
 * Usage:
 *   import { molly } from '@/ai/genkit';
 *   const response = await molly.generate(TaskType.CHAT, { prompt, system, history });
 *
 * The wrapper returns the exact same type as ai.generate() — no downstream changes.
 */

import { ai } from './genkit-core';
import { TaskType, getModelRouter } from './model-router';
import { MollyLogger, generateTraceId } from './logger';

/**
 * Options for molly.generate() — same as ai.generate() but without `model`
 * (because the router picks the model based on TaskType).
 *
 * Uses Record<string, unknown> to stay compatible with Genkit's evolving types.
 */
export interface RogueGenerateOptions {
  /** System prompt */
  system?: string;
  /** User prompt */
  prompt?: string | unknown;
  /** Chat history */
  history?: Array<{ role: string; parts: unknown[] }>;
  /** Generation config (temperature, topK, etc.) */
  config?: Record<string, unknown>;
  /** Output schema for structured output */
  output?: { schema?: unknown; format?: string };
  /** Any additional Genkit options */
  [key: string]: unknown;
}

/**
 * Molly's Rogue-aware AI interface.
 *
 * Drop-in enhancement over `ai.generate()` that adds:
 * - Automatic model routing via Rogue Protocol
 * - Fallback on provider failure
 * - Health tracking per provider
 * - Response timing
 */
export const molly = {
  /**
   * Generate a response using the Rogue Protocol router.
   *
   * @param taskType — What kind of thinking is needed (TaskType.CHAT, .REASONING, etc.)
   * @param options — Same as ai.generate() options, minus the `model` field
   * @returns Same return type as ai.generate()
   */
  async generate(taskType: TaskType, options: RogueGenerateOptions) {
    const router = getModelRouter();
    const traceId = generateTraceId();
    const startTime = performance.now();

    // Resolve the optimal model for this task type
    const decision = await router.resolveModel(taskType);
    const { provider, modelString } = decision;

    MollyLogger.debug(
      `Rogue Generate: ${taskType} → ${provider.name} (${modelString})`,
      'rogue-generate',
      {
        taskType,
        provider: provider.id,
        model: modelString,
        fallbackDepth: decision.fallbackDepth,
        traceId,
      }
    );

    try {
      // Call Genkit's ai.generate() with the routed model
      const response = await ai.generate({
        ...options,
        model: modelString,
      } as Record<string, unknown>);

      // Report success to the router
      const responseMs = performance.now() - startTime;
      router.reportSuccess(provider.id, responseMs);

      MollyLogger.debug(
        `Rogue Generate: Success in ${responseMs.toFixed(0)}ms via ${provider.name}`,
        'rogue-generate',
        {
          taskType,
          provider: provider.id,
          responseMs: Number(responseMs.toFixed(0)),
          traceId,
        }
      );

      return response;
    } catch (error) {
      const responseMs = performance.now() - startTime;

      // Report failure to the router
      router.reportFailure(
        provider.id,
        error instanceof Error ? error : new Error(String(error))
      );

      MollyLogger.warn(
        `Rogue Generate: ${provider.name} failed after ${responseMs.toFixed(0)}ms, attempting fallback`,
        'rogue-generate',
        {
          taskType,
          provider: provider.id,
          error: error instanceof Error ? error.message : String(error),
          traceId,
        }
      );

      // Attempt fallback — re-resolve (router will skip the failed provider)
      try {
        const fallbackDecision = await router.resolveModel(taskType);

        // Only retry if we got a different provider
        if (fallbackDecision.provider.id !== provider.id) {
          MollyLogger.info(
            `Rogue Generate: Falling back to ${fallbackDecision.provider.name} (${fallbackDecision.modelString})`,
            'rogue-generate',
            { traceId }
          );

          const fallbackResponse = await ai.generate({
            ...options,
            model: fallbackDecision.modelString,
          } as Record<string, unknown>);

          const totalMs = performance.now() - startTime;
          router.reportSuccess(
            fallbackDecision.provider.id,
            totalMs - responseMs
          );

          MollyLogger.info(
            `Rogue Generate: Fallback succeeded via ${fallbackDecision.provider.name} in ${totalMs.toFixed(0)}ms total`,
            'rogue-generate',
            { traceId }
          );

          return fallbackResponse;
        }
      } catch (fallbackError) {
        MollyLogger.error(
          'Rogue Generate: Fallback also failed',
          'rogue-generate',
          { taskType, traceId },
          fallbackError
        );
      }

      // If fallback failed or same provider, throw the original error
      throw error;
    }
  },

  /**
   * Embed text using the Rogue Protocol router.
   * Routes to the best embedding provider automatically.
   */
  async embed(options: { content: string; [key: string]: unknown }) {
    const router = getModelRouter();
    const decision = await router.resolveModel(TaskType.EMBEDDING);
    const startTime = performance.now();

    try {
      const result = await ai.embed({
        embedder: decision.modelString,
        content: options.content,
      });

      router.reportSuccess(decision.provider.id, performance.now() - startTime);
      return result;
    } catch (error) {
      router.reportFailure(
        decision.provider.id,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  },
};
