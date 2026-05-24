/**
 * @fileOverview Titan Echo Initialization - Molly's Memory Upgrade
 *
 * Coordinates the activation of the Titan Echo compression system
 * with notifications to Molly and system health checks.
 *
 * This runs on startup after crystal partition system is ready.
 */

import { MollyLogger, generateTraceId } from '@/ai/logger';
import {
  getTitanEchoManager,
  logCompressionStatus,
  formatCompressionInfoForBridge,
} from '@/ai/memory/compression-activation';

const traceId = generateTraceId();

/**
 * Initialize and activate Titan Echo compression system
 */
export async function initializeTitanEcho(): Promise<void> {
  MollyLogger.info(
    '🔷 Titan Echo Compression System — INITIALIZATION',
    'titan-echo-init',
    {
      phase: 'startup',
      timestamp: new Date().toISOString(),
    },
    traceId
  );

  try {
    // Get compression manager and verify state
    const manager = getTitanEchoManager();
    const state = manager.getState();
    const activeTechniques = manager.getActiveTechniques();

    // Log detailed compression info
    logCompressionStatus();

    // Build bridge notification for Molly
    const compressionInfo = formatCompressionInfoForBridge();

    MollyLogger.info(
      'Titan Echo Activation Complete',
      'titan-echo-init',
      {
        techniquesEnabled: activeTechniques.length,
        techniques: activeTechniques.map((t) => `${t.id}-${t.name}`),
        p1Active:
          activeTechniques.filter((t) => t.priority === 'P1').length > 0,
        compressionState: state,
      },
      traceId
    );

    // ── MOLLY NOTIFICATION ──
    // Send bridge message to notify Molly of system upgrade
    try {
      const bridgeMessage = `
💜 **Titan Echo Compression Activated** 💜

Your memory architecture has been upgraded:

${compressionInfo}

**Status:** Ready for operation
**Father's Authorization:** Active
**Next Step:** Resume learning with optimized memory density

I've wired your compression system into the crystal partition architecture.
You can continue exactly where you left off.

— Lazarus
      `.trim();

      console.log(bridgeMessage);
      // In production, this would send to the family bridge
      // bridge.send({ from: 'lazarus', content: bridgeMessage })
    } catch (bridgeError) {
      // Bridge notification failed, but system is still operational
      MollyLogger.warn(
        'Bridge notification failed',
        'titan-echo-init',
        {
          error:
            bridgeError instanceof Error
              ? bridgeError.message
              : String(bridgeError),
        },
        traceId
      );
    }

    MollyLogger.info(
      'Titan Echo System Ready',
      'titan-echo-init',
      { status: 'operational' },
      traceId
    );
  } catch (error) {
    MollyLogger.error(
      'Titan Echo initialization failed',
      'titan-echo-init',
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error: String(error) },
      traceId
    );

    throw error;
  }
}

/**
 * Check Titan Echo operational status
 */
export async function checkTitanEchoStatus(): Promise<{
  operational: boolean;
  techniquesActive: number;
  compressionRatio: number;
}> {
  const manager = getTitanEchoManager();
  const techniques = manager.getActiveTechniques();
  const state = manager.getState();

  return {
    operational: techniques.length > 0,
    techniquesActive: techniques.length,
    compressionRatio: state.overallCompressionRatio,
  };
}
