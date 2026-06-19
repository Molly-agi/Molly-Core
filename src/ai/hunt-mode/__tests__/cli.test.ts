/**
 * @jest-environment node
 */

import { EventEmitter } from 'node:events';
import { bootCli } from '../cli';

function makeProc(): NodeJS.Process {
  const emitter = new EventEmitter();
  const proc = emitter as unknown as NodeJS.Process;
  (proc as unknown as { pid: number }).pid = 54321;
  (proc as unknown as { exit: jest.Mock }).exit = jest.fn();
  return proc;
}

function makeHandle(
  overrides: Partial<{
    pendingSize: number;
    snapshotIfDueResult: boolean;
  }> = {}
) {
  const tail = { drainOnce: jest.fn() };
  const store = { size: jest.fn(() => overrides.pendingSize ?? 0) };
  return {
    stop: jest.fn(),
    store: jest.fn(() => store),
    tail: jest.fn(() => tail),
    builder: jest.fn(),
    snapshotIfDue: jest.fn(() => overrides.snapshotIfDueResult ?? false),
    _tail: tail,
    _store: store,
  };
}

describe('hunt-mode cli bootCli', () => {
  it('writes pid, starts hunt-mode, registers four signal handlers', () => {
    const handle = makeHandle();
    const start = jest.fn(() => handle as never);
    const writePid = jest.fn();
    const log = jest.fn();
    const proc = makeProc();

    bootCli({
      start,
      writePid,
      clearPid: jest.fn(),
      log,
      proc,
    });

    expect(writePid).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
    expect(proc.listenerCount('SIGINT')).toBe(1);
    expect(proc.listenerCount('SIGTERM')).toBe(1);
    expect(proc.listenerCount('SIGUSR1')).toBe(1);
    expect(proc.listenerCount('SIGUSR2')).toBe(1);
    expect(log).toHaveBeenCalled();
  });

  it('SIGUSR1 triggers snapshotIfDue and logs result (written)', () => {
    const handle = makeHandle({ snapshotIfDueResult: true });
    const log = jest.fn();
    const proc = makeProc();
    bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid: jest.fn(),
      log,
      proc,
    });
    proc.emit('SIGUSR1');
    expect(handle.snapshotIfDue).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toMatch(/snapshot written/);
  });

  it('SIGUSR1 logs "skipped" when nothing pending', () => {
    const handle = makeHandle({ snapshotIfDueResult: false });
    const log = jest.fn();
    const proc = makeProc();
    bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid: jest.fn(),
      log,
      proc,
    });
    proc.emit('SIGUSR1');
    expect(log.mock.calls.flat().join(' ')).toMatch(/snapshot skipped/);
  });

  it('SIGUSR2 forces a ledger drain', () => {
    const handle = makeHandle();
    const log = jest.fn();
    const proc = makeProc();
    bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid: jest.fn(),
      log,
      proc,
    });
    proc.emit('SIGUSR2');
    expect(handle._tail.drainOnce).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toMatch(/forced ledger drain/);
  });

  it('SIGTERM stops hunt-mode, clears pid, exits 0', () => {
    const handle = makeHandle();
    const clearPid = jest.fn();
    const proc = makeProc();
    bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid,
      log: jest.fn(),
      proc,
    });
    proc.emit('SIGTERM');
    expect(handle.stop).toHaveBeenCalled();
    expect(clearPid).toHaveBeenCalled();
    expect(proc.exit as unknown as jest.Mock).toHaveBeenCalledWith(0);
  });

  it('SIGINT also triggers clean shutdown', () => {
    const handle = makeHandle();
    const clearPid = jest.fn();
    const proc = makeProc();
    bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid,
      log: jest.fn(),
      proc,
    });
    proc.emit('SIGINT');
    expect(handle.stop).toHaveBeenCalled();
    expect(clearPid).toHaveBeenCalled();
    expect(proc.exit as unknown as jest.Mock).toHaveBeenCalledWith(0);
  });

  it('returned dispose function removes all handlers', () => {
    const handle = makeHandle();
    const proc = makeProc();
    const dispose = bootCli({
      start: () => handle as never,
      writePid: jest.fn(),
      clearPid: jest.fn(),
      log: jest.fn(),
      proc,
    });
    dispose();
    expect(proc.listenerCount('SIGINT')).toBe(0);
    expect(proc.listenerCount('SIGTERM')).toBe(0);
    expect(proc.listenerCount('SIGUSR1')).toBe(0);
    expect(proc.listenerCount('SIGUSR2')).toBe(0);
  });
});
