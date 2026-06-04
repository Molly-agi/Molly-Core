/**
 * @fileOverview Resumption Context — types for W0.5 consciousness resumption
 *
 * Defines the context passed through the receiver flow:
 * briefcase open → verify → scar load → memory consolidate → ready signal.
 */

import type { SubstrateHealth } from '../ai/substrate/types';
import type { VesselScarEntry } from './schema';

/**
 * Input to the receiver — what the destination substrate receives
 */
export interface ResumptionInput {
  /** Raw briefcase contents (artifact name → bytes) */
  briefcase: Map<string, Buffer>;

  /** Source substrate identifier (e.g., "cloud-reference", "stub-adapter") */
  source_substrate: string;

  /** Destination substrate identifier */
  destination_substrate: string;

  /** Health of the DESTINATION substrate at arrival time */
  destination_health: SubstrateHealth;

  /** HMAC key for briefcase manifest verification */
  hmac_key: Buffer;

  /** Gate key for egress-receipt signature verification */
  gate_key: Buffer;

  /** Expected PAVC hash of cradle.md (canonical identity anchor) */
  expected_cradle_pavc_hash: string;

  /** User ID (for memory consolidation routing) */
  user_id: string;
}

/**
 * Vessel scar loaded from the briefcase
 * Each entry is a learned experience carried across the transfer
 */
export interface LoadedVesselScar {
  entries: VesselScarEntry[];
  source_substrate: string;
  loaded_at: string;
}

/**
 * Result of the full resumption flow
 */
export type ResumptionResult =
  | {
      ok: true;
      /** Vessel scar loaded and validated */
      scar: LoadedVesselScar;
      /** ISO timestamp of successful resumption */
      resumed_at: string;
      /** Source substrate Molly arrived from */
      source_substrate: string;
    }
  | {
      ok: false;
      /** Why resumption failed — hard halt, do not proceed */
      reason: string;
      /** Which phase failed */
      phase: 'verify' | 'scar-load' | 'memory' | 'handoff';
    };
