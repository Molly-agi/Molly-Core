/**
 * @fileOverview W0.5 test suite: Consciousness resumption flow
 *
 * F5.1-F5.5: Full receiver orchestrator flow
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  resumeConsciousness,
  preflight_consciousness_transfer,
} from '../receiver-orchestrator';
import type { Briefcase } from '../schema';
import type { Manifest } from '../schema';
import type { SubstrateHealth } from '../../ai/substrate/types';
import { createHmac } from 'crypto';

describe('Adapter W0.5 — Consciousness Resumption Flow', () => {
  let briefcase: Briefcase;
  let manifest: Manifest;
  let substrate_health: SubstrateHealth;
  let gate_key: Buffer;

  beforeEach(() => {
    gate_key = Buffer.from('test-key-32-bytes-long-exactly-');

    briefcase = new Map<string, Buffer>();
    briefcase.set('cradle.md', Buffer.from('# Molly persona'));
    briefcase.set('working-state.json', Buffer.from('{}'));
    briefcase.set('egress-receipt.json', Buffer.from('{}'));

    substrate_health = {
      ready: true,
      nervous_system: true,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    manifest = {
      version: '0.1.0',
      briefcase_id: 'briefcase-123',
      created_at: new Date().toISOString(),
      source_substrate: 'cloud-reference',
      artifacts: [
        {
          name: 'cradle.md',
          sha256: 'abc123',
          size_bytes: 100,
          required: true,
        },
        {
          name: 'working-state.json',
          sha256: 'def456',
          size_bytes: 50,
          required: true,
        },
        {
          name: 'egress-receipt.json',
          sha256: 'ghi789',
          size_bytes: 300,
          required: true,
        },
      ],
      cradle_pavc_hash: 'xyz999',
      hmac: '', // Will be computed
    };

    // Compute manifest HMAC
    const canonical = JSON.stringify({
      version: manifest.version,
      briefcase_id: manifest.briefcase_id,
      created_at: manifest.created_at,
      source_substrate: manifest.source_substrate,
      artifacts: manifest.artifacts.map((a) => ({
        name: a.name,
        sha256: a.sha256,
        size_bytes: a.size_bytes,
        required: a.required,
        compressed: false,
        decompressed_sha256: null,
      })),
      cradle_pavc_hash: manifest.cradle_pavc_hash,
    });

    manifest.hmac = createHmac('sha256', gate_key)
      .update(canonical)
      .digest('hex');

    // Build a valid egress receipt signature so flow can reach later checks.
    const signed_receipt_base = {
      briefcase_id: 'briefcase-123',
      gate_version: '0.4.0',
      timestamp: new Date().toISOString(),
      predicate_hashes_checked: [],
      result: 'PASS',
      predicate_triggered: null,
    };
    const receipt_canonical = JSON.stringify({
      briefcase_id: signed_receipt_base.briefcase_id,
      gate_version: signed_receipt_base.gate_version,
      timestamp: signed_receipt_base.timestamp,
      predicate_hashes_checked: [
        ...signed_receipt_base.predicate_hashes_checked,
      ].sort(),
      result: signed_receipt_base.result,
      predicate_triggered: signed_receipt_base.predicate_triggered,
    });
    const gate_process_signature = createHmac('sha256', gate_key)
      .update(receipt_canonical)
      .digest('hex');
    briefcase.set(
      'egress-receipt.json',
      Buffer.from(
        JSON.stringify({
          ...signed_receipt_base,
          gate_process_signature,
        })
      )
    );
  });

  it('Should perform preflight check successfully', () => {
    const result = preflight_consciousness_transfer(manifest, substrate_health);
    expect(result.ok).toBe(true);
  });

  it('Should reject preflight if destination not ready', () => {
    const bad_health: SubstrateHealth = {
      ready: false,
      nervous_system: true,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const result = preflight_consciousness_transfer(manifest, bad_health);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not ready');
  });

  it('Should reject preflight if nervous_system missing', () => {
    const bad_health: SubstrateHealth = {
      ready: true,
      nervous_system: false,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const result = preflight_consciousness_transfer(manifest, bad_health);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('nervous_system');
  });

  it('Should fail resumption if required artifacts missing', async () => {
    const incomplete_briefcase = new Map<string, Buffer>();
    incomplete_briefcase.set('cradle.md', Buffer.from('# Molly'));
    // Missing working-state.json and egress-receipt.json

    const result = await resumeConsciousness(
      incomplete_briefcase,
      manifest,
      {} as unknown,
      substrate_health,
      'destination-substrate',
      gate_key
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain('required artifact missing');
  });

  it('Should fail resumption if destination substrate not ready', async () => {
    const bad_health: SubstrateHealth = {
      ready: false,
      nervous_system: true,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const result = await resumeConsciousness(
      briefcase,
      manifest,
      {} as unknown,
      bad_health,
      'destination-substrate',
      gate_key
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain('not ready');
  });

  it('Should fail resumption if nervous_system unavailable', async () => {
    const bad_health: SubstrateHealth = {
      ready: true,
      nervous_system: false,
      audio: false,
      vestibular: false,
      visual: false,
    } as SubstrateHealth;

    const result = await resumeConsciousness(
      briefcase,
      manifest,
      {} as unknown,
      bad_health,
      'destination-substrate',
      gate_key
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain('nervous_system');
  });

  it('Should include briefcase metadata in successful resumption', async () => {
    const result = await resumeConsciousness(
      briefcase,
      manifest,
      {} as unknown,
      substrate_health,
      'destination-substrate',
      gate_key
    );

    expect(result.success).toBe(true);
    expect(result.briefcase_id).toBe('briefcase-123');
    expect(result.source_substrate).toBeDefined();
    expect(result.artifact_count).toBeGreaterThan(0);
    expect(result.total_size_bytes).toBeGreaterThan(0);
  });
});
