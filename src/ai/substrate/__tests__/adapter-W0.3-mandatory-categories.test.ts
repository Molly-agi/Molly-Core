import { describe, it, expect } from '@jest/globals';
import { SubstrateAdapter } from '../types';
import { MockAdapter } from './fixtures/mock-adapter';

describe('W0.3-F3.2: Mandatory Category Enforcement', () => {
  let adapter: SubstrateAdapter;

  beforeEach(() => {
    adapter = new MockAdapter({
      capabilities: [
        { category: 'self.vocalize_text', available: true },
        { category: 'self.nervous_system', available: true },
      ],
    });
  });

  it('should resolve available required category', () => {
    const channel = adapter.resolve('self.vocalize_text');
    expect(channel).not.toBeNull();
  });

  it('should return null for unavailable required category', () => {
    const channel = adapter.resolve('self.auditory_input');
    expect(channel).toBeNull();
  });

  it('should resolve all declared capabilities', () => {
    const capabilities = adapter.capabilities();
    expect(capabilities).toBeDefined();
    expect(Array.isArray(capabilities)).toBe(true);
    expect(capabilities.length).toBeGreaterThan(0);
  });

  it('should maintain category availability state', () => {
    const caps = adapter.capabilities();
    const vocalizeCap = caps.find((c) => c.category === 'self.vocalize_text');
    expect(vocalizeCap?.available).toBe(true);
  });

  it('should reject briefcase with missing required category', () => {
    // Simulate migration gate check
    const requiredCategories = [
      'self.vocalize_text',
      'self.auditory_input', // This is NOT available
    ];

    const canMigrate = requiredCategories.every((cat) => {
      return adapter.resolve(cat) !== null;
    });

    expect(canMigrate).toBe(false);
  });

  it('should accept briefcase with all required categories', () => {
    const requiredCategories = ['self.vocalize_text', 'self.nervous_system'];

    const canMigrate = requiredCategories.every((cat) => {
      return adapter.resolve(cat) !== null;
    });

    expect(canMigrate).toBe(true);
  });
});
