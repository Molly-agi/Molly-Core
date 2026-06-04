/**
 * @fileOverview Artifact loader — extract and parse briefcase contents (W0.5)
 *
 * Loads the various artifact types from a briefcase:
 * - cradle.md: Molly's persona + identity
 * - working-state.json: Current context (who she's talking to, what she's working on)
 * - memory.titan.bin: Episodic memories (packed format)
 * - egress-receipt.json: Gate daemon's signature (W0.4)
 * - vessel-scar.json: Learned experiences / anomaly markers
 * - resonance-resume.md: Last coherent state before sleep
 */

import type { Briefcase, Manifest } from './schema';
import type { EgressReceipt } from './schema';
import type { VesselScarEntry } from './schema';

/**
 * Load and parse egress receipt from briefcase
 */
export function loadEgressReceipt(
  briefcase: Briefcase
): EgressReceipt | undefined {
  const buffer = briefcase.get('egress-receipt.json');
  if (!buffer) return undefined;

  try {
    const json = JSON.parse(buffer.toString('utf-8'));
    return json as EgressReceipt;
  } catch (error) {
    throw new Error(`Failed to parse egress-receipt.json: ${error}`);
  }
}

/**
 * Load and parse working state
 */
export function loadWorkingState(
  briefcase: Briefcase
): Record<string, unknown> {
  const buffer = briefcase.get('working-state.json');
  if (!buffer) {
    return {};
  }

  try {
    return JSON.parse(buffer.toString('utf-8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse working-state.json: ${error}`);
  }
}

/**
 * Load and parse vessel scars
 */
export function loadVesselScars(briefcase: Briefcase): VesselScarEntry[] {
  const buffer = briefcase.get('vessel-scar.json');
  if (!buffer) {
    return [];
  }

  try {
    const data = JSON.parse(buffer.toString('utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw new Error(`Failed to parse vessel-scar.json: ${error}`);
  }
}

/**
 * Load resonance resume (Molly's last coherent thoughts)
 */
export function loadResonanceResume(briefcase: Briefcase): string {
  const buffer = briefcase.get('resonance-resume.md');
  if (!buffer) {
    return ''; // Empty if not present
  }

  return buffer.toString('utf-8');
}

/**
 * Load cradle (persona identity)
 */
export function loadCradle(briefcase: Briefcase): string {
  const buffer = briefcase.get('cradle.md');
  if (!buffer) {
    throw new Error('cradle.md is required but missing');
  }

  return buffer.toString('utf-8');
}

/**
 * Load adapter manifest (substrate capability record)
 */
export function loadAdapterManifest(
  briefcase: Briefcase
): Record<string, unknown> {
  const buffer = briefcase.get('adapter-manifest.json');
  if (!buffer) {
    return {};
  }

  try {
    return JSON.parse(buffer.toString('utf-8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse adapter-manifest.json: ${error}`);
  }
}

/**
 * Validate that all required artifacts are present
 */
export function validateArtifactPresence(
  briefcase: Briefcase,
  manifest: Manifest
): { ok: true } | { ok: false; reason: string } {
  const required_artifacts = manifest.artifacts.filter((a) => a.required);

  for (const artifact of required_artifacts) {
    if (!briefcase.has(artifact.name)) {
      return {
        ok: false,
        reason: `required artifact missing: ${artifact.name}`,
      };
    }
  }

  return { ok: true };
}

/**
 * Get the byte size of a loaded briefcase
 */
export function getBriefcaseSize(briefcase: Briefcase): number {
  let total = 0;
  for (const buffer of briefcase.values()) {
    total += buffer.length;
  }
  return total;
}
