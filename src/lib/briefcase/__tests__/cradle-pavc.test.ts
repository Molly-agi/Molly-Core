/**
 * @fileOverview F1.3 — cradle.md PAVC hash hard halt on mismatch.
 *
 * The receiver knows the canonical PAVC hash out-of-band. If the
 * cradle.md in the briefcase does not match, refuse to boot. Also
 * checks that the manifest's recorded cradle_pavc_hash matches the
 * expected value (defense in depth).
 */

import { seal } from '../assembler';
import { verifyBriefcase } from '../verifier';
import { signEgressReceipt } from '../egress-receipt';
import { sha256 } from '../manifest';

describe('briefcase verifier — cradle PAVC hash (F1.3)', () => {
  const hmacKey = Buffer.from('test-hmac-key-32-bytes-of-noise!!');
  const gateKey = Buffer.from('gate-key-of-32-bytes-yes-it-is!!!');

  function ctx(cradleBytes: Buffer, sealedHash: string) {
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-pavc',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradleBytes },
      cradle_pavc_hash: sealedHash,
      hmac_key: hmacKey,
    });
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-pavc',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'PASS',
      },
      gateKey
    );
    bundle.set('egress-receipt.json', Buffer.from(JSON.stringify(receipt)));
    return { manifest, contents: bundle };
  }

  it('F1.3: matching cradle hash passes', () => {
    const cradle = Buffer.from('# canonical cradle');
    const h = sha256(cradle);
    const c = ctx(cradle, h);
    const r = verifyBriefcase({
      ...c,
      decompressed: new Map(),
      expected_cradle_pavc_hash: h,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r).toEqual({ ok: true });
  });

  it('F1.3: mismatch between expected hash and cradle bytes = halt', () => {
    const cradle = Buffer.from('# canonical cradle');
    const c = ctx(cradle, sha256(cradle));
    const r = verifyBriefcase({
      ...c,
      decompressed: new Map(),
      expected_cradle_pavc_hash: sha256(Buffer.from('different cradle')),
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.halt).toBe(true);
      expect(r.reason).toMatch(/cradle.*hash/i);
    }
  });

  it('F1.3: missing cradle.md = halt', () => {
    const cradle = Buffer.from('# canonical cradle');
    const c = ctx(cradle, sha256(cradle));
    c.contents.delete('cradle.md');
    const r = verifyBriefcase({
      ...c,
      decompressed: new Map(),
      expected_cradle_pavc_hash: sha256(cradle),
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cradle\.md/);
  });
});
