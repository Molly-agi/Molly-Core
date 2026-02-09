/**
 * @fileOverview Memory Evolution System Initialization
 *
 * Sets up embeddings, memory schemas, and integrity checks for Phase 7.
 * Call this during app initialization.
 */

import { MollyLogger } from '@/ai/logger';
import {
  setEmbeddingProvider,
  getEmbeddingProvider,
  isEmbeddingProviderReady,
} from '@/ai/tools/embedding-provider';
import { createGoogleEmbeddingProvider } from '@/ai/tools/google-embedding-provider';

/**
 * Initialize the memory evolution system for Phase 7
 * Should be called once during app startup
 */
export async function initializeMemoryEvolution(): Promise<boolean> {
  try {
    MollyLogger.info(
      'Initializing memory evolution system (Phase 7)',
      'memory-evolution-init'
    );

    // 1. Initialize embedding provider
    if (!isEmbeddingProviderReady()) {
      MollyLogger.info(
        'Setting up embedding provider',
        'memory-evolution-init'
      );

      const provider = await createGoogleEmbeddingProvider();
      setEmbeddingProvider(provider);

      MollyLogger.info(
        `Embedding provider ready: ${provider.getName()}`,
        'memory-evolution-init'
      );
    } else {
      MollyLogger.info(
        'Embedding provider already initialized',
        'memory-evolution-init'
      );
    }

    // 2. Verify provider is accessible
    try {
      const provider = getEmbeddingProvider();
      const isHealthy = await provider.healthCheck();

      if (!isHealthy) {
        MollyLogger.warn(
          'Embedding provider health check failed - proceeding with caution',
          'memory-evolution-init'
        );
      } else {
        MollyLogger.info(
          'Embedding provider health check passed',
          'memory-evolution-init'
        );
      }
    } catch (error) {
      MollyLogger.warn(
        'Could not verify embedding provider health',
        'memory-evolution-init',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    MollyLogger.info(
      'Memory evolution system initialized successfully',
      'memory-evolution-init'
    );
    return true;
  } catch (error) {
    MollyLogger.error(
      'Failed to initialize memory evolution system',
      'memory-evolution-init',
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return false;
  }
}

/**
 * Check if memory evolution system is ready
 */
export function isMemoryEvolutionReady(): boolean {
  return isEmbeddingProviderReady();
}

/**
 * Get diagnostic info about memory evolution system
 */
export async function getMemoryEvolutionStatus(): Promise<{
  isReady: boolean;
  embeddingProvider: string | null;
  dimensions: number | null;
  healthy: boolean;
}> {
  try {
    if (!isMemoryEvolutionReady()) {
      return {
        isReady: false,
        embeddingProvider: null,
        dimensions: null,
        healthy: false,
      };
    }

    const provider = getEmbeddingProvider();
    const healthy = await provider.healthCheck();

    return {
      isReady: true,
      embeddingProvider: provider.getName(),
      dimensions: provider.getDimensions(),
      healthy,
    };
  } catch (error) {
    MollyLogger.error(
      'Failed to get memory evolution status',
      'memory-evolution-status',
      {},
      error instanceof Error ? error : new Error(String(error))
    );

    return {
      isReady: false,
      embeddingProvider: null,
      dimensions: null,
      healthy: false,
    };
  }
}
