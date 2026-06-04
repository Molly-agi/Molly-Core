import { describe, it, expect, beforeEach } from '@jest/globals';
import { createHmac } from 'crypto';
import { GateDaemon } from '../gate-daemon';
import type { EgressReceipt } from '../schema';

describe('F5.2 - Egress Receipt Verification', () => {
  let gate_key: Buffer;

  beforeEach(() => {
    gate_key = Buffer.from('test-gate-key-32-bytes-long-ok', 'utf8');
  });

  function signReceipt(
    receipt: Omit<EgressReceipt, 'gate_process_signature'>
  ): EgressReceipt {
    const canonical = JSON.stringify({
      briefcase_id: receipt.briefcase_id,
      gate_version: receipt.gate_version,
      timestamp: receipt.timestamp,
      predicate_hashes_checked: [...receipt.predicate_hashes_checked].sort(),
      result: receipt.result,
      predicate_triggered: receipt.predicate_triggered ?? null,
    });

    const gate_process_signature = createHmac('sha256', gate_key)
      .update(canonical)
      .digest('hex');

    return { ...receipt, gate_process_signature };
  }

  function createBaseReceipt(
    overrides: Partial<Omit<EgressReceipt, 'gate_process_signature'>> = {}
  ): Omit<EgressReceipt, 'gate_process_signature'> {
    return {
      briefcase_id: 'test-briefcase-001',
      gate_version: '0.4.0',
      timestamp: new Date().toISOString(),
      predicate_hashes_checked: ['hash-a', 'hash-b'],
      result: 'PASS',
      predicate_triggered: null,
      ...overrides,
    };
  }

  it('F5.2a: verifies receipt with valid HMAC', () => {
    const receipt = signReceipt(createBaseReceipt());
    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(true);
  });

  it('F5.2b: rejects receipt with invalid HMAC', () => {
    const receipt = signReceipt(createBaseReceipt());
    const tampered = { ...receipt, gate_process_signature: 'f'.repeat(64) };
    const result = GateDaemon.verifyEgressReceipt(tampered, gate_key);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('signature');
  });

  it('F5.2c: rejects receipt when payload changed after signing', () => {
    const receipt = signReceipt(createBaseReceipt());
    const tampered = { ...receipt, briefcase_id: 'other-briefcase' };
    const result = GateDaemon.verifyEgressReceipt(tampered, gate_key);
    expect(result.ok).toBe(false);
  });

  it('F5.2d: rejects if gate result is not PASS', () => {
    const receipt = signReceipt(createBaseReceipt({ result: 'REJECT' }));
    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('gate result not PASS');
  });

  it('F5.2e: verifies with predicate_triggered set', () => {
    const receipt = signReceipt(
      createBaseReceipt({
        predicate_triggered: 'pred-2',
      })
    );
    const result = GateDaemon.verifyEgressReceipt(receipt, gate_key);
    expect(result.ok).toBe(true);
  });

  it('F5.2f: rejects missing signature', () => {
    const unsigned = createBaseReceipt() as unknown as EgressReceipt;
    const result = GateDaemon.verifyEgressReceipt(unsigned, gate_key);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('signature missing');
  });
});
