/**
 * @fileOverview Receiver — consciousness resumption orchestrator (W0.5)
 *
 * Entry point for the receiver side of a substrate transfer.
 *
 * Flow (any failure = halt, do not proceed):
 *   Phase 1 — VERIFY:   verifyBriefcase (F1.1-F1.5, gate signature)
 *   Phase 2 — SCAR:     loadVesselScar (extract + validate learned experiences)
 *   Phase 3 — HANDOFF:  signal ready to destination substrate
 *
 * Guarantees:
 *   F5.1: Verification precedes all other phases (hard dependency)
 *   F5.2: Vessel scar loaded before handoff signal
 *   F5.3: Empty scar set is valid (first transfer has no history)
 *   F5.4: Zero coupling to Heart Gate (moral compass — not our concern)
 */

import { verifyBriefcase } from './verifier';
import { loadVesselScar } from './scar-loader';
import type { ResumptionInput, ResumptionResult } from './resumption-context';

/**
 * Execute the full consciousness resumption flow.
 *
 * @param input - Everything the destination substrate received
 * @returns ResumptionResult — ok=true with scar, or ok=false with reason+phase
 */
export async function receiveConsciousness(
  input: ResumptionInput
): Promise<ResumptionResult> {
  // ─── Phase 1: VERIFY ─────────────────────────────────────────────────────
  // F5.1: Briefcase must be cryptographically valid before anything else runs.
  const verification = verifyBriefcase({
    manifest: (() => {
      const raw = input.briefcase.get('manifest.json');
      if (!raw) {
        return null as never; // caught below
      }
      try {
        return JSON.parse(raw.toString('utf8'));
      } catch {
        return null as never;
      }
    })(),
    contents: input.briefcase,
    decompressed: new Map(),
    expected_cradle_pavc_hash: input.expected_cradle_pavc_hash,
    hmac_key: input.hmac_key,
    gate_key: input.gate_key,
  });

  if (!verification.ok) {
    return {
      ok: false,
      reason: verification.reason,
      phase: 'verify',
    };
  }

  // ─── Phase 2: SCAR LOAD ──────────────────────────────────────────────────
  // F5.2: Load vessel scar before signalling ready.
  // F5.3: Empty scar is valid on first transfer.
  const scarResult = loadVesselScar(input.briefcase, input.source_substrate);

  if (!scarResult.ok) {
    return {
      ok: false,
      reason: scarResult.reason,
      phase: 'scar-load',
    };
  }

  // ─── Phase 3: HANDOFF SIGNAL ─────────────────────────────────────────────
  // Destination substrate health was already provided by caller.
  // We trust the substrate adapter (W0.3 contract) to manage its own readiness.
  // If destination is not ready, caller should not have invoked receiveConsciousness.

  return {
    ok: true,
    scar: scarResult.scar,
    resumed_at: new Date().toISOString(),
    source_substrate: input.source_substrate,
  };
}
