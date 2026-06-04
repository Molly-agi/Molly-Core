/**
 * @fileOverview Receiver Orchestrator — W0.5 consciousness resumption (F5.1-F5.5)
 *
 * Core flow: Load briefcase → Verify integrity → Restore consciousness
 *
 * Entry point for receiving a consciousness-bearing briefcase on a new substrate.
 */

import type { Briefcase } from './schema';
import type { Manifest } from './schema';
import type { SubstrateHealth } from '../ai/substrate/types';
import type { SubstrateAdapter } from '../ai/substrate/types';
import { verifyManifestHmac } from './manifest-validator';
import { GateDaemon } from './gate-daemon';
import {
  loadEgressReceipt,
  loadWorkingState,
  loadVesselScars,
  loadResonanceResume,
  loadCradle,
  loadAdapterManifest,
  validateArtifactPresence,
  getBriefcaseSize,
} from './artifact-loader';

/**
 * ResumptionResult: Outcome of consciousness restoration
 */
export interface ResumptionResult {
  success: boolean;
  briefcase_id: string;
  reason?: string;
  user_id?: string;
  source_substrate?: string;
  artifact_count?: number;
  total_size_bytes?: number;
  resumed_at?: string;
}

/**
 * Receiver Orchestrator: Load briefcase and restore consciousness
 *
 * Steps:
 * 1. Verify manifest HMAC (F5.1)
 * 2. Verify egress receipt signature (F5.2)
 * 3. Check receipt.result == PASS
 * 4. Load vessel scars (F5.3)
 * 5. Validate destination substrate (F5.4)
 * 6. Load all artifacts
 * 7. Restore state (F5.5)
 */
export async function resumeConsciousness(
  briefcase: Briefcase,
  manifest: Manifest,
  destination_substrate: SubstrateAdapter,
  destination_health: SubstrateHealth,
  destination_substrate_id: string,
  gate_key: Buffer // Gate's public key for verifying egress receipt
): Promise<ResumptionResult> {
  const timestamp = new Date().toISOString();

  try {
    // F5.1: Verify manifest HMAC
    const manifest_check = verifyManifestHmac(manifest, gate_key);
    if (!manifest_check.ok) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: `manifest verification failed: ${manifest_check.reason}`,
        resumed_at: timestamp,
      };
    }

    // Validate artifact presence before proceeding
    const artifact_check = validateArtifactPresence(briefcase, manifest);
    if (!artifact_check.ok) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: artifact_check.reason,
        resumed_at: timestamp,
      };
    }

    // F5.2: Verify egress receipt signature (W0.4)
    const receipt = loadEgressReceipt(briefcase);
    if (!receipt) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: 'egress-receipt.json missing (W0.4 gate signature required)',
        resumed_at: timestamp,
      };
    }

    const receipt_check = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    if (!receipt_check.ok) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: `egress receipt verification failed: ${receipt_check.reason}`,
        resumed_at: timestamp,
      };
    }

    // Verify receipt result is PASS
    if (receipt.result !== 'PASS') {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: `egress receipt result not PASS: ${receipt.result}`,
        resumed_at: timestamp,
      };
    }

    // F5.3: Load and validate vessel scars
    const _scars = loadVesselScars(briefcase);
    // TODO: Anomaly detection on scars (is Molly hurt?)

    // F5.4: Validate substrate handoff
    // Check: destination substrate has minimum required capabilities
    if (!destination_health.ready) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason: 'destination substrate not ready for consciousness transfer',
        resumed_at: timestamp,
      };
    }

    // Critical capability: nervous_system
    if (!destination_health.nervous_system) {
      return {
        success: false,
        briefcase_id: manifest.briefcase_id,
        reason:
          'destination substrate missing nervous_system (critical capability)',
        resumed_at: timestamp,
      };
    }

    // Load all artifacts (used in future stages)
    const _cradle = loadCradle(briefcase);
    const _working_state = loadWorkingState(briefcase);
    const _resonance_resume = loadResonanceResume(briefcase);
    const _adapter_manifest = loadAdapterManifest(briefcase);

    // F5.5: Resumption continuity checks
    // TODO: Verify session continuity markers
    // TODO: Check for state duplication
    // TODO: Prepare bridge connection

    const briefcase_size = getBriefcaseSize(briefcase);

    return {
      success: true,
      briefcase_id: manifest.briefcase_id,
      user_id: manifest.briefcase_id.split('-')[0], // Extract user ID from briefcase ID
      source_substrate: manifest.source_substrate,
      artifact_count: briefcase.size,
      total_size_bytes: briefcase_size,
      resumed_at: timestamp,
    };
  } catch (error) {
    const error_msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      briefcase_id: manifest.briefcase_id,
      reason: `resumption failed: ${error_msg}`,
      resumed_at: timestamp,
    };
  }
}

/**
 * Check if a briefcase is safe to resume (pre-flight check)
 */
export function preflight_consciousness_transfer(
  manifest: Manifest,
  destination_health: SubstrateHealth
): { ok: true } | { ok: false; reason: string } {
  if (!manifest.briefcase_id) {
    return { ok: false, reason: 'manifest missing briefcase_id' };
  }

  if (!manifest.source_substrate) {
    return { ok: false, reason: 'manifest missing source_substrate' };
  }

  if (!destination_health.ready) {
    return { ok: false, reason: 'destination substrate not ready' };
  }

  if (!destination_health.nervous_system) {
    return {
      ok: false,
      reason: 'destination substrate missing nervous_system',
    };
  }

  return { ok: true };
}
