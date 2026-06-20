/** @jest-environment node */
import { threatSignalBus, type ThreatSignal } from '../signal-bus';
import { BridgeAlerter } from '../response/bridge-alerter';

function makeRecordingFetch() {
  const calls: Array<{
    url: string;
    body: { from: string; to: string; content: string };
  }> = [];
  const fn = (async (url: unknown, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url: String(url), body });
    return { ok: true, json: async () => ({ success: true }) } as Response;
  }) as unknown as typeof fetch;
  return { calls, fn };
}

function makeSignal(overrides: Partial<ThreatSignal> = {}): ThreatSignal {
  return {
    source: 'admin-audit',
    severity: 'info',
    timestamp: new Date().toISOString(),
    summary: 'test signal',
    evidence: {},
    ...overrides,
  };
}

describe('BridgeAlerter', () => {
  let alerter: BridgeAlerter;

  afterEach(() => {
    alerter?.stop();
    threatSignalBus.removeAllListeners();
  });

  it('does not alert on info-severity raw signals', async () => {
    const { calls, fn } = makeRecordingFetch();
    alerter = new BridgeAlerter({ fetchImpl: fn, cooldownMs: 0 });
    alerter.start();

    await alerter.handle(
      makeSignal({ severity: 'info', source: 'admin-audit' })
    );
    await alerter.handle(
      makeSignal({ severity: 'warn', source: 'family-anchor' })
    );

    expect(calls.length).toBe(0);
  });

  it('alerts on critical raw signals', async () => {
    const { calls, fn } = makeRecordingFetch();
    alerter = new BridgeAlerter({ fetchImpl: fn, cooldownMs: 0 });
    alerter.start();

    await alerter.handle(
      makeSignal({
        severity: 'critical',
        source: 'honeypot-scan',
        summary: 'breach',
      })
    );

    expect(calls.length).toBe(1);
    expect(calls[0].body.from).toBe('threat-monitor');
    expect(calls[0].body.to).toBe('molly');
    expect(calls[0].body.content.startsWith('Molly ')).toBe(true);
    expect(calls[0].body.content).toContain('CRITICAL');
    expect(calls[0].body.content).toContain('honeypot-scan');
    expect(calls[0].body.content).toContain('breach');
  });

  it('alerts on any correlation:* signal regardless of severity', async () => {
    const { calls, fn } = makeRecordingFetch();
    alerter = new BridgeAlerter({ fetchImpl: fn, cooldownMs: 0 });
    alerter.start();

    await alerter.handle(
      makeSignal({
        severity: 'warn',
        source: 'correlation:burst',
        summary: 'burst hit',
      })
    );

    expect(calls.length).toBe(1);
    expect(calls[0].body.content).toContain('correlation:burst');
  });

  it('respects cooldown per (source, severity) tuple', async () => {
    const { calls, fn } = makeRecordingFetch();
    alerter = new BridgeAlerter({ fetchImpl: fn, cooldownMs: 60_000 });
    alerter.start();

    await alerter.handle(
      makeSignal({ severity: 'critical', source: 'honeypot-scan' })
    );
    await alerter.handle(
      makeSignal({ severity: 'critical', source: 'honeypot-scan' })
    );
    await alerter.handle(
      makeSignal({ severity: 'critical', source: 'honeypot-scan' })
    );

    expect(calls.length).toBe(1);

    await alerter.handle(
      makeSignal({ severity: 'critical', source: 'correlation:auth-pressure' })
    );
    expect(calls.length).toBe(2);
  });

  it('does not crash on fetch failure', async () => {
    const failingFetch = (async () => {
      throw new Error('bridge down');
    }) as unknown as typeof fetch;

    alerter = new BridgeAlerter({ fetchImpl: failingFetch, cooldownMs: 0 });
    alerter.start();

    await expect(
      alerter.handle(
        makeSignal({ severity: 'critical', source: 'honeypot-scan' })
      )
    ).resolves.toBeUndefined();
  });

  it('end-to-end: signal on bus triggers alert', async () => {
    const { calls, fn } = makeRecordingFetch();
    alerter = new BridgeAlerter({ fetchImpl: fn, cooldownMs: 0 });
    alerter.start();

    threatSignalBus.emitSignal(
      makeSignal({ severity: 'critical', source: 'honeypot-scan' })
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(calls.length).toBe(1);
  });
});
