/**
 * Tests for the KV capture orchestrator (Gap 2 phase 3).
 *
 * Uses a fake SlotSnapshotClient so the state machine is exercised
 * without a live llama-server.
 */

import { KvCaptureOrchestrator } from '@/ai/llama/capture-orchestrator';
import type {
  SlotActionResult,
  SlotInfo,
  SlotSnapshotClient,
} from '@/ai/llama/slot-snapshot';

class FakeClient implements Pick<
  SlotSnapshotClient,
  'saveSlot' | 'restoreSlot' | 'eraseSlot' | 'listSlots'
> {
  saves: Array<{ slotId: number; filename: string }> = [];
  failNext = false;

  async saveSlot(slotId: number, filename: string): Promise<SlotActionResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('disk full');
    }
    this.saves.push({ slotId, filename });
    return { filename, n_saved: 1 };
  }
  async restoreSlot(): Promise<SlotActionResult> {
    return {};
  }
  async eraseSlot(): Promise<SlotActionResult> {
    return {};
  }
  async listSlots(): Promise<SlotInfo[]> {
    return [];
  }
}

function makeOrchestrator(
  scores: number[],
  opts: { failBaseline?: boolean; failAfter?: boolean } = {}
): { orch: KvCaptureOrchestrator; client: FakeClient; scoreCalls: number } {
  const client = new FakeClient();
  let scoreCalls = 0;
  const orch = new KvCaptureOrchestrator({
    client: client as unknown as SlotSnapshotClient,
    slotId: 0,
    sessionId: 'sess-1',
    scorer: async () => {
      const s = scores[scoreCalls % scores.length];
      scoreCalls++;
      return s;
    },
    now: () => new Date('2026-06-30T09:00:00.000Z'),
  });
  if (opts.failBaseline) client.failNext = true;
  return {
    orch,
    client,
    get scoreCalls() {
      return scoreCalls;
    },
  } as never;
}

describe('KvCaptureOrchestrator', () => {
  it('stays idle when score never crosses preTriggerScore', async () => {
    const { orch, client } = makeOrchestrator([0.1, 0.2, 0.3, 0.4]);
    for (let i = 0; i < 4; i++) {
      const ev = await orch.observe(`tok ${i}`);
      expect(ev.state).toBe('idle');
    }
    expect(client.saves).toHaveLength(0);
  });

  it('arms baseline when score crosses preTriggerScore (default 0.5)', async () => {
    const { orch, client } = makeOrchestrator([0.55]);
    const ev = await orch.observe('w0');
    expect(ev.type).toBe('armed');
    expect(ev.state).toBe('armed');
    expect(ev.baselineFile).toMatch(/^kv_0_sess-1_baseline_/);
    expect(client.saves).toHaveLength(1);
  });

  it('captures after when score crosses triggerScore (default 0.7)', async () => {
    const { orch, client } = makeOrchestrator([0.55, 0.75]);
    await orch.observe('w0');
    const ev = await orch.observe('w1');
    expect(ev.type).toBe('captured');
    expect(ev.state).toBe('captured');
    expect(ev.baselineFile).toMatch(/baseline/);
    expect(ev.afterFile).toMatch(/after/);
    expect(client.saves).toHaveLength(2);
  });

  it('releases to idle only after score falls past trigger - hysteresis', async () => {
    const { orch } = makeOrchestrator([0.55, 0.75, 0.68, 0.6]);
    await orch.observe('w0'); // armed
    await orch.observe('w1'); // captured
    const ev2 = await orch.observe('w2'); // 0.68 > 0.65 → still captured
    expect(ev2.state).toBe('captured');
    const ev3 = await orch.observe('w3'); // 0.6 < 0.65 → released
    expect(ev3.type).toBe('released');
    expect(ev3.state).toBe('idle');
  });

  it('skips trigger if save is in flight (no race)', async () => {
    const client = new FakeClient();
    let resolveSave!: () => void;
    const blocker = new Promise<void>((r) => (resolveSave = r));
    client.saveSlot = async (slotId, filename) => {
      await blocker;
      client.saves.push({ slotId, filename });
      return { filename };
    };
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => 0.9,
    });
    const p1 = orch.observe('w0');
    const ev2 = await orch.observe('w1');
    expect(ev2.type).toBe('skipped');
    expect(ev2.reason).toBe('in-flight');
    resolveSave();
    const ev1 = await p1;
    expect(ev1.type).toBe('armed');
  });

  it('wraps scorer exceptions as error events without changing state', async () => {
    const client = new FakeClient();
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => {
        throw new Error('embedding service down');
      },
    });
    const ev = await orch.observe('w0');
    expect(ev.type).toBe('error');
    expect(ev.reason).toContain('embedding service down');
    expect(orch.getState()).toBe('idle');
    expect(client.saves).toHaveLength(0);
  });

  it('wraps save failures as error events without advancing state', async () => {
    const client = new FakeClient();
    client.failNext = true;
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => 0.9,
    });
    const ev = await orch.observe('w0');
    expect(ev.type).toBe('error');
    expect(ev.reason).toContain('disk full');
    expect(orch.getState()).toBe('idle');
  });

  it('finalize() captures a tail snapshot when armed but never triggered', async () => {
    const client = new FakeClient();
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => 0.55,
    });
    await orch.observe('w0'); // armed
    expect(orch.getState()).toBe('armed');
    const ev = await orch.finalize();
    expect(ev.type).toBe('captured');
    expect(ev.afterFile).toMatch(/finalize/);
    expect(client.saves).toHaveLength(2);
  });

  it('finalize() is a no-op when idle', async () => {
    const client = new FakeClient();
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => 0,
    });
    await orch.observe('w0');
    const ev = await orch.finalize();
    expect(ev.type).toBe('idle');
    expect(client.saves).toHaveLength(0);
  });

  it('default scorer (none provided) leaves orchestrator inert', async () => {
    const client = new FakeClient();
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
    });
    for (let i = 0; i < 5; i++) {
      const ev = await orch.observe(`w${i}`);
      expect(ev.state).toBe('idle');
    }
    expect(client.saves).toHaveLength(0);
  });

  it('rejects invalid threshold config', () => {
    const client = new FakeClient() as unknown as SlotSnapshotClient;
    expect(
      () =>
        new KvCaptureOrchestrator({
          client,
          slotId: 0,
          sessionId: 's',
          preTriggerScore: 0.8,
          triggerScore: 0.7,
        })
    ).toThrow(/preTriggerScore must be < triggerScore/);
    expect(
      () =>
        new KvCaptureOrchestrator({
          client,
          slotId: 0,
          sessionId: 's',
          hysteresis: -0.1,
        })
    ).toThrow(/hysteresis/);
  });

  it('clamps scorer output to [0,1]', async () => {
    const client = new FakeClient();
    const orch = new KvCaptureOrchestrator({
      client: client as unknown as SlotSnapshotClient,
      slotId: 0,
      sessionId: 's',
      scorer: async () => 5.0, // out of range
    });
    const ev = await orch.observe('w0');
    expect(ev.score).toBe(1);
    expect(ev.type).toBe('armed');
  });
});
