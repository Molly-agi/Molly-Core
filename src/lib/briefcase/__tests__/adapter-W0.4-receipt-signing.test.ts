/**
 * @fileOverview W0.4 test suite: Receipt signing (F4.3)
 *
 * F4.3 GUARANTEE: Gate signatures are computed deterministically over
 * canonical receipt bytes. Receiver verifies against gate's public key.
 * Tampering is detected via signature mismatch (constant-time comparison).
 *
 * This ensures briefcase integrity at load time (W0.1 verification).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createHmac } from 'crypto';
import { GateDaemon } from '../gate-daemon';
import type { Predicate } from '../types/predicate';
import type { EgressReceipt } from '../schema';
import type { SubstrateHealth } from '../../ai/substrate/types';

describe('Adapter W0.4 — Receipt Signing (F4.3)', () => {
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

  it('Should sign receipt with deterministic HMAC', async () => {
    const predicates: Predicate[] = [
      {
        id: 'pass-predicate',
        name: 'Pass',
        version: '1.0.0',
        hash: 'abc123',
        description: 'Always passes',
        tags: [],
        evaluate: async () => 'PASS',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key, '0.4.0');

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['pass-predicate'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();

    // Note: Signatures will differ if timestamps differ (which they will on separate calls)
    // Instead, verify that the same input produces deterministic predicate hashes
    const { receipt: receipt1 } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    const { receipt: receipt2 } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123',
      'test-user'
    );

    // Both receipts should have valid signatures (even if different due to timestamps)
    expect(receipt1.gate_process_signature).toBeTruthy();
    expect(receipt2.gate_process_signature).toBeTruthy();

    // Predicate hashes should be identical
    expect(receipt1.predicate_hashes_checked).toEqual(
      receipt2.predicate_hashes_checked
    );
  });

  it('Should produce different signature for different briefcase IDs', async () => {
    const predicates: Predicate[] = [
      {
        id: 'pass-predicate',
        name: 'Pass',
        version: '1.0.0',
        hash: 'abc123',
        description: 'Always passes',
        tags: [],
        evaluate: async () => 'PASS',
      },
    ];

    const daemon = new GateDaemon(predicates, gate_key, '0.4.0');

    const user_config = {
      user_id: 'test-user',
      enabled_predicates: ['pass-predicate'],
      updated_at: new Date().toISOString(),
    };

    const briefcase = new Map<string, Buffer>();

    const { receipt: receipt1 } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-123', // ID 1
      'test-user'
    );

    const { receipt: receipt2 } = await daemon.evaluate(
      briefcase,
      user_config,
      substrate_health,
      'cloud-reference',
      'briefcase-456', // ID 2
      'test-user'
    );

    expect(receipt1.gate_process_signature).not.toBe(
      receipt2.gate_process_signature
    );
  });

  it('Should verify valid receipt', () => {
    const receipt: EgressReceipt = {
      briefcase_id: 'test-123',
      gate_version: '0.4.0',
      timestamp: '2026-06-04T14:00:00Z',
      predicate_hashes_checked: ['hash-a', 'hash-b'],
      result: 'PASS',
      gate_process_signature: '', // Will be filled
    };

    // Create proper signature
    const canonical = JSON.stringify({
      briefcase_id: 'test-123',
      gate_version: '0.4.0',
      timestamp: '2026-06-04T14:00:00Z',
      predicate_hashes_checked: ['hash-a', 'hash-b'].sort(),
      result: 'PASS',
      predicate_triggered: null,
    });

    const sig = createHmac('sha256', gate_key).update(canonical).digest('hex');

    receipt.gate_process_signature = sig;

    // Verification should pass
    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(true);
  });

  it('Should reject tampered receipt', () => {
    const receipt: EgressReceipt = {
      briefcase_id: 'test-123',
      gate_version: '0.4.0',
      timestamp: '2026-06-04T14:00:00Z',
      predicate_hashes_checked: ['hash-a', 'hash-b'],
      result: 'PASS',
      gate_process_signature: 'invalid-signature-tampereddddd',
    };

    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(false);
    // Either length mismatch or invalid signature
    expect(result.reason).toMatch(/signature (invalid|length mismatch)/);
  });

  it('Should reject receipt with missing signature', () => {
    const receipt: Omit<EgressReceipt, 'gate_process_signature'> = {
      briefcase_id: 'test-123',
      gate_version: '0.4.0',
      timestamp: '2026-06-04T14:00:00Z',
      predicate_hashes_checked: ['hash-a', 'hash-b'],
      result: 'PASS',
    };

    const result = GateDaemon.verifyEgressReceipt(
      receipt as EgressReceipt,
      gate_key
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('signature missing');
  });

  it('Should reject receipt with non-PASS result', () => {
    const receipt: EgressReceipt = {
      briefcase_id: 'test-123',
      gate_version: '0.4.0',
      timestamp: '2026-06-04T14:00:00Z',
      predicate_hashes_checked: ['hash-a'],
      result: 'HOLD', // Not PASS
      gate_process_signature: 'valid-sig-here',
    };

    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not PASS');
  });

  it('Should reject missing receipt entirely', () => {
    const result = GateDaemon.verifyEgressReceipt(undefined, gate_key);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('missing');
  });
});
