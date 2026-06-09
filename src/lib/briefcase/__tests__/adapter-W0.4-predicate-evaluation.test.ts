/**
 * @fileOverview W0.4 test suite: General predicate evaluation
 *
 * Edge cases and general evaluation scenarios:
 * - Async predicate handling
 * - Timeout enforcement
 * - Error handling
 * - User config overrides
 * - Audit trail completeness
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GateDaemon } from '../gate-daemon';
import type { Predicate } from '../types/predicate';
import type { SubstrateHealth } from '../../ai/substrate/types';

describe('Adapter W0.4 — Predicate Evaluation (General)', () => {
  let gate_key: Buffer;
  let substrate_health: SubstrateHealth;

  beforeEach(() => {
    gate_key = Buffer.from('test-key-32-bytes-long-exactly-');
    substrate_health = {
      ready: true,
      nervous_system: true,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;
  });

  it('Should handle async predicates', async () => {
    const predicates: Predicate[] = [
      {
        id: 'async-check',
        name: 'Async Check',
        version: '1.0.0',
        hash: 'hash-async',
        description: 'Async predicate',
        tags: [],
        evaluate: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['async-check'],
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

    expect(decision.result).toBe('PASS');
  });

  it('Should enforce predicate timeout', async () => {
    const predicates: Predicate[] = [
      {
        id: 'slow-predicate',
        name: 'Slow',
        version: '1.0.0',
        hash: 'hash-slow',
        description: 'Slow predicate',
        tags: [],
        timeout_ms: 100,
        evaluate: async () => {
          await new Promise((r) => setTimeout(r, 500)); // Exceeds timeout
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['slow-predicate'],
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

    // Timeout should result in REJECT
    expect(decision.result).toBe('REJECT');
    expect(decision.predicate_evaluations[0].error).toContain(
      'Predicate timeout'
    );
  });

  it('Should catch and report predicate errors', async () => {
    const predicates: Predicate[] = [
      {
        id: 'error-predicate',
        name: 'Error',
        version: '1.0.0',
        hash: 'hash-error',
        description: 'Throws error',
        tags: [],
        evaluate: async () => {
          throw new Error('Predicate execution failed');
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['error-predicate'],
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

    // Error should result in REJECT with message
    expect(decision.result).toBe('REJECT');
    expect(decision.predicate_evaluations[0].error).toContain('failed');
  });

  it('Should record timing information per predicate', async () => {
    const predicates: Predicate[] = [
      {
        id: 'timed-check',
        name: 'Timed',
        version: '1.0.0',
        hash: 'hash-timed',
        description: 'Timed predicate',
        tags: [],
        evaluate: async () => {
          await new Promise((r) => setTimeout(r, 20));
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['timed-check'],
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

    // Duration should be recorded and reflect the real delay (with timer jitter buffer)
    expect(
      decision.predicate_evaluations[0].duration_ms
    ).toBeGreaterThanOrEqual(5);
  });

  it('Should build complete audit trail in decision', async () => {
    const predicates: Predicate[] = [
      {
        id: 'pred-1',
        name: 'First',
        version: '1.0.0',
        hash: 'hash-1',
        description: 'First predicate',
        tags: [],
        evaluate: async () => 'PASS',
      },
      {
        id: 'pred-2',
        name: 'Second',
        version: '1.0.0',
        hash: 'hash-2',
        description: 'Second predicate',
        tags: [],
        evaluate: async () => 'HOLD',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['pred-1', 'pred-2'],
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

    // Audit trail should include both evaluations
    expect(decision.predicate_evaluations).toHaveLength(2);
    expect(decision.predicate_evaluations[0].predicate_id).toBe('pred-1');
    expect(decision.predicate_evaluations[1].predicate_id).toBe('pred-2');

    // Decision should reference triggered predicate
    expect(decision.triggered_predicate_id).toBe('pred-2');
    expect(decision.reason).toContain('Second'); // Predicate name is "Second"
  });

  it('Should include gate version in receipt', async () => {
    const predicates: Predicate[] = [
      {
        id: 'simple',
        name: 'Simple',
        version: '1.0.0',
        hash: 'hash-simple',
        description: 'Simple',
        tags: [],
        evaluate: async () => 'PASS',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key, '0.4.1');

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['simple'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    const { receipt } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    expect(receipt.gate_version).toBe('0.4.1');
  });

  it('Should handle empty predicate list (PASS by default)', async () => {
    const daemon = new GateDaemon([], gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: [],
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

    // No predicates = no gate blocking
    expect(decision.result).toBe('PASS');
    expect(decision.predicate_evaluations).toHaveLength(0);
  });
});
