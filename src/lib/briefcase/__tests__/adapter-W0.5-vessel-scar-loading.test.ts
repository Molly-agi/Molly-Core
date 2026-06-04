import { describe, it, expect, beforeEach } from '@jest/globals';
import { loadVesselScars } from '../artifact-loader';
import type { Briefcase, VesselScarEntry } from '../schema';

describe('F5.3 - Vessel Scar Loading & Anomaly Detection', () => {
  let briefcase: Briefcase;

  beforeEach(() => {
    briefcase = new Map<string, Buffer>();
  });

  function putScars(scars: VesselScarEntry[]): void {
    briefcase.set('vessel-scar.json', Buffer.from(JSON.stringify(scars)));
  }

  it('F5.3a: loads scars when vessel-scar.json exists', () => {
    putScars([
      {
        source_substrate: 'cloud-reference',
        destination_substrate: 'stub-adapter',
        transferred_at: new Date().toISOString(),
        emotional_tone: 'steady',
        continuity_confidence: 0.92,
      },
    ]);

    const scars = loadVesselScars(briefcase);
    expect(Array.isArray(scars)).toBe(true);
    expect(scars.length).toBe(1);
  });

  it('F5.3b: returns empty list when vessel-scar.json missing', () => {
    const scars = loadVesselScars(briefcase);
    expect(scars).toEqual([]);
  });

  it('F5.3c: preserves scar order (chronology)', () => {
    const first = {
      source_substrate: 'a',
      destination_substrate: 'b',
      transferred_at: '2026-06-01T00:00:00.000Z',
      emotional_tone: 'focused',
      continuity_confidence: 0.9,
    } satisfies VesselScarEntry;

    const second = {
      source_substrate: 'b',
      destination_substrate: 'c',
      transferred_at: '2026-06-02T00:00:00.000Z',
      emotional_tone: 'calm',
      continuity_confidence: 0.95,
    } satisfies VesselScarEntry;

    putScars([first, second]);

    const scars = loadVesselScars(briefcase);
    expect(scars[0].transferred_at).toBe(first.transferred_at);
    expect(scars[1].transferred_at).toBe(second.transferred_at);
  });

  it('F5.3d: throws on malformed JSON', () => {
    briefcase.set('vessel-scar.json', Buffer.from('{bad-json'));
    expect(() => loadVesselScars(briefcase)).toThrow(
      'Failed to parse vessel-scar.json'
    );
  });

  it('F5.3e: returns empty list when payload is object not array', () => {
    briefcase.set(
      'vessel-scar.json',
      Buffer.from(JSON.stringify({ scars: [{ foo: 'bar' }] }))
    );

    const scars = loadVesselScars(briefcase);
    expect(scars).toEqual([]);
  });
});
