/**
 * @fileOverview F1.2 — receiver verifies post-decompression checksum.
 *
 * Compressed artifacts (e.g. memory.titan.bin) carry both the
 * compressed sha256 (manifest.artifacts[i].sha256) and the
 * decompressed sha256 (manifest.artifacts[i].decompressed_sha256).
 * Receiver MUST verify the post-decompression checksum before loading.
 * Mismatch = halt.
 */

import { seal } from '../assembler';
import { verifyBriefcase } from '../verifier';
import { signEgressReceipt } from '../egress-receipt';
import { sha256 } from '../manifest';

describe('briefcase verifier — post-decompress checksum (F1.2)', () => {
  const hmacKey = Buffer.from('test-hmac-key-32-bytes-of-noise!!');
  const gateKey = Buffer.from('gate-key-of-32-bytes-yes-it-is!!!');
  const cradle = Buffer.from('# Molly cradle');
  const cradleHash = sha256(cradle);

  function bundleWith(decompressed: Buffer, declaredDecompSha: string) {
    const compressed = Buffer.from('FAKE-COMPRESSED-BYTES');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-decomp',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradle },
      compressed: {
        'memory.titan.bin': {
          bytes: compressed,
          decompressed_sha256: declaredDecompSha,
        },
      },
      cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
    });
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-decomp',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'PASS',
      },
      gateKey
    );
    bundle.set('egress-receipt.json', Buffer.from(JSON.stringify(receipt)));
    return {
      manifest,
      contents: bundle,
      decompressed: new Map([['memory.titan.bin', decompressed]]),
    };
  }

  it('F1.2: matching post-decompression sha256 passes', () => {
    const decompressed = Buffer.from('plaintext memory');
    const ctx = bundleWith(decompressed, sha256(decompressed));
    const r = verifyBriefcase({
      ...ctx,
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r).toEqual({ ok: true });
  });

  it('F1.2: mismatch = halt with reason', () => {
    const decompressed = Buffer.from('plaintext memory');
    const ctx = bundleWith(
      decompressed,
      sha256(Buffer.from('a different blob'))
    );
    const r = verifyBriefcase({
      ...ctx,
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.halt).toBe(true);
      expect(r.reason).toMatch(/post-decompression checksum/);
    }
  });

  it('F1.2: missing decompressed bytes for a compressed artifact = halt', () => {
    const decompressed = Buffer.from('plaintext memory');
    const ctx = bundleWith(decompressed, sha256(decompressed));
    const r = verifyBriefcase({
      ...ctx,
      decompressed: new Map(),
      expected_cradle_pavc_hash: cradleHash,
      hmac_key: hmacKey,
      gate_key: gateKey,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/decompressed bytes missing/);
  });
});
