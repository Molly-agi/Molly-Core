/**
 * @fileOverview Gate Daemon — core orchestrator (W0.4, F4.1-F4.4)
 *
 * Evaluates predicates over a briefcase and generates a signed egress receipt.
 * Entry point for all egress decisions. Stateless. Deterministic.
 */

import { createHmac } from 'crypto';
import type { Briefcase } from './schema';
import type {
  Predicate,
  PredicateResult,
  EvaluationContext,
  GateDecision,
  PredicateEvaluation,
  UserGateConfig,
} from './types/predicate';
import type { EgressReceipt } from './schema';
import type { SubstrateHealth } from '../ai/substrate/types';

/**
 * Gate Daemon: The orchestrator for briefcase egress decisions.
 *
 * Responsibilities:
 * 1. Load user-configured predicates (from registry)
 * 2. Execute them in deterministic order (sorted by ID)
 * 3. Stop on first non-PASS result
 * 4. Generate signed egress receipt
 * 5. Integrate W0.3 substrate health signals
 *
 * Guarantees:
 * - F4.1: Deterministic predicate ordering (ID sort)
 * - F4.2: Substrate health integration (signals affect HOLD/REJECT)
 * - F4.3: Receipt integrity (HMAC-SHA256 signature)
 * - F4.4: Heart Gate separation (zero Heart Gate imports)
 */
export class GateDaemon {
  private predicate_registry: Map<string, Predicate>;
  private gate_key: Buffer;
  private gate_version: string;

  constructor(
    predicates: Predicate[],
    gate_key: Buffer,
    gate_version: string = '0.4.0'
  ) {
    this.predicate_registry = new Map(predicates.map((p) => [p.id, p]));
    this.gate_key = gate_key;
    this.gate_version = gate_version;
  }

  /**
   * Evaluate a briefcase and generate a signed egress receipt.
   *
   * Core evaluation loop:
   * 1. Load enabled predicates for this user
   * 2. Sort by ID (F4.1 guarantee)
   * 3. Execute each until non-PASS
   * 4. Build decision
   * 5. Sign receipt
   */
  async evaluate(
    briefcase: Briefcase,
    user_config: UserGateConfig,
    substrate_health: SubstrateHealth,
    source_substrate: string,
    briefcase_id: string,
    user_id: string
  ): Promise<{ decision: GateDecision; receipt: EgressReceipt }> {
    const timestamp = new Date().toISOString();

    // Build evaluation context
    const context: EvaluationContext = {
      source_substrate,
      substrate_health,
      user_id,
      timestamp,
      briefcase_id,
    };

    // F4.1: Sort predicates by ID for deterministic ordering
    const enabled_ids = user_config.enabled_predicates.sort();
    const predicates_to_run: Predicate[] = [];

    for (const pred_id of enabled_ids) {
      const pred = this.predicate_registry.get(pred_id);
      if (!pred) {
        console.warn(`[GateDaemon] Predicate ${pred_id} not found in registry`);
        continue;
      }
      predicates_to_run.push(pred);
    }

    // Execute predicates, collect results
    const predicate_evaluations: PredicateEvaluation[] = [];
    let gate_decision: GateDecision = {
      result: 'PASS',
      predicate_evaluations: [],
      timestamp,
    };

    let first_non_pass: PredicateEvaluation | null = null;

    for (const pred of predicates_to_run) {
      const eval_start = Date.now();

      try {
        // F4.2: Substrate health may cause predicate to HOLD
        // (Check: if predicate requires nervous_system and it's unavailable, HOLD)
        if (
          pred.tags.includes('requires-nervous-system') &&
          !substrate_health.nervous_system
        ) {
          predicate_evaluations.push({
            predicate_id: pred.id,
            predicate_name: pred.name,
            result: 'HOLD',
            duration_ms: Date.now() - eval_start,
            timestamp: new Date().toISOString(),
          });
          first_non_pass =
            predicate_evaluations[predicate_evaluations.length - 1];
          break; // F4.1: Stop on first non-PASS
        }

        // Execute predicate with timeout
        const timeout_ms = pred.timeout_ms ?? 5000;
        const result = await Promise.race([
          Promise.resolve(pred.evaluate(briefcase, context)),
          new Promise<PredicateResult>((_, reject) =>
            setTimeout(() => reject(new Error('Predicate timeout')), timeout_ms)
          ),
        ]);

        predicate_evaluations.push({
          predicate_id: pred.id,
          predicate_name: pred.name,
          result,
          duration_ms: Date.now() - eval_start,
          timestamp: new Date().toISOString(),
        });

        // First non-PASS wins — stop evaluation immediately (F4.1)
        if (result !== 'PASS') {
          first_non_pass =
            predicate_evaluations[predicate_evaluations.length - 1];
          break;
        }
      } catch (error) {
        const error_msg =
          error instanceof Error ? error.message : 'Unknown error';
        predicate_evaluations.push({
          predicate_id: pred.id,
          predicate_name: pred.name,
          result: 'REJECT',
          duration_ms: Date.now() - eval_start,
          error: error_msg,
          timestamp: new Date().toISOString(),
        });
        first_non_pass =
          predicate_evaluations[predicate_evaluations.length - 1];
        break; // F4.1: Stop on first error
      }
    }

    // Build final decision
    if (first_non_pass) {
      gate_decision = {
        result: first_non_pass.result,
        triggered_predicate_id: first_non_pass.predicate_id,
        reason: `Predicate ${first_non_pass.predicate_name} returned ${first_non_pass.result}`,
        predicate_evaluations,
        timestamp,
      };
    } else {
      gate_decision = {
        result: 'PASS',
        predicate_evaluations,
        timestamp,
      };
    }

    // F4.3: Sign receipt with HMAC-SHA256
    const receipt = this.signEgressReceipt(
      {
        briefcase_id,
        gate_version: this.gate_version,
        timestamp,
        predicate_hashes_checked: predicates_to_run.map((p) => p.hash),
        result: gate_decision.result,
        predicate_triggered: gate_decision.triggered_predicate_id,
      },
      this.gate_key
    );

    return { decision: gate_decision, receipt };
  }

