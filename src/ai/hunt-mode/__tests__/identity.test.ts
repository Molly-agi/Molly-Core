/**
 * @jest-environment node
 */

import { extractIdentity, extractFields } from '../identity';
import type { ThreatSignal } from '../../threat-monitor/signal-bus';

function sig(evidence: unknown): ThreatSignal {
  return {
    source: 'test',
    severity: 'info',
    timestamp: '2026-06-19T00:00:00.000Z',
    summary: 'test',
    evidence,
  };
}

describe('extractFields', () => {
  it('returns empty when evidence is null', () => {
    expect(extractFields(sig(null))).toEqual({
      ip: undefined,
      ua: undefined,
      user: undefined,
      route: undefined,
      referrer: undefined,
      source: undefined,
      from: undefined,
    });
  });

  it('returns empty when evidence is not an object', () => {
    expect(extractFields(sig('string-evidence')).ip).toBeUndefined();
    expect(extractFields(sig(42)).ip).toBeUndefined();
  });

  it('falls back from source_ip to ip', () => {
    expect(extractFields(sig({ source_ip: '1.2.3.4' })).ip).toBe('1.2.3.4');
    expect(extractFields(sig({ ip: '5.6.7.8' })).ip).toBe('5.6.7.8');
  });

  it('falls back from userId to user', () => {
    expect(extractFields(sig({ userId: 'alice' })).user).toBe('alice');
    expect(extractFields(sig({ user: 'bob' })).user).toBe('bob');
  });

  it('ignores empty strings', () => {
    expect(extractFields(sig({ ip: '' })).ip).toBeUndefined();
  });
});

describe('extractIdentity', () => {
  it('returns null when no identifier fields present', () => {
    expect(extractIdentity(sig({}))).toBeNull();
    expect(extractIdentity(sig(null))).toBeNull();
  });

  it('returns ip-only identity at confidence 0.5', () => {
    const id = extractIdentity(sig({ source_ip: '1.2.3.4' }));
    expect(id).not.toBeNull();
    expect(id!.key).toBe('ip:1.2.3.4');
    expect(id!.confidence).toBe(0.5);
  });

  it('returns composite ip+ua at confidence 1.0', () => {
    const id = extractIdentity(sig({ source_ip: '1.2.3.4', ua: 'curl/8.0' }));
    expect(id).not.toBeNull();
    expect(id!.confidence).toBe(1);
    expect(id!.key).toHaveLength(64); // sha256 hex
  });

  it('ip+ua composite key is stable across order and matches on equal inputs', () => {
    const a = extractIdentity(sig({ source_ip: '1.2.3.4', ua: 'curl/8.0' }));
    const b = extractIdentity(sig({ ip: '1.2.3.4', ua: 'curl/8.0' }));
    expect(a!.key).toBe(b!.key);
  });

  it('different ua produces different composite key', () => {
    const a = extractIdentity(sig({ source_ip: '1.2.3.4', ua: 'curl/8.0' }));
    const b = extractIdentity(sig({ source_ip: '1.2.3.4', ua: 'wget/1.0' }));
    expect(a!.key).not.toBe(b!.key);
  });

  it('falls back to user-only identity at confidence 0.25', () => {
    const id = extractIdentity(sig({ userId: 'alice' }));
    expect(id).not.toBeNull();
    expect(id!.key).toBe('user:alice');
    expect(id!.confidence).toBe(0.25);
  });

  it('composites user+from when no network identifiers', () => {
    const id = extractIdentity(sig({ userId: 'alice', from: 'gemini' }));
    expect(id).not.toBeNull();
    expect(id!.confidence).toBe(0.5);
    expect(id!.key).toHaveLength(64);
  });

  it('prefers network identifiers over weak ones (does not include user when ip present)', () => {
    const id = extractIdentity(sig({ source_ip: '1.2.3.4', userId: 'alice' }));
    expect(id!.key).toBe('ip:1.2.3.4');
    expect(id!.confidence).toBe(0.5);
  });

  it('caps confidence at 1.0 even if more fields are present', () => {
    const id = extractIdentity(
      sig({
        source_ip: '1.2.3.4',
        ua: 'curl/8.0',
        userId: 'alice',
        from: 'gemini',
      })
    );
    expect(id!.confidence).toBeLessThanOrEqual(1);
  });
});
