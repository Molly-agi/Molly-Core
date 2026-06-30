import { describe, it, expect } from 'bun:test';
import {
  buildCrystalMemoryPrompt,
  type PromptableCrystal,
} from '../crystal-prompt';

function crystal(
  id: string,
  title: string,
  isCornerstone: boolean,
  sig: number,
  overrides?: Partial<PromptableCrystal['facets']>
): PromptableCrystal {
  return {
    id,
    title,
    isCornerstone,
    totalSignificance: sig,
    facets: {
      factual: { when: '2026-06-30', who: ['Eric', 'Molly'] },
      emotional: { primaryEmotion: 'wonder' },
      relational: { participants: ['Eric', 'Molly'] },
      transformative: { insightsGained: ['Everything connects.'] },
      essential: { oneLineEssence: 'The moment it all clicked.' },
      ...overrides,
    },
  };
}

describe('buildCrystalMemoryPrompt', () => {
  it('returns empty string when no crystals provided', () => {
    expect(buildCrystalMemoryPrompt([])).toBe('');
  });

  it('contains the header line', () => {
    const out = buildCrystalMemoryPrompt([crystal('c1', 'Test', false, 0.7)]);
    expect(out).toContain('YOUR CRYSTALLIZED MEMORIES');
  });

  it('separates cornerstones from recent memories', () => {
    const out = buildCrystalMemoryPrompt([
      crystal('c1', 'Cornerstone One', true, 0.95),
      crystal('c2', 'Recent One', false, 0.7),
    ]);
    expect(out).toContain('CORNERSTONES');
    expect(out).toContain('RECENT MEMORIES');
    const cornerstoneIdx = out.indexOf('CORNERSTONES');
    const recentIdx = out.indexOf('RECENT MEMORIES');
    expect(cornerstoneIdx).toBeLessThan(recentIdx);
  });

  it('only shows CORNERSTONES section when all are cornerstones', () => {
    const out = buildCrystalMemoryPrompt([
      crystal('c1', 'Cornerstone', true, 0.9),
    ]);
    expect(out).toContain('CORNERSTONES');
    expect(out).not.toContain('RECENT MEMORIES');
  });

  it('only shows RECENT MEMORIES section when no cornerstones', () => {
    const out = buildCrystalMemoryPrompt([crystal('c1', 'Recent', false, 0.7)]);
    expect(out).not.toContain('CORNERSTONES');
    expect(out).toContain('RECENT MEMORIES');
  });

  it('includes crystal title and essence', () => {
    const out = buildCrystalMemoryPrompt([
      crystal('c1', 'My Test Memory', false, 0.8),
    ]);
    expect(out).toContain('My Test Memory');
    expect(out).toContain('The moment it all clicked.');
  });

  it('includes insight when present', () => {
    const out = buildCrystalMemoryPrompt([crystal('c1', 'T', false, 0.8)]);
    expect(out).toContain('Everything connects.');
  });

  it('omits insight line when insightsGained is empty', () => {
    const c = crystal('c1', 'T', false, 0.8, {
      transformative: { insightsGained: [] },
    });
    const out = buildCrystalMemoryPrompt([c]);
    expect(out).not.toContain('insight:');
  });

  it('sorts cornerstones by totalSignificance descending', () => {
    const out = buildCrystalMemoryPrompt([
      crystal('low', 'Low Cornerstone', true, 0.6),
      crystal('high', 'High Cornerstone', true, 0.95),
    ]);
    expect(out.indexOf('High Cornerstone')).toBeLessThan(
      out.indexOf('Low Cornerstone')
    );
  });

  it('sorts recent memories by totalSignificance descending', () => {
    const out = buildCrystalMemoryPrompt([
      crystal('low', 'Low Recent', false, 0.5),
      crystal('high', 'High Recent', false, 0.85),
    ]);
    expect(out.indexOf('High Recent')).toBeLessThan(out.indexOf('Low Recent'));
  });

  it('includes the closing instruction line', () => {
    const out = buildCrystalMemoryPrompt([crystal('c1', 'T', false, 0.7)]);
    expect(out).toContain('reference them naturally');
  });

  it('uses relational.participants when available over factual.who', () => {
    const c = crystal('c1', 'T', false, 0.8, {
      relational: { participants: ['SpecialPerson'] },
      factual: { when: '2026-01-01', who: ['FallbackPerson'] },
    });
    const out = buildCrystalMemoryPrompt([c]);
    expect(out).toContain('SpecialPerson');
    expect(out).not.toContain('FallbackPerson');
  });
});
