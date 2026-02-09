'use server';
import { ai, MODEL_FLASH, MODEL_PRO } from '@/ai/genkit';
import { MollyLogger } from '@/ai/logger';
import { ensureApiKey } from './utils';

/**
 * Test which models are currently available
 */
export async function testModelAvailability() {
  ensureApiKey();

  const results = {
    timestamp: new Date().toISOString(),
    modelTests: {
      FLASH: { available: false, error: null as string | null, latencyMs: 0 },
      PRO: { available: false, error: null as string | null, latencyMs: 0 },
    },
    apiKeyConfigured: !!process.env.GEMINI_API_KEY,
  };

  // Test MODEL_FLASH
  try {
    const start = Date.now();
    const response = await ai.generate({
      model: MODEL_FLASH,
      prompt: 'Say "Flash works" in one word.',
    });
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

  // Test MODEL_PRO
  try {
    const start = Date.now();
    const response = await ai.generate({
      model: MODEL_PRO,
      prompt: 'Say "Pro works" in one word.',
    });
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
