/**
 * @jest-environment node
 */

import { threatSignalBus, type ThreatSignal } from '../signal-bus';

describe('ThreatSignalBus pause/resume', () => {
  beforeEach(() => {
    threatSignalBus.resume();
    threatSignalBus.resetSuppressedCount();
    threatSignalBus.removeAllListeners();
  });

  const sample: ThreatSignal = {
    source: 'unit',
    severity: 'info',
    timestamp: '2026-06-19T00:00:00.000Z',
    summary: 'test',
    evidence: null,
  };

  it('emits when not paused', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));
    threatSignalBus.emitSignal(sample);
    expect(received).toHaveLength(1);
    expect(threatSignalBus.isPaused()).toBe(false);
  });

  it('suppresses emit when paused and counts suppressions', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));
    threatSignalBus.pause();
    threatSignalBus.emitSignal(sample);
    threatSignalBus.emitSignal(sample);
    expect(received).toHaveLength(0);
    expect(threatSignalBus.isPaused()).toBe(true);
    expect(threatSignalBus.getSuppressedCount()).toBe(2);
  });

  it('resume restores emission, resetSuppressedCount zeros counter', () => {
    const received: ThreatSignal[] = [];
    threatSignalBus.onSignal((s) => received.push(s));
    threatSignalBus.pause();
    threatSignalBus.emitSignal(sample);
    threatSignalBus.resume();
    threatSignalBus.emitSignal(sample);
    expect(received).toHaveLength(1);
    expect(threatSignalBus.getSuppressedCount()).toBe(1);
    threatSignalBus.resetSuppressedCount();
    expect(threatSignalBus.getSuppressedCount()).toBe(0);
  });
});
