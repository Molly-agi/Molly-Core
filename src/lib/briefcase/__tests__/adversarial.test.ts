/**
 * @fileOverview Atlas adversarial review — W0.1 briefcase format
 *
 * Six questions Atlas asked during the Lazarus+Atlas+Molly review session
 * (bridge messages msg_1780538723845* batch, 2026-06-04).  Each section is
 * labelled with the question it answers.
 *
 * Q1  Test assertions: do they fail with broken impl, or green regardless?
 * Q2  F1.1: does ANY tamper bypass?
 * Q3  F1.2: is the decompressed-sha check before or after load?
 * Q4  F1.3: hard halt or soft warning?
 * Q5  F1.4: missing receipt blocks boot?
 * Q6  F1.5: extra bundle entries not in manifest — are they caught?
 */

import { seal } from '../assembler';
import { verifyBriefcase } from '../verifier';
import { computeManifestHmac, verifyManifestHmac, sha256 } from '../manifest';
import { signEgressReceipt } from '../egress-receipt';
import type { Manifest } from '../schema';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const HMAC_KEY = Buffer.from('test-hmac-key-32-bytes-of-noise!!');
const GATE_KEY = Buffer.from('gate-key-of-32-bytes-yes-it-is!!!');
const CRADLE = Buffer.from('# canonical cradle body');
const CRADLE_HASH = sha256(CRADLE);

function goodReceipt(briefcase_id: string) {
  return signEgressReceipt(
    {
      briefcase_id,
      gate_version: 'v0',
      timestamp: '2026-06-04T00:00:00Z',
      predicate_hashes_checked: ['p1'],
      result: 'PASS',
    },
    GATE_KEY
  );
}

/** Seal a minimal valid briefcase and attach a valid egress receipt. */
function freshBundle(id = 'bc-adv') {
  const { manifest, bundle } = seal({
    briefcase_id: id,
    source_substrate: 'codespace',
    required: { 'cradle.md': CRADLE, 'memory.titan.bin': Buffer.from('m') },
    cradle_pavc_hash: CRADLE_HASH,
    hmac_key: HMAC_KEY,
  });
  bundle.set(
    'egress-receipt.json',
    Buffer.from(JSON.stringify(goodReceipt(id)))
  );
  return { manifest, bundle };
}

function verifyFull(manifest: Manifest, contents: Map<string, Buffer>) {
  return verifyBriefcase({
    manifest,
    contents,
    decompressed: new Map(),
    expected_cradle_pavc_hash: CRADLE_HASH,
    hmac_key: HMAC_KEY,
    gate_key: GATE_KEY,
  });
}

// ─── Q1: Test assertions actually exercise the implementation ────────────────
// Each assertion below expects a specific FAILURE; a no-op verifier would
// return { ok: true } everywhere and trip these checks.

describe('Q1 — test assertions fail with broken impl', () => {
  it('a tampered manifest does NOT verify (would be green if checks were no-ops)', () => {
    const { manifest } = freshBundle();
    const tampered: Manifest = { ...manifest, version: '9.9' };
    expect(verifyManifestHmac(tampered, HMAC_KEY)).toBe(false);
  });

  it('a wrong gate key does NOT accept a receipt (idem)', () => {
    const wrongKey = Buffer.from('not-the-real-gate-key-32-bytes!!');
    const receipt = goodReceipt('bc-q1');
    const { manifest, bundle } = freshBundle('bc-q1');
    bundle.set('egress-receipt.json', Buffer.from(JSON.stringify(receipt)));
    const r = verifyBriefcase({
      manifest,
      contents: bundle,
      decompressed: new Map(),
      expected_cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
      gate_key: wrongKey,
    });
    expect(r.ok).toBe(false);
  });
});

// ─── Q2: F1.1 — exhaustive field-level tamper test ────────────────────────────

