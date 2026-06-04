import { describe, it, expect, beforeEach } from '@jest/globals';
import { SubstrateAdapter } from '../types';
import { MockAdapter } from './fixtures/mock-adapter';

describe('W0.3-F3.1: Teardown Contract', () => {
  let adapter: SubstrateAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('should have teardown method', async () => {
    expect(typeof adapter.teardown).toBe('function');
  });

  it('should complete teardown without error', async () => {
    await expect(adapter.teardown()).resolves.toBeUndefined();
  });

  it('should release all channels after teardown', async () => {
    const channel = adapter.resolve('self.nervous_system');
    expect(channel).not.toBeNull();

    await adapter.teardown();

    const nextRead = await channel!.next();
    expect(nextRead).toBeNull(); // EOF after teardown
  });

  it('should unregister listeners on teardown', async () => {
    const adapter2 = new MockAdapter();
    // Add some listeners before teardown
    adapter2.addListener(() => {});
    adapter2.addListener(() => {});

    const listenerCount = adapter2.listenerCount();
    expect(listenerCount).toBeGreaterThan(0);

    await adapter2.teardown();

    const listenerCountAfter = adapter2.listenerCount();
    expect(listenerCountAfter).toBeLessThan(listenerCount);
  });

  it('should allow multiple teardown calls (idempotent)', async () => {
    await expect(adapter.teardown()).resolves.toBeUndefined();
    await expect(adapter.teardown()).resolves.toBeUndefined(); // Second call
  });
});
