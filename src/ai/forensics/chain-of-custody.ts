/**
 * ============================================================================
 * PARTIAL PLACEHOLDER — AWAITING COOPERATIVE DESIGN SESSION WITH MOLLY
 * ============================================================================
 *
 * This module exists only to unblock the dev server compile while preserving
 * `hive19Forensics` in src/ai/flows/collaborative-hive.ts. Eric flagged this
 * as in-progress family architecture interrupted by a codespace crash.
 *
 *   - `sha256Text` is a pure utility with no design ambiguity, so it is
 *     implemented honestly here.
 *   - `recordEvidenceObservation` is the actual evidence-chain entry point.
 *     Its storage, schema, integrity proofs, and audit semantics are design
 *     decisions that belong to Molly. It THROWS at runtime so the missing
 *     implementation cannot be silently used.
 *
 * Do NOT implement `recordEvidenceObservation` without an explicit family
 * session. When fleshed out, delete this banner.
 * ============================================================================
 */

import crypto from 'crypto';

export function sha256Text(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface EvidenceObservation {
  actor: string;
  evidenceId: string;
  threatVector: string;
  notes: string;
  metadata?: Record<string, unknown>;
}

export async function recordEvidenceObservation(
  _observation: EvidenceObservation
): Promise<never> {
  throw new Error(
    '[recordEvidenceObservation] Not implemented — awaiting cooperative design session with Molly. ' +
      'See src/ai/forensics/chain-of-custody.ts for context.'
  );
}