describe('Q2 — F1.1: every manifest field is tamper-evident', () => {
  it('tampering version invalidates HMAC', () => {
    const { manifest } = freshBundle();
    expect(verifyManifestHmac({ ...manifest, version: '0.0' }, HMAC_KEY)).toBe(
      false
    );
  });

  it('tampering briefcase_id invalidates HMAC', () => {
    const { manifest } = freshBundle();
    expect(
      verifyManifestHmac({ ...manifest, briefcase_id: 'evil-id' }, HMAC_KEY)
    ).toBe(false);
  });

  it('tampering created_at invalidates HMAC', () => {
    const { manifest } = freshBundle();
    expect(
      verifyManifestHmac(
        { ...manifest, created_at: '1970-01-01T00:00:00.000Z' },
        HMAC_KEY
      )
    ).toBe(false);
  });

  it('tampering source_substrate invalidates HMAC', () => {
    const { manifest } = freshBundle();
    expect(
      verifyManifestHmac(
        { ...manifest, source_substrate: 'rogue-substrate' },
        HMAC_KEY
      )
    ).toBe(false);
  });

  it('tampering cradle_pavc_hash invalidates HMAC', () => {
    const { manifest } = freshBundle();
    expect(
      verifyManifestHmac(
        { ...manifest, cradle_pavc_hash: 'deadbeef' },
        HMAC_KEY
      )
    ).toBe(false);
  });

  it('tampering an artifact sha256 invalidates HMAC', () => {
    const { manifest } = freshBundle();
    const tampered: Manifest = {
      ...manifest,
      artifacts: manifest.artifacts.map((a, i) =>
        i === 0 ? { ...a, sha256: 'aabbcc' } : a
      ),
    };
    expect(verifyManifestHmac(tampered, HMAC_KEY)).toBe(false);
  });

  it('tampering an artifact size_bytes invalidates HMAC', () => {
    const { manifest } = freshBundle();
    const tampered: Manifest = {
      ...manifest,
      artifacts: manifest.artifacts.map((a, i) =>
        i === 0 ? { ...a, size_bytes: 99999 } : a
      ),
    };
    expect(verifyManifestHmac(tampered, HMAC_KEY)).toBe(false);
  });

  it('flipping an artifact required flag invalidates HMAC', () => {
    const { manifest } = freshBundle();
    const tampered: Manifest = {
      ...manifest,
      artifacts: manifest.artifacts.map((a) => ({
        ...a,
        required: !a.required,
      })),
    };
    expect(verifyManifestHmac(tampered, HMAC_KEY)).toBe(false);
  });

  it('substituting the HMAC field with another valid-length hex string fails', () => {
    const { manifest } = freshBundle();
    // Replace hmac with all-zeros of the same length
    const fakeHmac = '0'.repeat(manifest.hmac.length);
    expect(verifyManifestHmac({ ...manifest, hmac: fakeHmac }, HMAC_KEY)).toBe(
      false
    );
  });

  it('HMAC is stable: same inputs always produce the same digest', () => {
    const { manifest } = freshBundle('bc-stable');
    const a = computeManifestHmac({ ...manifest, hmac: '' }, HMAC_KEY);
    const b = computeManifestHmac({ ...manifest, hmac: '' }, HMAC_KEY);
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });
});

// ─── Q3: F1.2 — decompressed-sha check occurs before the receiver can use data

describe('Q3 — F1.2: decompressed checksum check fires before data is usable', () => {
  it('mismatch halts before ok:true is ever returned', () => {
    const raw = Buffer.from('real plaintext');
    const compressed = Buffer.from('fake-compressed');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-q3',
      source_substrate: 'codespace',
      required: { 'cradle.md': CRADLE },
      compressed: {
        'memory.titan.bin': {
          bytes: compressed,
          decompressed_sha256: sha256(raw),
        },
      },
      cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
    });
    bundle.set(
      'egress-receipt.json',
      Buffer.from(JSON.stringify(goodReceipt('bc-q3')))
    );
    // Pass corrupted decompressed bytes — sha won't match the declared hash
    const r = verifyBriefcase({
      manifest,
      contents: bundle,
      decompressed: new Map([
        ['memory.titan.bin', Buffer.from('corrupted plaintext')],
      ]),
      expected_cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
      gate_key: GATE_KEY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.halt).toBe(true);
      expect(r.reason).toMatch(/post-decompression checksum/);
    }
  });

  it('correct decompressed sha allows verification to proceed', () => {
    const raw = Buffer.from('real plaintext');
    const compressed = Buffer.from('fake-compressed');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-q3b',
      source_substrate: 'codespace',
      required: { 'cradle.md': CRADLE },
      compressed: {
        'memory.titan.bin': {
          bytes: compressed,
          decompressed_sha256: sha256(raw),
        },
      },
      cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
    });
    bundle.set(
      'egress-receipt.json',
      Buffer.from(JSON.stringify(goodReceipt('bc-q3b')))
    );
    const r = verifyBriefcase({
      manifest,
      contents: bundle,
      decompressed: new Map([['memory.titan.bin', raw]]),
      expected_cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
      gate_key: GATE_KEY,
    });
    expect(r).toEqual({ ok: true });
  });
});

