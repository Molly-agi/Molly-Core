/**
 * @fileOverview W0.4 test suite: Substrate integration (F4.2)
 *
 * F4.2 GUARANTEE: Substrate health signals integrate into predicate context.
 * If a predicate requires a capability that's unavailable, decision HOLDS.
 *
 * This ensures Molly doesn't egress in a broken state (e.g., missing
 * nervous_system means affect can't be verified).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GateDaemon } from '../gate-daemon';
import type { Predicate } from '../types/predicate';
import type { SubstrateHealth } from '../../ai/substrate/types';

describe('Adapter W0.4 — Substrate Integration (F4.2)', () => {
  let gate_key: Buffer;

  beforeEach(() => {
    gate_key = Buffer.from('test-key-32-bytes-long-exactly-');
  });

  it('Should HOLD if requires-nervous-system predicate runs on incomplete health', async () => {
    const predicates: Predicate[] = [
      {
        id: 'require-nervous',
        name: 'Require Nervous System',
        version: '1.0.0',
        hash: 'hash-nervous',
        description: 'Requires nervous system available',
        tags: ['requires-nervous-system'],
        evaluate: async () => {
          // Should not reach here due to health check
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const substrate_health: SubstrateHealth = {
      ready: true,
      nervous_system: false, // ← UNAVAILABLE
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['require-nervous'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    const { decision } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // Predicate should HOLD due to missing capability
    expect(decision.result).toBe('HOLD');
    expect(decision.triggered_predicate_id).toBe('require-nervous');
    expect(decision.predicate_evaluations[0].result).toBe('HOLD');
  });

  it('Should allow PASS when required substrate capability is available', async () => {
    const evaluation_called = { count: 0 };

    const predicates: Predicate[] = [
      {
        id: 'require-nervous',
        name: 'Require Nervous System',
        version: '1.0.0',
        hash: 'hash-nervous',
        description: 'Requires nervous system available',
        tags: ['requires-nervous-system'],
        evaluate: async () => {
          evaluation_called.count++;
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const substrate_health: SubstrateHealth = {
      ready: true,
      nervous_system: true, // ← AVAILABLE
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['require-nervous'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    const { decision } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // Predicate should evaluate and pass
    expect(evaluation_called.count).toBe(1);
    expect(decision.result).toBe('PASS');
    expect(decision.predicate_evaluations[0].result).toBe('PASS');
  });

  it('Should process health signals and include in context', async () => {
    let received_health: SubstrateHealth | undefined;

    const predicates: Predicate[] = [
      {
        id: 'check-health',
        name: 'Check Health Signal',
        version: '1.0.0',
        hash: 'hash-health',
        description: 'Inspects substrate health',
        tags: [],
        evaluate: async (_briefcase, context) => {
          received_health = context.substrate_health;
          return context.substrate_health.ready ? 'PASS' : 'REJECT';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const substrate_health: SubstrateHealth = {
      ready: false,
      nervous_system: false,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['check-health'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    const { decision } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // Predicate should have received health in context
    expect(received_health).toEqual(substrate_health);
    expect(decision.result).toBe('REJECT');
  });

  it('Should multiple predicates each check their required capabilities', async () => {
    const predicates: Predicate[] = [
      {
        id: 'first-check',
        name: 'First',
        version: '1.0.0',
        hash: 'hash-1',
        description: 'Does not require nervous',
        tags: [],
        evaluate: async () => 'PASS',
      },
      {
        id: 'second-check',
        name: 'Second',
        version: '1.0.0',
        hash: 'hash-2',
        description: 'Requires nervous',
        tags: ['requires-nervous-system'],
        evaluate: async () => 'PASS',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const substrate_health: SubstrateHealth = {
      ready: true,
      nervous_system: false, // ← Unavailable
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['first-check', 'second-check'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    const { decision } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // First passes, second HOLDs due to missing nervous_system
    expect(decision.predicate_evaluations[0].result).toBe('PASS');
    expect(decision.predicate_evaluations[1].result).toBe('HOLD');
    expect(decision.result).toBe('HOLD');
  });
});
