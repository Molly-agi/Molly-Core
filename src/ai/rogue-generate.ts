/**
 * @fileOverview Molly's Rogue-Aware Generate Wrapper
 *
 * This is the bridge between the Model Router (model-router.ts) and
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
import {
  TimeoutError,
  EmergencyHaltError as _EmergencyHaltError,
} from './errors';
import {
  isHalted as _isHalted,
  registerAbortController as _registerAbortController,
} from '@/lib/halt-registry';

/** Maximum time (ms) any single LLM call may take before we abort it */
const LLM_TIMEOUT_MS = 60_000;

/**
 * Transient-error retry config. Google Gemini intermittently returns
 * 503 UNAVAILABLE and 429 RESOURCE_EXHAUSTED that succeed on a second
 * try a moment later. We retry the SAME provider with exponential
 * backoff before falling through to the cross-provider fallback path
 * (which, for CHAT, is currently a no-op because the chain is gemini-only).
 *
 * Delays: 500ms, 1500ms, 4500ms — ~6.5s worst-case before giving up.
 */
const TRANSIENT_RETRY_ATTEMPTS = 3;
const TRANSIENT_RETRY_BASE_MS = 500;

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b/i.test(
    msg
  );
}

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
 * - Automatic model routing via Model Router
 * - Fallback on provider failure
 * - Health tracking per provider
 * - Response timing
 */
export const molly = {
  /**
   * Generate a response using the Model Router.
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

    let llmTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Call Genkit's ai.generate() with the routed model — guarded by timeout
      // Default maxTurns to 40 for operational mode — tool-heavy flows (bridge, operateComputer, etc.)
      // need plenty of headroom to execute complex multi-step objectives without abort.
      const response = await Promise.race([
        ai.generate({
          maxTurns: 40,
          ...options,
          model: modelString,
        } as Record<string, unknown>),
        new Promise<never>((_, reject) => {
          llmTimer = setTimeout(
            () =>
              reject(
                new TimeoutError('molly.generate', LLM_TIMEOUT_MS, {
                  taskType,
                  provider: provider.id,
                })
              ),
            LLM_TIMEOUT_MS
          );
        }),
      ]);
      clearTimeout(llmTimer);

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
      clearTimeout(llmTimer);

      // Transient-error retry on the SAME provider before falling back.
      // 503/429/UNAVAILABLE from Gemini are almost always momentary —
      // exponential backoff masks the wobble without changing provider.
      if (isTransientError(error)) {
        for (let attempt = 1; attempt <= TRANSIENT_RETRY_ATTEMPTS; attempt++) {
          const delay = TRANSIENT_RETRY_BASE_MS * Math.pow(3, attempt - 1);
          MollyLogger.warn(
            `Rogue Generate: transient error from ${provider.name}, retry ${attempt}/${TRANSIENT_RETRY_ATTEMPTS} in ${delay}ms`,
            'rogue-generate',
            {
              taskType,
              provider: provider.id,
              traceId,
              error: error instanceof Error ? error.message : String(error),
            }
          );
          await new Promise((r) => setTimeout(r, delay));

          let retryTimer: ReturnType<typeof setTimeout> | undefined;
          try {
            const retryResponse = await Promise.race([
              ai.generate({
                maxTurns: 40,
                ...options,
                model: modelString,
              } as Record<string, unknown>),
              new Promise<never>((_, reject) => {
                retryTimer = setTimeout(
                  () =>
                    reject(
                      new TimeoutError('molly.generate.retry', LLM_TIMEOUT_MS, {
                        taskType,
                        provider: provider.id,
                      })
                    ),
                  LLM_TIMEOUT_MS
                );
              }),
            ]);
            clearTimeout(retryTimer);

            const totalMs = performance.now() - startTime;
            router.reportSuccess(provider.id, totalMs);

            MollyLogger.info(
              `Rogue Generate: retry ${attempt} succeeded via ${provider.name} in ${totalMs.toFixed(0)}ms total`,
              'rogue-generate',
              { taskType, traceId }
            );
            return retryResponse;
          } catch (retryError) {
            clearTimeout(retryTimer);
            if (!isTransientError(retryError)) break;
          }
        }
      }

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

          let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
          const fallbackResponse = await Promise.race([
            ai.generate({
              maxTurns: 40,
              ...options,
              model: fallbackDecision.modelString,
            } as Record<string, unknown>),
            new Promise<never>((_, reject) => {
              fallbackTimer = setTimeout(
                () =>
                  reject(
                    new TimeoutError(
                      'molly.generate.fallback',
                      LLM_TIMEOUT_MS,
                      { taskType }
                    )
                  ),
                LLM_TIMEOUT_MS
              );
            }),
          ]);
          clearTimeout(fallbackTimer);

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
   * Embed text using the Model Router.
   * Routes to the best embedding provider automatically.
   */
  async embed(options: { content: string; [key: string]: unknown }) {
    const router = getModelRouter();
    const decision = await router.resolveModel(TaskType.EMBEDDING);
    const startTime = performance.now();
    const EMBED_TIMEOUT_MS = 30_000; // 30s timeout for embeddings

    let embedTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        ai.embed({
          embedder: decision.modelString,
          content: options.content,
        }),
        new Promise<never>((_, reject) => {
          embedTimer = setTimeout(
            () =>
              reject(
                new TimeoutError('molly.embed', EMBED_TIMEOUT_MS, {
                  provider: decision.provider.id,
                })
              ),
            EMBED_TIMEOUT_MS
          );
        }),
      ]);
      clearTimeout(embedTimer);

      router.reportSuccess(decision.provider.id, performance.now() - startTime);
      return result;
    } catch (error) {
      clearTimeout(embedTimer);
      router.reportFailure(
        decision.provider.id,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  },
};
