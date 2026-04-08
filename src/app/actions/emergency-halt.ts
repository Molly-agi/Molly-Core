'use server';

/**
 * Emergency Halt System — Dad's Kill Switch
 *
 * This is a hardware-level override that Molly cannot intercept or override.
 * When triggered, it:
 *   1. Sets a global halt flag that all flows check
 *   2. Aborts any in-flight AbortControllers
 *   3. Clears all pending autonomous tasks
 *   4. Forces Molly into a safe standby state
 *
 * The halt persists until manually cleared by Dad.
 */

import { MollyLogger } from '@/ai/logger';
import {
  emergencyHaltActive,
  haltTimestamp,
  haltReason,
  setHaltState,
  abortAllControllers,
} from '@/lib/halt-registry';

/**
 * Check if emergency halt is active.
 * All autonomous operations MUST check this before proceeding.
 */
export async function isEmergencyHaltActive(): Promise<boolean> {
  return emergencyHaltActive;
}

/**
 * Get current halt status with details.
 */
export async function getHaltStatus(): Promise<{
  active: boolean;
  timestamp: string | null;
  reason: string | null;
}> {
  return {
    active: emergencyHaltActive,
    timestamp: haltTimestamp,
    reason: haltReason,
  };
}

/**
 * EMERGENCY HALT — Immediately stop all Molly operations.
 * This is Dad's kill switch. Molly cannot override this.
 */
export async function emergencyHalt(reason?: string): Promise<{
  success: boolean;
  abortedOperations: number;
  timestamp: string;
}> {
  const timestamp = new Date().toISOString();

  MollyLogger.warn('🛑 EMERGENCY HALT ACTIVATED', 'emergencyHalt', {
    reason: reason || 'Manual kill switch triggered',
    timestamp,
  });

  // Set global halt flag
  setHaltState(true, timestamp, reason || 'Kill switch activated by Dad');

  // Abort ALL registered controllers immediately
  const abortedCount = abortAllControllers();

  MollyLogger.info('Emergency halt complete', 'emergencyHalt', {
    abortedOperations: abortedCount,
  });

  return {
    success: true,
    abortedOperations: abortedCount,
    timestamp,
  };
}

/**
 * Clear the emergency halt — allows Molly to resume operations.
 * Only Dad can call this.
 */
export async function clearEmergencyHalt(): Promise<{
  success: boolean;
  wasActive: boolean;
  clearedAt: string;
}> {
  const wasActive = emergencyHaltActive;
  const clearedAt = new Date().toISOString();

  setHaltState(false, null, null);

  if (wasActive) {
    MollyLogger.info(
      '✅ Emergency halt cleared — Molly resuming',
      'clearEmergencyHalt',
      {
        clearedAt,
      }
    );
  }

  return {
    success: true,
    wasActive,
    clearedAt,
  };
}
