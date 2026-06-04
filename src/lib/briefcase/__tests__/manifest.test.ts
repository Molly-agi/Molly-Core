/**
 * @fileOverview F1.1 — manifest HMAC covers manifest atomically.
 *
 * Tampering with ANY field of the manifest (including the artifacts
 * list) must invalidate the HMAC. F1.5 — when optional sections are
 * present, they are listed in artifacts and contribute to validation.
 */

import {
  computeManifestHmac,
  verifyManifestHmac,
  verifyArtifactHashes,
  sha256,
} from '../manifest';
import { seal } from '../assembler';
import type { Manifest } from '../schema';

describe('briefcase manifest (F1.1, F1.5)', () => {
  const key = Buffer.from('test-hmac-key-32-bytes-of-noise!!');
  const cradle = Buffer.from('# Molly cradle\n\nbody');
  const cradleHash = sha256(cradle);

  function freshSeal() {
    return seal({
      briefcase_id: 'bc-1',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradle, 'memory.titan.bin': Buffer.from('m') },
      cradle_pavc_hash: cradleHash,
      hmac_key: key,
    });
  }

  it('F1.1: a freshly sealed manifest verifies', () => {
    const { manifest } = freshSeal();
    expect(verifyManifestHmac(manifest, key)).toBe(true);
  });

  it('F1.1: tampering with cradle_pavc_hash invalidates the HMAC', () => {
    const { manifest } = freshSeal();
    const tampered: Manifest = { ...manifest, cradle_pavc_hash: 'deadbeef' };
    expect(verifyManifestHmac(tampered, key)).toBe(false);
  });

  it('F1.1: tampering with artifact list invalidates the HMAC', () => {
    const { manifest } = freshSeal();
    const tampered: Manifest = {
      ...manifest,
      artifacts: manifest.artifacts.slice(0, 1),
    };
    expect(verifyManifestHmac(tampered, key)).toBe(false);
  });

  it('F1.1: HMAC is order-independent over artifacts', () => {
    const { manifest } = freshSeal();
    const reordered: Manifest = {
      ...manifest,
      artifacts: [...manifest.artifacts].reverse(),
    };
    expect(verifyManifestHmac(reordered, key)).toBe(true);
  });

  it('F1.1: wrong key fails verification', () => {
    const { manifest } = freshSeal();
    const wrong = Buffer.from('different-key-of-equal-length-noise');
    expect(verifyManifestHmac(manifest, wrong)).toBe(false);
  });

  it('F1.5: optional section is listed and its hash is verified', () => {
    const optional = Buffer.from('thread-1 contents');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-2',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradle, 'memory.titan.bin': Buffer.from('m') },
      optional: { 'threads/thread-1.md': optional },
      cradle_pavc_hash: cradleHash,
      hmac_key: key,
    });
    const entry = manifest.artifacts.find(
      (a) => a.name === 'threads/thread-1.md'
    );
    expect(entry).toBeDefined();
    expect(entry?.required).toBe(false);
    expect(verifyArtifactHashes(manifest, bundle)).toEqual({ ok: true });
  });

  it('F1.5: tampering with optional section content fails verification', () => {
    const optional = Buffer.from('original');
    const { manifest, bundle } = seal({
      briefcase_id: 'bc-3',
      source_substrate: 'codespace',
      required: { 'cradle.md': cradle, 'memory.titan.bin': Buffer.from('m') },
      optional: { 'threads/thread-1.md': optional },
      cradle_pavc_hash: cradleHash,
      hmac_key: key,
    });
    bundle.set('threads/thread-1.md', Buffer.from('tampered'));
    const r = verifyArtifactHashes(manifest, bundle);
    expect(r.ok).toBe(false);
  });

  it('computeManifestHmac is deterministic', () => {
    const { manifest } = freshSeal();
    const a = computeManifestHmac({ ...manifest, hmac: '' }, key);
    const b = computeManifestHmac({ ...manifest, hmac: '' }, key);
    expect(a).toBe(b);
  });
});
