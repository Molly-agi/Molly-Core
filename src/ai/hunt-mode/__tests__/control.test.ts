/**
 * @jest-environment node
 */

import { run } from '../control';
import type { PidFileInfo } from '../pid-file';

function makeDeps(
  overrides: {
    pidInfo?: PidFileInfo | null;
    killThrows?: Error;
    rebuildResult?: {
      processed: number;
      skipped: number;
      created: number;
      updated: number;
      noIdentity: number;
      profiles: number;
    };
  } = {}
) {
  const log = jest.fn();
  const err = jest.fn();
  const readPid = jest.fn(() => overrides.pidInfo ?? null);
  const clearPid = jest.fn();
  const kill = jest.fn((_pid: number, _sig: NodeJS.Signals | 0) => {
    if (overrides.killThrows) throw overrides.killThrows;
    return true;
  });
  const rebuild = jest.fn(
    () =>
      overrides.rebuildResult ?? {
        processed: 0,
        skipped: 0,
        created: 0,
        updated: 0,
        noIdentity: 0,
        profiles: 0,
      }
  );
  return { log, err, readPid, clearPid, kill, rebuild };
}

describe('hunt-mode control CLI', () => {
  describe('status', () => {
    it('reports not running when no pid file', () => {
      const deps = makeDeps({ pidInfo: null });
      expect(run(['node', 'control', 'status'], deps)).toBe(0);
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(/not running/);
    });

    it('reports stale when pid present but process dead', () => {
      const deps = makeDeps({ pidInfo: { pid: 12345, alive: false } });
      expect(run(['node', 'control', 'status'], deps)).toBe(1);
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(/stale/);
    });

    it('reports running when alive', () => {
      const deps = makeDeps({ pidInfo: { pid: 12345, alive: true } });
      expect(run(['node', 'control', 'status'], deps)).toBe(0);
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(/running.*12345/);
    });
  });

  describe('snapshot/stop', () => {
    it('snapshot sends SIGUSR1 to live pid', () => {
      const deps = makeDeps({ pidInfo: { pid: 99, alive: true } });
      expect(run(['node', 'control', 'snapshot'], deps)).toBe(0);
      expect(deps.kill).toHaveBeenCalledWith(99, 'SIGUSR1');
    });

    it('stop sends SIGTERM and clears pid file', () => {
      const deps = makeDeps({ pidInfo: { pid: 99, alive: true } });
      expect(run(['node', 'control', 'stop'], deps)).toBe(0);
      expect(deps.kill).toHaveBeenCalledWith(99, 'SIGTERM');
      expect(deps.clearPid).toHaveBeenCalled();
    });

    it('snapshot errors when not running', () => {
      const deps = makeDeps({ pidInfo: null });
      expect(run(['node', 'control', 'snapshot'], deps)).toBe(1);
      expect(deps.kill).not.toHaveBeenCalled();
    });

    it('snapshot errors when pid not alive', () => {
      const deps = makeDeps({ pidInfo: { pid: 99, alive: false } });
      expect(run(['node', 'control', 'snapshot'], deps)).toBe(1);
      expect(deps.kill).not.toHaveBeenCalled();
    });

    it('stop does not clear pid file when send fails', () => {
      const deps = makeDeps({
        pidInfo: { pid: 99, alive: true },
        killThrows: new Error('EPERM'),
      });
      expect(run(['node', 'control', 'stop'], deps)).toBe(1);
      expect(deps.clearPid).not.toHaveBeenCalled();
      expect(deps.err.mock.calls.flat().join(' ')).toMatch(/EPERM/);
    });
  });

  describe('rebuild', () => {
    it('refuses to rebuild while a live hunt-mode is running', () => {
      const deps = makeDeps({ pidInfo: { pid: 77, alive: true } });
      expect(run(['node', 'control', 'rebuild'], deps)).toBe(1);
      expect(deps.rebuild).not.toHaveBeenCalled();
      expect(deps.err.mock.calls.flat().join(' ')).toMatch(
        /refusing to rebuild/
      );
    });

    it('runs rebuild when no pid file', () => {
      const deps = makeDeps({
        pidInfo: null,
        rebuildResult: {
          processed: 10,
          skipped: 1,
          created: 3,
          updated: 7,
          noIdentity: 0,
          profiles: 3,
        },
      });
      expect(run(['node', 'control', 'rebuild'], deps)).toBe(0);
      expect(deps.rebuild).toHaveBeenCalled();
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(
        /processed=10.*created=3.*profiles=3/
      );
    });

    it('runs rebuild when pid file is stale (process dead)', () => {
      const deps = makeDeps({ pidInfo: { pid: 99, alive: false } });
      expect(run(['node', 'control', 'rebuild'], deps)).toBe(0);
      expect(deps.rebuild).toHaveBeenCalled();
    });
  });

  describe('usage', () => {
    it('prints usage with no command (exit 0)', () => {
      const deps = makeDeps();
      expect(run(['node', 'control'], deps)).toBe(0);
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(/usage:/);
    });

    it('prints usage and exits 1 on unknown command', () => {
      const deps = makeDeps();
      expect(run(['node', 'control', 'bogus'], deps)).toBe(1);
      expect(deps.log.mock.calls.flat().join(' ')).toMatch(/usage:/);
    });
  });
});
