import {
  CrystalLibraryManager,
  computeRetentionScore,
  DEFAULT_WEIGHTS,
  type EvictableCrystal,
} from '../crystal-library-eviction';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function crystal(
  id: string,
  significance: number,
  isCornerstone = false
): EvictableCrystal {
  return { id, significance, isCornerstone };
}

const NOW = 1_700_000_000_000; // fixed reference time

// ─── computeRetentionScore ────────────────────────────────────────────────────

describe('computeRetentionScore', () => {
  it('returns 1 when just loaded with max significance and load count at cap', () => {
    const score = computeRetentionScore(
      { loadCount: 20, lastLoadedAt: NOW },
      1.0,
      DEFAULT_WEIGHTS,
      NOW
    );
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('returns 0 when significance 0, loadCount 0, loaded long ago', () => {
    const score = computeRetentionScore(
      { loadCount: 0, lastLoadedAt: 0 },
      0,
      DEFAULT_WEIGHTS,
      NOW
    );
    expect(score).toBeCloseTo(0, 5);
  });

  it('recency decays to ~0.37 after one half-life (24h)', () => {
    const HALF_LIFE = 24 * 60 * 60 * 1000;
    const score = computeRetentionScore(
      { loadCount: 0, lastLoadedAt: NOW - HALF_LIFE },
      0,
      { recency: 1, significance: 0, loadCount: 0 },
      NOW
    );
    expect(score).toBeCloseTo(Math.exp(-1), 3);
  });

  it('load count saturates at LOAD_COUNT_NORM_CAP (20)', () => {
    const s20 = computeRetentionScore(
      { loadCount: 20, lastLoadedAt: NOW },
      0,
      { recency: 0, significance: 0, loadCount: 1 },
      NOW
    );
    const s100 = computeRetentionScore(
      { loadCount: 100, lastLoadedAt: NOW },
      0,
      { recency: 0, significance: 0, loadCount: 1 },
      NOW
    );
    expect(s20).toBeCloseTo(s100, 5);
  });

  it('returns 0 when all weights are 0', () => {
    const score = computeRetentionScore(
      { loadCount: 5, lastLoadedAt: NOW },
      0.9,
      { recency: 0, significance: 0, loadCount: 0 },
      NOW
    );
    expect(score).toBe(0);
  });
});

// ─── CrystalLibraryManager ────────────────────────────────────────────────────

describe('CrystalLibraryManager', () => {
  it('throws if maxHot < 1', () => {
    expect(() => new CrystalLibraryManager(0)).toThrow(RangeError);
  });

  describe('loadToHot', () => {
    it('adds a crystal to hot tier when room available', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.8), NOW);
      expect(mgr.isHot('a')).toBe(true);
      expect(mgr.hotSize).toBe(1);
    });

    it('touching an already-hot crystal increments loadCount', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.8), NOW);
      const before = mgr.getStats('a')!.loadCount;
      mgr.loadToHot(crystal('a', 0.8), NOW + 1000);
      expect(mgr.getStats('a')!.loadCount).toBe(before + 1);
    });

    it('returns null when no eviction needed', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      const result = mgr.loadToHot(crystal('a', 0.8), NOW);
      expect(result).toBeNull();
    });

    it('evicts lowest-retention crystal when hot tier is full', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(2);
      // Load two crystals — 'low' with low significance loaded long ago
      mgr.loadToHot(crystal('high', 0.9), NOW);
      mgr.loadToHot(crystal('low', 0.1), NOW - 48 * 60 * 60 * 1000); // 48h ago
      // Force low's stats to reflect old access
      // (already set via loadToHot timestamp)

      const event = mgr.loadToHot(crystal('new', 0.8), NOW);
      expect(event).not.toBeNull();
      expect(event!.evictedId).toBe('low');
      expect(mgr.isHot('low')).toBe(false);
      expect(mgr.isWarm('low')).toBe(true);
      expect(mgr.isHot('new')).toBe(true);
    });

    it('removes crystal from warm when promoted to hot', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(2);
      mgr.loadToHot(crystal('a', 0.8), NOW);
      mgr.demoteToWarm('a');
      expect(mgr.isWarm('a')).toBe(true);
      mgr.loadToHot(crystal('a', 0.8), NOW + 1);
      expect(mgr.isWarm('a')).toBe(false);
      expect(mgr.isHot('a')).toBe(true);
    });
  });

  describe('cornerstone protection', () => {
    it('never evicts a cornerstone crystal', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(2);
      mgr.loadToHot(crystal('corner', 0.1, true), NOW - 100_000_000); // very old
      mgr.loadToHot(crystal('normal', 0.5), NOW);
      // Hot tier full. Loading a third should evict 'normal', not 'corner'.
      const event = mgr.loadToHot(crystal('new', 0.9), NOW);
      expect(event!.evictedId).toBe('normal');
      expect(mgr.isHot('corner')).toBe(true);
    });

    it('returns null eviction when all hot crystals are cornerstones', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(1);
      mgr.loadToHot(crystal('corner', 0.9, true), NOW);
      // Hot tier full, only a cornerstone present — cannot evict
      const event = mgr.loadToHot(crystal('new', 0.5), NOW);
      expect(event).toBeNull();
    });
  });

  describe('demoteToWarm', () => {
    it('moves crystal from hot to warm', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.8), NOW);
      expect(mgr.demoteToWarm('a')).toBe(true);
      expect(mgr.isHot('a')).toBe(false);
      expect(mgr.isWarm('a')).toBe(true);
    });

    it('returns false for unknown crystal', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      expect(mgr.demoteToWarm('ghost')).toBe(false);
    });
  });

  describe('touch', () => {
    it('increments loadCount and updates lastLoadedAt for hot crystal', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.8), NOW);
      mgr.touch('a', NOW + 5000);
      const stats = mgr.getStats('a')!;
      expect(stats.loadCount).toBe(2);
      expect(stats.lastLoadedAt).toBe(NOW + 5000);
    });

    it('is a no-op for crystals not in hot tier', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      expect(() => mgr.touch('ghost', NOW)).not.toThrow();
    });
  });

  describe('getHotCrystals / getWarmIds', () => {
    it('returns all hot crystals', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.9), NOW);
      mgr.loadToHot(crystal('b', 0.7), NOW);
      const ids = mgr
        .getHotCrystals()
        .map((c) => c.id)
        .sort();
      expect(ids).toEqual(['a', 'b']);
    });

    it('returns all warm ids after demotion', () => {
      const mgr = new CrystalLibraryManager<EvictableCrystal>(4);
      mgr.loadToHot(crystal('a', 0.9), NOW);
      mgr.demoteToWarm('a');
      expect(mgr.getWarmIds()).toContain('a');
    });
  });
});
