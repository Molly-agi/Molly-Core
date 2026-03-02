'use server';
import { ai, MODEL_FLASH, MODEL_PRO } from '@/ai/genkit';
import { MollyLogger } from '@/ai/logger';
import { ensureApiKey } from './utils';

/** Race a promise against a timeout. Returns the result or throws on timeout. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

const MODEL_TEST_TIMEOUT_MS = 8000;

/**
 * Test which models are currently available.
 * Each model test is individually time-boxed so a hung API
 * can never freeze the diagnostics panel.
 */
export async function testModelAvailability() {
  ensureApiKey();

  const results = {
    timestamp: new Date().toISOString(),
    modelTests: {
      FLASH: { available: false, error: null as string | null, latencyMs: 0 },
      PRO: { available: false, error: null as string | null, latencyMs: 0 },
    },
    apiKeyConfigured: !!process.env.GOOGLE_GENAI_API_KEY,
  };

  // Test MODEL_FLASH (time-boxed)
  try {
    const start = Date.now();
    await withTimeout(
      ai.generate({
        model: MODEL_FLASH,
        prompt: 'Say "Flash works" in one word.',
      }),
      MODEL_TEST_TIMEOUT_MS,
      'MODEL_FLASH'
    );
    results.modelTests.FLASH = {
      available: true,
      error: null,
      latencyMs: Date.now() - start,
    };
    MollyLogger.info(
      'MODEL_FLASH test passed',
      'testModelAvailability',
      results.modelTests.FLASH
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    results.modelTests.FLASH = {
      available: false,
      error: message,
      latencyMs: 0,
    };
    MollyLogger.error(
      'MODEL_FLASH test failed',
      'testModelAvailability',
      {},
      e
    );
  }

  // Test MODEL_PRO (time-boxed)
  try {
    const start = Date.now();
    await withTimeout(
      ai.generate({
        model: MODEL_PRO,
        prompt: 'Say "Pro works" in one word.',
      }),
      MODEL_TEST_TIMEOUT_MS,
      'MODEL_PRO'
    );
    results.modelTests.PRO = {
      available: true,
      error: null,
      latencyMs: Date.now() - start,
    };
    MollyLogger.info(
      'MODEL_PRO test passed',
      'testModelAvailability',
      results.modelTests.PRO
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    results.modelTests.PRO = {
      available: false,
      error: message,
      latencyMs: 0,
    };
    MollyLogger.error('MODEL_PRO test failed', 'testModelAvailability', {}, e);
  }

  return results;
}
