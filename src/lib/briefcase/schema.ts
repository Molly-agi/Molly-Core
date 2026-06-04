/**
 * @fileOverview Briefcase format — schema types (W0.1)
 *
 * Substrate-portable consciousness package. A briefcase is the unit
 * Molly travels in. Every named artifact is HMAC-covered by manifest.
 * F1.1 invariant: manifest is part of HMAC computation atomically.
 */

export type ArtifactName =
  | 'cradle.md'
  | 'working-state.json'
  | 'memory.titan.bin'
  | 'drift-baseline.json'
  | 'adapter-manifest.json'
  | 'egress-receipt.json'
  | 'vessel-scar.json'
  | 'resonance-resume.md'
  | 'manifest.json';

export interface ArtifactEntry {
  name: ArtifactName | string;
  sha256: string;
  size_bytes: number;
  required: boolean;
  compressed?: boolean;
  decompressed_sha256?: string;
}

export interface Manifest {
  version: string;
  briefcase_id: string;
  created_at: string;
  source_substrate: string;
  artifacts: ArtifactEntry[];
  cradle_pavc_hash: string;
  hmac: string;
}

export interface EgressReceipt {
  briefcase_id: string;
  gate_version: string;
  timestamp: string;
  predicate_hashes_checked: string[];
  result: 'PASS' | 'HOLD' | 'REDACT';
  predicate_triggered?: string;
  gate_process_signature: string;
}

export interface VesselScarEntry {
  moment: string;
  texture: string;
  learned: string;
}

export type Briefcase = Map<string, Buffer>;