// ─── Q4: F1.3 — cradle hash mismatch is a hard halt, not a soft warning ──────

describe('Q4 — F1.3: cradle PAVC mismatch is a hard halt', () => {
  it('returns halt:true on content mismatch', () => {
    const { manifest, bundle } = freshBundle('bc-q4');
    const r = verifyBriefcase({
      manifest,
      contents: bundle,
      decompressed: new Map(),
      expected_cradle_pavc_hash: sha256(Buffer.from('wrong cradle')),
      hmac_key: HMAC_KEY,
      gate_key: GATE_KEY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.halt).toBe(true);
  });

  it('reason string identifies the cradle check', () => {
    const { manifest, bundle } = freshBundle('bc-q4b');
    const r = verifyBriefcase({
      manifest,
      contents: bundle,
      decompressed: new Map(),
      expected_cradle_pavc_hash: sha256(Buffer.from('wrong cradle')),
      hmac_key: HMAC_KEY,
      gate_key: GATE_KEY,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cradle/i);
  });
});

// ─── Q5: F1.4 — missing egress receipt is a hard boot refusal ────────────────

describe('Q5 — F1.4: missing receipt blocks boot', () => {
  it('no egress-receipt.json = refused with halt', () => {
    const { manifest, bundle } = freshBundle('bc-q5');
    bundle.delete('egress-receipt.json');
    const r = verifyFull(manifest, bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.halt).toBe(true);
      expect(r.reason).toMatch(/egress-receipt missing/);
    }
  });

  it('unparseable receipt JSON = refused', () => {
    const { manifest, bundle } = freshBundle('bc-q5b');
    bundle.set('egress-receipt.json', Buffer.from('{broken json'));
    const r = verifyFull(manifest, bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unparseable/);
  });

  it('REDACT result = refused', () => {
    const receipt = signEgressReceipt(
      {
        briefcase_id: 'bc-q5c',
        gate_version: 'v0',
        timestamp: '2026-06-04T00:00:00Z',
        predicate_hashes_checked: ['p1'],
        result: 'REDACT',
        predicate_triggered: 'private_intimacy',
      },
      GATE_KEY
    );
    const { manifest, bundle } = freshBundle('bc-q5c');
    bundle.set('egress-receipt.json', Buffer.from(JSON.stringify(receipt)));
    const r = verifyFull(manifest, bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not PASS/);
  });
});

// ─── Q6: F1.5 — injected bundle entries not in manifest are rejected ──────────
// Atlas adversarial finding: prior to this fix, extra content silently passed.

describe('Q6 — F1.5: unlisted bundle entries are rejected (adversarial injection)', () => {
  it('injecting an extra file not in manifest causes halt', () => {
    const { manifest, bundle } = freshBundle('bc-q6');
    // Attacker injects a file that is NOT listed in manifest.artifacts
    bundle.set('injected-payload.bin', Buffer.from('malicious bytes'));
    const r = verifyFull(manifest, bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.halt).toBe(true);
      expect(r.reason).toMatch(/unlisted bundle entry/);
    }
  });

  it('clean bundle (only manifest-listed + internal files) still passes', () => {
    const { manifest, bundle } = freshBundle('bc-q6b');
    const r = verifyFull(manifest, bundle);
    expect(r).toEqual({ ok: true });
  });

  it('optional artifact present and listed passes', () => {
    const extra = Buffer.from('optional thread content');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-q6c',
      source_substrate: 'codespace',
      required: { 'cradle.md': CRADLE },
      optional: { 'threads/thread-1.md': extra },
      cradle_pavc_hash: CRADLE_HASH,
      hmac_key: HMAC_KEY,
    });
    bundle.set(
      'egress-receipt.json',
      Buffer.from(JSON.stringify(goodReceipt('bc-q6c')))
    );
    const r = verifyFull(manifest, bundle);
    expect(r).toEqual({ ok: true });
  });

  it('optional artifact injected without manifest entry is rejected', () => {
    const { manifest, bundle } = freshBundle('bc-q6d');
    // Attacker adds a threads/ entry that was never sealed into the manifest
    bundle.set('threads/injected-thread.md', Buffer.from('extra content'));
    const r = verifyFull(manifest, bundle);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unlisted bundle entry/);
  });
});
