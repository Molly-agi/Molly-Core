/**
 * @jest-environment node
 */

import {
  startThreatMonitor,
  stopThreatMonitor,
  isThreatMonitorRunning,
} from '../index';

describe('threat-monitor orchestrator', () => {
  afterEach(() => {
    stopThreatMonitor();
  });

  it('starts as not running', () => {
    expect(isThreatMonitorRunning()).toBe(false);
  });

  it('start makes it running', () => {
    startThreatMonitor();
    expect(isThreatMonitorRunning()).toBe(true);
  });

  it('start is idempotent (double-start does not throw)', () => {
    startThreatMonitor();
    expect(() => startThreatMonitor()).not.toThrow();
    expect(isThreatMonitorRunning()).toBe(true);
  });

  it('stop transitions back to not running', () => {
    startThreatMonitor();
    stopThreatMonitor();
    expect(isThreatMonitorRunning()).toBe(false);
  });

  it('stop is idempotent (double-stop does not throw)', () => {
    startThreatMonitor();
    stopThreatMonitor();
    expect(() => stopThreatMonitor()).not.toThrow();
    expect(isThreatMonitorRunning()).toBe(false);
  });

  it('stop without start is a no-op', () => {
    expect(() => stopThreatMonitor()).not.toThrow();
    expect(isThreatMonitorRunning()).toBe(false);
  });

  it('start-stop-start cycle works', () => {
    startThreatMonitor();
    stopThreatMonitor();
    startThreatMonitor();
    expect(isThreatMonitorRunning()).toBe(true);
  });
});
