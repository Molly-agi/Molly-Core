/**
 * Regression tests for Fable Batch 02e finding #1 (eviction) — two bugs, one credit.
 *
 * Bug 1(a): hot tier grew unboundedly when all residents were cornerstones.
 *   _evictOne returned null, loadToHot inserted anyway, hot.size exceeded maxHot.
 * Bug 1(b): stats erased on every tier transition.
 *   Re-promoted crystal restarted at loadCount=1, losing all frequency credit
 *   and driving evict→reload→evict thrash.
 */

import {
  CrystalLibraryManager,
  type EvictableCrystal,
} from '../crystal-library-eviction';

interface TestCrystal extends EvictableCrystal {
  significance: number;
  isCornerstone?: boolean;
}

function c(id: string, significance = 0.5, isCornerstone = false): TestCrystal {
  return { id, significance, isCornerstone };
}

describe('crystal-library-eviction — landmine guards (Fable 02e finding #1)', () => {
  describe('Bug 1(a): all-cornerstones hot tier does not overflow', () => {
    it('refuses non-cornerstone admission when all hot are cornerstones', () => {
      const lib = new CrystalLibraryManager<TestCrystal>(2);

      // Fill with cornerstones
      lib.loadToHot(c('corner1', 0.9, true));
      lib.loadToHot(c('corner2', 0.9, true));
      expect(lib.hotSize).toBe(2);

      // Try to admit a non-cornerstone — should be refused, pushed to warm
      const eviction = lib.loadToHot(c('newbie', 0.5, false));

      expect(eviction).toBeNull();
      expect(lib.hotSize).toBe(2); // did NOT overflow
      expect(lib.isHot('newbie')).toBe(false);
      expect(lib.isWarm('newbie')).toBe(true);
    });

    it('accepts cornerstone overflow but never silently exceeds for non-cornerstones', () => {
      const lib = new CrystalLibraryManager<TestCrystal>(2);
      lib.loadToHot(c('corner1', 0.9, true));
      lib.loadToHot(c('corner2', 0.9, true));

      // Cornerstone insertion accepts overflow (operator intent) but is logged
      lib.loadToHot(c('corner3', 0.9, true));
      expect(lib.hotSize).toBe(3); // overflow accepted for cornerstones only

      // Non-cornerstone still refused
      lib.loadToHot(c('nonc', 0.5, false));
      expect(lib.hotSize).toBe(3); // did NOT increase
      expect(lib.isWarm('nonc')).toBe(true);
    });

    it('with mixed cornerstones and non-cornerstones, admits by evicting the non-cornerstone', () => {
      const lib = new CrystalLibraryManager<TestCrystal>(2);
      lib.loadToHot(c('corner', 0.9, true));
      lib.loadToHot(c('regular', 0.4, false), 1000);

      // Load a new non-cornerstone — should evict the regular (only evictable)
      const eviction = lib.loadToHot(c('newer', 0.6, false), 2000);
      expect(eviction).not.toBeNull();
      expect(eviction!.evictedId).toBe('regular');
      expect(lib.hotSize).toBe(2);
      expect(lib.isHot('newer')).toBe(true);
      expect(lib.isHot('corner')).toBe(true);
      expect(lib.isWarm('regular')).toBe(true);
    });
  });

  describe('Bug 1(b): stats survive tier transitions (no evict→reload→evict thrash)', () => {
    it('re-promoted crystal keeps loadCount + lastLoadedAt across demotion', () => {
      const lib = new CrystalLibraryManager<TestCrystal>(2);

      // Build up loadCount on 'popular'
      const NOW = 1_700_000_000_000;
      lib.loadToHot(c('popular', 0.5), NOW);
      for (let i = 1; i <= 10; i++) lib.touch('popular', NOW + i * 1000);

      const beforeDemote = lib.getStats('popular')!;
      expect(beforeDemote.loadCount).toBe(11); // initial load + 10 touches

      // Force it out of hot via eviction pressure
      lib.loadToHot(c('other1', 0.9), NOW + 20_000);
      lib.loadToHot(c('other2', 0.9), NOW + 21_000);
      expect(lib.isHot('popular')).toBe(false);
      expect(lib.isWarm('popular')).toBe(true);

      // Re-promote 'popular' from warm
      lib.loadToHot(c('popular', 0.5), NOW + 30_000);

      // Stats should carry forward + increment, NOT reset to loadCount=1
      const afterRepromote = lib.getStats('popular')!;
      expect(afterRepromote.loadCount).toBeGreaterThan(11);
      expect(afterRepromote.lastLoadedAt).toBe(NOW + 30_000);
    });

    it('manual demotion preserves stats too', () => {
      const lib = new CrystalLibraryManager<TestCrystal>(4);
      const NOW = 1_700_000_000_000;
      lib.loadToHot(c('a', 0.5), NOW);
      lib.touch('a', NOW + 1000);
      lib.touch('a', NOW + 2000);

      expect(lib.getStats('a')!.loadCount).toBe(3);

      lib.demoteToWarm('a');
      expect(lib.isHot('a')).toBe(false);

      lib.loadToHot(c('a', 0.5), NOW + 5000);
      expect(lib.getStats('a')!.loadCount).toBe(4); // preserved 3 + 1 on re-promote
    });
  });
});