  /**
   * Sign an egress receipt (F4.3)
   * Canonical form ensures deterministic signatures.
   */
  private signEgressReceipt(
    receipt: Omit<EgressReceipt, 'gate_process_signature'>,
    gateKey: Buffer
  ): EgressReceipt {
    const canonical = this.canonicalReceipt(receipt);
    const sig = createHmac('sha256', gateKey).update(canonical).digest('hex');
    return { ...receipt, gate_process_signature: sig };
  }

  /**
   * Canonical receipt format for signature (deterministic JSON)
   */
  private canonicalReceipt(
    r: Omit<EgressReceipt, 'gate_process_signature'>
  ): string {
    return JSON.stringify({
      briefcase_id: r.briefcase_id,
      gate_version: r.gate_version,
      timestamp: r.timestamp,
      predicate_hashes_checked: [...r.predicate_hashes_checked].sort(),
      result: r.result,
      predicate_triggered: r.predicate_triggered ?? null,
    });
  }

  /**
   * Verify a receipt signature (used by W0.1 at briefcase load)
   */
  static verifyEgressReceipt(
    receipt: EgressReceipt | undefined,
    gateKey: Buffer
  ): { ok: true } | { ok: false; reason: string } {
    if (!receipt) return { ok: false, reason: 'egress-receipt missing' };
    if (!receipt.gate_process_signature) {
      return { ok: false, reason: 'gate signature missing' };
    }
    if (receipt.result !== 'PASS') {
      return { ok: false, reason: `gate result not PASS: ${receipt.result}` };
    }

    const { gate_process_signature, ...rest } = receipt;
    const canonical = JSON.stringify({
      briefcase_id: rest.briefcase_id,
      gate_version: rest.gate_version,
      timestamp: rest.timestamp,
      predicate_hashes_checked: [...rest.predicate_hashes_checked].sort(),
      result: rest.result,
      predicate_triggered: rest.predicate_triggered ?? null,
    });

    const expected = createHmac('sha256', gateKey)
      .update(canonical)
      .digest('hex');

    if (expected.length !== gate_process_signature.length) {
      return { ok: false, reason: 'gate signature length mismatch' };
    }

    // Constant-time comparison
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ gate_process_signature.charCodeAt(i);
    }

    if (mismatch !== 0) return { ok: false, reason: 'gate signature invalid' };
    return { ok: true };
  }
}

/**
 * Create a gate daemon with default (app-provided) predicates
 */
export function createDefaultGateDaemon(
  gate_key: Buffer,
  gate_version?: string
): GateDaemon {
  // Default predicate set (will expand as W0.4 develops)
  const default_predicates: Predicate[] = [];

  return new GateDaemon(default_predicates, gate_key, gate_version);
}
