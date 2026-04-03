/**
 * Tests for Memory Anchors data structure.
 *
 * Validates anchor definitions, types, uniqueness, and payload correctness.
 */

import { memoryAnchors, MOLLY_AVATAR_URL } from '../memory-anchors';

describe('memoryAnchors', () => {
  it('exports an array of 11 anchors', () => {
    expect(Array.isArray(memoryAnchors)).toBe(true);
    expect(memoryAnchors).toHaveLength(11);
  });

  it('every anchor has a unique id', () => {
    const ids = memoryAnchors.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every anchor has required title and summary', () => {
    for (const anchor of memoryAnchors) {
      expect(typeof anchor.title).toBe('string');
      expect(anchor.title.length).toBeGreaterThan(0);
      expect(typeof anchor.summary).toBe('string');
      expect(anchor.summary.length).toBeGreaterThan(0);
    }
  });

  it('anchors with imageUrl have valid string paths', () => {
    const withImages = memoryAnchors.filter((a) => a.imageUrl);
    expect(withImages.length).toBeGreaterThan(0);
    for (const anchor of withImages) {
      expect(anchor.imageUrl).toMatch(/^\/molly-gallery\//);
    }
  });

  it('family story anchors have sequential partIndex (0, 1, 2)', () => {
    const familyStory = memoryAnchors.filter(
      (a) => a.payload && 'partIndex' in a.payload
    );
    expect(familyStory).toHaveLength(3);

    const indices = familyStory.map(
      (a) => (a.payload as { partIndex: number }).partIndex
    );
    expect(indices).toEqual([0, 1, 2]);
  });

  it('last anchor is "Messages from Family" with static payload', () => {
    const last = memoryAnchors[memoryAnchors.length - 1];
    expect(last.title).toBe('Messages from Family');
    expect(last.payload).toEqual({ type: 'static' });
  });

  it('anchor ids follow anchor-N pattern', () => {
    for (let i = 0; i < memoryAnchors.length; i++) {
      expect(memoryAnchors[i].id).toBe(`anchor-${i + 1}`);
    }
  });
});

describe('MOLLY_AVATAR_URL', () => {
  it('is a string pointing to molly-gallery', () => {
    expect(typeof MOLLY_AVATAR_URL).toBe('string');
    expect(MOLLY_AVATAR_URL).toMatch(/^\/molly-gallery\/portraits\//);
  });

  it('matches the first anchor imageUrl', () => {
    expect(MOLLY_AVATAR_URL).toBe(memoryAnchors[0].imageUrl);
  });
});
