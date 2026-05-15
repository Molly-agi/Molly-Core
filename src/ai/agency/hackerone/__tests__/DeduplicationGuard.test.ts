import { DeduplicationGuard } from '../DeduplicationGuard';

beforeEach(() => {
  DeduplicationGuard.reset();
});

describe('DeduplicationGuard', () => {
  describe('bloom filter basics', () => {
    it('returns false for a never-seen target', () => {
      const guard = DeduplicationGuard.getInstance();
      expect(guard.isDuplicateTarget('https://example.com', 'q')).toBe(false);
    });

    it('returns true after registering the same target', () => {
      const guard = DeduplicationGuard.getInstance();
      guard.registerScannedTarget('https://example.com', 'id');
      expect(guard.isDuplicateTarget('https://example.com', 'id')).toBe(true);
    });

    it('different param on same URL is not a duplicate', () => {
      const guard = DeduplicationGuard.getInstance();
      guard.registerScannedTarget('https://example.com', 'id');
      expect(guard.isDuplicateTarget('https://example.com', 'name')).toBe(
        false
      );
    });

    it('different URL with same param is not a duplicate', () => {
      const guard = DeduplicationGuard.getInstance();
      guard.registerScannedTarget('https://site-a.com', 'q');
      expect(guard.isDuplicateTarget('https://site-b.com', 'q')).toBe(false);
    });
  });

  describe('singleton', () => {
    it('getInstance returns the same instance', () => {
      expect(DeduplicationGuard.getInstance()).toBe(
        DeduplicationGuard.getInstance()
      );
    });

    it('reset clears the filter so previously seen targets are fresh', () => {
      const guard = DeduplicationGuard.getInstance();
      guard.registerScannedTarget('https://example.com', 'id');
      DeduplicationGuard.reset();
      expect(
        DeduplicationGuard.getInstance().isDuplicateTarget(
          'https://example.com',
          'id'
        )
      ).toBe(false);
    });
  });

  describe('saturation', () => {
    it('starts at 0', () => {
      expect(DeduplicationGuard.getInstance().saturation()).toBe(0);
    });

    it('increases after registrations', () => {
      const guard = DeduplicationGuard.getInstance();
      for (let i = 0; i < 10; i++) {
        guard.registerScannedTarget(`https://site${i}.com`, 'q');
      }
      expect(guard.saturation()).toBeGreaterThan(0);
      expect(guard.saturation()).toBeLessThanOrEqual(1);
    });
  });
});
