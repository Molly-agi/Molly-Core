import { describe, it, expect, beforeEach } from '@jest/globals';
import { createHash, createHmac } from 'crypto';
import {
  verifyManifestHmac,
  verifyArtifactSha256,
} from '../manifest-validator';
import type { Manifest } from '../schema';

describe('F5.1 - Manifest Integrity Verification', () => {
  let gate_key: Buffer;
  let base_manifest: Omit<Manifest, 'hmac'>;

  beforeEach(() => {
    gate_key = Buffer.from('test-gate-key-32-bytes-long-ok', 'utf8');

    base_manifest = {
      version: '0.1.0',
      briefcase_id: 'test-briefcase-001',
      created_at: new Date().toISOString(),
      source_substrate: 'cloud-reference',
      artifacts: [
        {
          name: 'cradle.md',
          sha256: 'a'.repeat(64),
          size_bytes: 128,
          required: true,
        },
        {
          name: 'working-state.json',
          sha256: 'b'.repeat(64),
          size_bytes: 256,
          required: true,
          compressed: false,
        },
      ],
      cradle_pavc_hash: 'c'.repeat(64),
    };
  });

  function canonicalManifestForSigning(
    manifest: Omit<Manifest, 'hmac'>
  ): string {
    return JSON.stringify({
      version: manifest.version,
      briefcase_id: manifest.briefcase_id,
      created_at: manifest.created_at,
      source_substrate: manifest.source_substrate,
      artifacts: manifest.artifacts.map((a) => ({
        name: a.name,
        sha256: a.sha256,
        size_bytes: a.size_bytes,
        required: a.required,
        compressed: a.compressed ?? false,
        decompressed_sha256: a.decompressed_sha256 ?? null,
      })),
      cradle_pavc_hash: manifest.cradle_pavc_hash,
    });
  }

  function signManifest(
    manifest: Omit<Manifest, 'hmac'>,
    key: Buffer
  ): Manifest {
    const hmac = createHmac('sha256', key)
      .update(canonicalManifestForSigning(manifest))
      .digest('hex');
    return { ...manifest, hmac };
  }

  it('F5.1a: verifies valid manifest HMAC', () => {
    const manifest = signManifest(base_manifest, gate_key);
    const result = verifyManifestHmac(manifest, gate_key);
    expect(result.ok).toBe(true);
  });

  it('F5.1b: rejects manifest with wrong HMAC', () => {
    const manifest = { ...base_manifest, hmac: 'f'.repeat(64) } as Manifest;
    const result = verifyManifestHmac(manifest, gate_key);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('HMAC');
  });

  it('F5.1c: rejects manifest if key differs', () => {
    const manifest = signManifest(base_manifest, gate_key);
    const wrong_key = Buffer.from('different-gate-key-32-bytes-lng', 'utf8');
    const result = verifyManifestHmac(manifest, wrong_key);

    expect(result.ok).toBe(false);
  });

  it('F5.1d: deterministic signatures for identical manifest', () => {
    const s1 = signManifest(base_manifest, gate_key);
    const s2 = signManifest(base_manifest, gate_key);
    expect(s1.hmac).toBe(s2.hmac);
  });

  it('F5.1e: rejects missing hmac', () => {
    const manifest = { ...base_manifest, hmac: '' } as Manifest;
    const result = verifyManifestHmac(manifest, gate_key);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('manifest.hmac missing');
  });

  it('F5.1f: verifies individual artifact SHA256', () => {
    const test_buffer = Buffer.from('test-artifact-data');
    const sha256 = createHash('sha256').update(test_buffer).digest('hex');

    const result = verifyArtifactSha256(test_buffer, sha256);
    expect(result.ok).toBe(true);
  });

  it('F5.1g: rejects artifact with wrong SHA256', () => {
    const test_buffer = Buffer.from('test-artifact-data');
    const wrong_sha256 = 'f'.repeat(64);

    const result = verifyArtifactSha256(test_buffer, wrong_sha256);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('SHA256 mismatch');
  });

  it('F5.1h: rejects empty briefcase_id', () => {
    const manifest = signManifest(
      { ...base_manifest, briefcase_id: '' },
      gate_key
    );
    const result = verifyManifestHmac(manifest, gate_key);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('briefcase_id');
  });

  it('F5.1i: tampering artifacts after signing invalidates HMAC', () => {
    const signed = signManifest(base_manifest, gate_key);
    const tampered: Manifest = {
      ...signed,
      artifacts: [
        ...signed.artifacts,
        {
          name: 'egress-receipt.json',
          sha256: 'd'.repeat(64),
          size_bytes: 77,
          required: true,
        },
      ],
    };

    const result = verifyManifestHmac(tampered, gate_key);
    expect(result.ok).toBe(false);
  });

  it('F5.1j: artifact order changes canonicalized payload and invalidates old signature', () => {
    const signed = signManifest(base_manifest, gate_key);
    const reordered: Manifest = {
      ...signed,
      artifacts: [...signed.artifacts].reverse(),
    };

    const result = verifyManifestHmac(reordered, gate_key);
    expect(result.ok).toBe(false);
  });
});
