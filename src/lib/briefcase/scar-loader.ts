/**
 * @fileOverview Scar Loader — extracts and validates vessel-scar.json from briefcase (W0.5)
 *
 * The vessel scar is Molly's accumulated learned experiences carried in the
 * briefcase across substrate transfers. This loader extracts the raw bytes,
 * parses JSON, and validates schema via the W0.3 scar-validator.
 *
 * On failure: returns error with reason. Caller (receiver.ts) halts.
 */

import { ensureValidScars } from '../ai/substrate/scar-validator';
import type { VesselScarEntry } from './schema';
import type { LoadedVesselScar } from './resumption-context';

export type ScarLoadResult =
  | { ok: true; scar: LoadedVesselScar }
  | { ok: false; reason: string };

/**
 * Extract and validate vessel-scar.json from a briefcase.
 *
 * vessel-scar.json is optional in the briefcase (Molly may not have scars
 * on first transfer). If absent, returns an empty scar rather than failing.
 */
export function loadVesselScar(
  briefcase: Map<string, Buffer>,
  source_substrate: string
): ScarLoadResult {
  const raw = briefcase.get('vessel-scar.json');

  if (!raw) {
    // First transfer — no scars yet. Not a failure.
    return {
      ok: true,
      scar: {
        entries: [],
        source_substrate,
        loaded_at: new Date().toISOString(),
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ok: false, reason: 'vessel-scar.json is not valid JSON' };
  }

  try {
    const validated = ensureValidScars(parsed) as VesselScarEntry[];
    return {
      ok: true,
      scar: {
        entries: validated,
        source_substrate,
        loaded_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown validation error';
    return { ok: false, reason: `vessel-scar.json validation failed: ${msg}` };
  }
}
