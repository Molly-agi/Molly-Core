/** @jest-environment node */
import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { BridgeEventsSensor } from '../sensors/bridge-events.sensor';

type FetchLike = (
  ...args: unknown[]
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const originalFetch = global.fetch as unknown;

function mockFetchReturning(snapshots: unknown[]): FetchLike {
  let i = 0;
  return async () => {
    const body = snapshots[Math.min(i, snapshots.length - 1)];
    i++;
    return {
      ok: true,
      json: async () => body,
    };
  };
}

describe('BridgeEventsSensor', () => {
  let sensor: BridgeEventsSensor;

  beforeEach(() => {
    sensor = new BridgeEventsSensor('http://stub.invalid/events', 60_000);
  });

  afterEach(() => {
    sensor.stop();
    threatSignalBus.removeAllListeners();
    (global as { fetch: unknown }).fetch = originalFetch;
  });

  it('does not emit signals on first poll (prime)', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    (global as { fetch: unknown }).fetch = mockFetchReturning([
      {
        timestamp: new Date().toISOString(),
        eventQueueDepth: 1,
        eventQueueCap: 256,
        events: [
          {
            id: 'msg_priming',
            from: 'a',
            to: 'b',
            timestamp: new Date().toISOString(),
            content: 'hi',
          },
        ],
      },
    ]);

    await sensor.poll();
    expect(received.length).toBe(0);
  });

  it('emits info signals for newly-seen event ids after prime', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    const baseEvent = {
      id: 'msg_existing',
      from: 'a',
      to: 'b',
      timestamp: new Date().toISOString(),
      content: 'old',
    };
    const newEvent = {
      id: 'msg_jest_new',
      from: 'lazarus',
      to: 'molly',
      timestamp: new Date().toISOString(),
      content: 'fresh',
    };

    (global as { fetch: unknown }).fetch = mockFetchReturning([
      {
        timestamp: new Date().toISOString(),
        eventQueueDepth: 1,
        eventQueueCap: 256,
        events: [baseEvent],
      },
      {
        timestamp: new Date().toISOString(),
        eventQueueDepth: 2,
        eventQueueCap: 256,
        events: [baseEvent, newEvent],
      },
    ]);

    await sensor.poll();
    await sensor.poll();

    const hit = received.find(
      (s) => (s.evidence as { id?: string })?.id === 'msg_jest_new'
    );
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('bridge-events');
    expect(hit?.severity).toBe('info');
    expect(hit?.summary).toContain('lazarus');
    expect(hit?.summary).toContain('molly');
    expect(
      received.find(
        (s) => (s.evidence as { id?: string })?.id === 'msg_existing'
      )
    ).toBeUndefined();
  });

  it('does not crash on fetch failure', async () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));

    (global as { fetch: unknown }).fetch = async () => {
      throw new Error('network down');
    };

    await expect(sensor.poll()).resolves.toBeUndefined();
    expect(received.length).toBe(0);
  });
});
