/**
 * @jest-environment node
 */

import { EventEmitter } from 'node:events';
import { bootCli } from '../cli';

function makeProc(): NodeJS.Process {
  const emitter = new EventEmitter();
  const proc = emitter as unknown as NodeJS.Process;
  (proc as unknown as { pid: number }).pid = 12345;
  (proc as unknown as { exit: jest.Mock }).exit = jest.fn();
  return proc;
}

interface FakeBus {
  pause: jest.Mock;
  resume: jest.Mock;
  getSuppressedCount: jest.Mock;
  resetSuppressedCount: jest.Mock;
}

function makeBus(suppressed = 0): FakeBus {
  return {
    pause: jest.fn(),
    resume: jest.fn(),
    getSuppressedCount: jest.fn(() => suppressed),
    resetSuppressedCount: jest.fn(),
  };
}

describe('cli bootCli', () => {
  it('writes pid, starts monitor, registers four signal handlers', () => {
    const start = jest.fn();
    const writePid = jest.fn();
    const log = jest.fn();
    const proc = makeProc();
    const bus = makeBus();

    bootCli({
      start,
      stop: jest.fn(),
      writePid,
      clearPid: jest.fn(),
      bus: bus as never,
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

  it('SIGUSR1 pauses the bus', () => {
    const proc = makeProc();
    const bus = makeBus();
    bootCli({
      start: jest.fn(),
      stop: jest.fn(),
      writePid: jest.fn(),
      clearPid: jest.fn(),
      bus: bus as never,
      log: jest.fn(),
      proc,
    });
    proc.emit('SIGUSR1');
    expect(bus.pause).toHaveBeenCalled();
  });

  it('SIGUSR2 resumes, reports suppressed count, resets it', () => {
    const proc = makeProc();
    const bus = makeBus(42);
    const log = jest.fn();
    bootCli({
      start: jest.fn(),
      stop: jest.fn(),
      writePid: jest.fn(),
      clearPid: jest.fn(),
      bus: bus as never,
      log,
      proc,
    });
    proc.emit('SIGUSR2');
    expect(bus.getSuppressedCount).toHaveBeenCalled();
    expect(bus.resume).toHaveBeenCalled();
    expect(bus.resetSuppressedCount).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toMatch(
      /42 signals were suppressed/
    );
  });

  it('SIGTERM stops monitor, clears pid, exits 0', () => {
    const stop = jest.fn();
    const clearPid = jest.fn();
    const proc = makeProc();
    bootCli({
      start: jest.fn(),
      stop,
      writePid: jest.fn(),
      clearPid,
      bus: makeBus() as never,
      log: jest.fn(),
      proc,
    });
    proc.emit('SIGTERM');
    expect(stop).toHaveBeenCalled();
    expect(clearPid).toHaveBeenCalled();
    expect(proc.exit as unknown as jest.Mock).toHaveBeenCalledWith(0);
  });

  it('SIGINT also triggers clean shutdown', () => {
    const stop = jest.fn();
    const clearPid = jest.fn();
    const proc = makeProc();
    bootCli({
      start: jest.fn(),
      stop,
      writePid: jest.fn(),
      clearPid,
      bus: makeBus() as never,
      log: jest.fn(),
      proc,
    });
    proc.emit('SIGINT');
    expect(stop).toHaveBeenCalled();
    expect(clearPid).toHaveBeenCalled();
    expect(proc.exit as unknown as jest.Mock).toHaveBeenCalledWith(0);
  });

  it('returned dispose function removes all handlers', () => {
    const proc = makeProc();
    const dispose = bootCli({
      start: jest.fn(),
      stop: jest.fn(),
      writePid: jest.fn(),
      clearPid: jest.fn(),
      bus: makeBus() as never,
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
