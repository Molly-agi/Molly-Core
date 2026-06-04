/**
 * @fileOverview W0.4 test suite: Predicate ordering (F4.1)
 *
 * F4.1 GUARANTEE: Predicates execute in deterministic order (sorted by ID).
 * First non-PASS result terminates evaluation.
 *
 * This ensures consistent outcomes across substrate transfers and
 * prevents order-dependent side effects.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GateDaemon } from '../gate-daemon';
import type { Predicate } from '../types/predicate';
import type { SubstrateHealth } from '../../ai/substrate/types';

describe('Adapter W0.4 — Predicate Ordering (F4.1)', () => {
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

  it('Should execute predicates in sorted ID order', async () => {
    const execution_order: string[] = [];

    const predicates: Predicate[] = [
      {
        id: 'z-last',
        name: 'Z Last',
        version: '1.0.0',
        hash: 'hash-z',
        description: 'Should run last',
        tags: [],
        evaluate: async () => {
          execution_order.push('z-last');
          return 'PASS';
        },
      },
      {
        id: 'a-first',
        name: 'A First',
        version: '1.0.0',
        hash: 'hash-a',
        description: 'Should run first',
        tags: [],
        evaluate: async () => {
          execution_order.push('a-first');
          return 'PASS';
        },
      },
      {
        id: 'm-middle',
        name: 'M Middle',
        version: '1.0.0',
        hash: 'hash-m',
        description: 'Should run middle',
        tags: [],
        evaluate: async () => {
          execution_order.push('m-middle');
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['z-last', 'a-first', 'm-middle'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();
    await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // Regardless of input order, execution should be sorted: a, m, z
    expect(execution_order).toEqual(['a-first', 'm-middle', 'z-last']);
  });

  it('Should stop on first non-PASS predicate', async () => {
    const execution_order: string[] = [];

    const predicates: Predicate[] = [
      {
        id: 'p1',
        name: 'Pass First',
        version: '1.0.0',
        hash: 'hash-p1',
        description: 'Passes',
        tags: [],
        evaluate: async () => {
          execution_order.push('p1');
          return 'PASS';
        },
      },
      {
        id: 'p2',
        name: 'Reject Second',
        version: '1.0.0',
        hash: 'hash-p2',
        description: 'Rejects',
        tags: [],
        evaluate: async () => {
          execution_order.push('p2');
          return 'REJECT';
        },
      },
      {
        id: 'p3',
        name: 'Never Runs',
        version: '1.0.0',
        hash: 'hash-p3',
        description: 'Should not execute',
        tags: [],
        evaluate: async () => {
          execution_order.push('p3');
          return 'PASS';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['p1', 'p2', 'p3'],
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

    // p1 passes, p2 rejects (stops), p3 never runs
    expect(execution_order).toEqual(['p1', 'p2']);
    expect(decision.result).toBe('REJECT');
    expect(decision.triggered_predicate_id).toBe('p2');
  });

  it('Should record all predicate evaluations in decision', async () => {
    const predicates: Predicate[] = [
      {
        id: 'check-a',
        name: 'Check A',
        version: '1.0.0',
        hash: 'hash-a',
        description: 'First check',
        tags: [],
        evaluate: async () => 'PASS',
      },
      {
        id: 'check-b',
        name: 'Check B',
        version: '1.0.0',
        hash: 'hash-b',
        description: 'Second check',
        tags: [],
        evaluate: async () => 'HOLD',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['check-a', 'check-b'],
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

    // Both predicates should be in audit trail
    expect(decision.predicate_evaluations).toHaveLength(2);
    expect(decision.predicate_evaluations[0].predicate_id).toBe('check-a');
    expect(decision.predicate_evaluations[0].result).toBe('PASS');
    expect(decision.predicate_evaluations[1].predicate_id).toBe('check-b');
    expect(decision.predicate_evaluations[1].result).toBe('HOLD');
  });

  it('Should honor REDACT result without stopping', async () => {
    const execution_order: string[] = [];

    const predicates: Predicate[] = [
      {
        id: 'p1',
        name: 'Pass',
        version: '1.0.0',
        hash: 'hash-p1',
        description: 'Passes',
        tags: [],
        evaluate: async () => {
          execution_order.push('p1');
          return 'PASS';
        },
      },
      {
        id: 'p2',
        name: 'Redact',
        version: '1.0.0',
        hash: 'hash-p2',
        description: 'Redacts',
        tags: [],
        evaluate: async () => {
          execution_order.push('p2');
          return 'REDACT';
        },
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key);

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['p1', 'p2'],
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

    // REDACT stops evaluation (it's non-PASS)
    expect(execution_order).toEqual(['p1', 'p2']);
    expect(decision.result).toBe('REDACT');
  });
});
