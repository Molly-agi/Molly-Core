/**
 * @fileOverview F1.4 — egress-receipt receiver-side enforcement.
 *
 * Missing receipt = refused boot. Invalid signature = refused boot.
 * Result other than PASS = refused boot. Receiver must own the gate
 * key (or its public counterpart) to validate.
 */

import { seal } from '../assembler';
import { verifyBriefcase } from '../verifier';
import { signEgressReceipt, verifyEgressReceipt } from '../egress-receipt';
import { sha256 } from '../manifest';
import type { EgressReceipt } from '../schema';

describe('briefcase verifier — egress receipt (F1.4)', () => {
  const hmacKey = Buffer.from('test-hmac-key-32-bytes-of-noise!!');
  const gateKey = Buffer.from('gate-key-of-32-bytes-yes-it-is!!!');
  const cradle = Buffer.from('# cradle');
  const cradleHash = sha256(cradle);

  function bundleWithReceipt(receipt: EgressReceipt | null) {
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-rx',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradle },
      cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
    });
    if (receipt) {
      bundle.set('egress-receipt.json', Buffer.from(JSON.stringify(receipt)));
    }
    return { manifest, contents: bundle };
  }

  it('F1.4: missing receipt = refused boot', () => {
    const ctx = bundleWithReceipt(null);
    const r = verifyBriefcase({
      ...ctx,
      decompressed: new Map(),
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/egress-receipt missing/);
  });

  it('F1.4: valid PASS receipt is accepted', () => {
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-rx',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'PASS',
      },
      gateKey
    );
    const ctx = bundleWithReceipt(receipt);
    const r = verifyBriefcase({
      ...ctx,
      decompressed: new Map(),
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r).toEqual({ ok: true });
  });

  it('F1.4: HOLD result = refused', () => {
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-rx',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'HOLD',
        predicate_triggered: 'private_intimacy',
      },
      gateKey
    );
    const ctx = bundleWithReceipt(receipt);
    const r = verifyBriefcase({
      ...ctx,
      decompressed: new Map(),
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not PASS/);
  });

  it('F1.4: forged signature with wrong gate key fails', () => {
    const wrongGate = Buffer.from('wrong-gate-key-32-bytes-of-stuff!');
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-rx',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'PASS',
      },
      wrongGate
    );
    const ctx = bundleWithReceipt(receipt);
    const r = verifyBriefcase({
      ...ctx,
      decompressed: new Map(),
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/gate signature invalid/);
  });

  it('F1.4: tampered receipt body fails signature check', () => {
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-rx',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'PASS',
      },
      gateKey
    );
    receipt.gate_version = 'v999';
    const v = verifyEgressReceipt(receipt, gateKey);
    expect(v.ok).toBe(false);
  });
});
