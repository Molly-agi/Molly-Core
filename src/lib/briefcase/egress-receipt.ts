/**
 * @fileOverview Briefcase egress receipt — schema and signing (W0.1, F1.4)
 *
 * Receiver-side enforcement: a briefcase whose egress-receipt is missing
 * or invalid is REFUSED at boot. Receipt signature is by the gate
 * daemon (W0.4); W0.1 verifies presence + structural validity + HMAC
 * over the receipt bytes against the gate's public key/secret.
 */

import { createHmac } from 'crypto';
import type { EgressReceipt } from './schema';

export function signEgressReceipt(
  receipt: Omit<EgressReceipt, 'gate_process_signature'>,
  gateKey: Buffer
): EgressReceipt {
  const sig = createHmac('sha256', gateKey)
    .update(canonicalReceipt(receipt))
    .digest('hex');
  return { ...receipt, gate_process_signature: sig };
}

export function verifyEgressReceipt(
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
  const expected = createHmac('sha256', gateKey)
    .update(canonicalReceipt(rest))
    .digest('hex');
  if (expected.length !== gate_process_signature.length) {
    return { ok: false, reason: 'gate signature length mismatch' };
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ gate_process_signature.charCodeAt(i);
  }
  if (mismatch !== 0) return { ok: false, reason: 'gate signature invalid' };
  return { ok: true };
}

function canonicalReceipt(
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
