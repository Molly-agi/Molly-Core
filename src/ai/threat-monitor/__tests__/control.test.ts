/**
 * @jest-environment node
 */

import { run } from '../control';

jest.mock('../pid-file', () => ({
  THREAT_MONITOR_PID_PATH: '/tmp/test.pid',
  readPidFile: jest.fn(),
  clearPidFile: jest.fn(),
}));

import { readPidFile, clearPidFile } from '../pid-file';

const mockReadPidFile = readPidFile as jest.MockedFunction<typeof readPidFile>;
const mockClearPidFile = clearPidFile as jest.MockedFunction<
  typeof clearPidFile
>;

describe('control CLI', () => {
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;
  let killSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    killSpy = jest
      .spyOn(process, 'kill')
      .mockImplementation((() => true) as never);
    mockReadPidFile.mockReset();
    mockClearPidFile.mockReset();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    killSpy.mockRestore();
  });

  describe('status', () => {
    it('reports not running when no pid file', () => {
      mockReadPidFile.mockReturnValue(null);
      expect(run(['node', 'control', 'status'])).toBe(0);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/not running/);
    });

    it('reports stale when pid present but process dead', () => {
      mockReadPidFile.mockReturnValue({ pid: 12345, alive: false });
      expect(run(['node', 'control', 'status'])).toBe(1);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/stale/);
    });

    it('reports running when alive', () => {
      mockReadPidFile.mockReturnValue({ pid: 12345, alive: true });
      expect(run(['node', 'control', 'status'])).toBe(0);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/running.*12345/);
    });
  });

  describe('pause/resume/stop', () => {
    it('pause sends SIGUSR1 to live pid', () => {
      mockReadPidFile.mockReturnValue({ pid: 99, alive: true });
      expect(run(['node', 'control', 'pause'])).toBe(0);
      expect(killSpy).toHaveBeenCalledWith(99, 'SIGUSR1');
    });

    it('resume sends SIGUSR2 to live pid', () => {
      mockReadPidFile.mockReturnValue({ pid: 99, alive: true });
      expect(run(['node', 'control', 'resume'])).toBe(0);
      expect(killSpy).toHaveBeenCalledWith(99, 'SIGUSR2');
    });

    it('stop sends SIGTERM and clears pid file', () => {
      mockReadPidFile.mockReturnValue({ pid: 99, alive: true });
      expect(run(['node', 'control', 'stop'])).toBe(0);
      expect(killSpy).toHaveBeenCalledWith(99, 'SIGTERM');
      expect(mockClearPidFile).toHaveBeenCalled();
    });

    it('pause errors when not running', () => {
      mockReadPidFile.mockReturnValue(null);
      expect(run(['node', 'control', 'pause'])).toBe(1);
      expect(killSpy).not.toHaveBeenCalled();
    });

    it('pause errors when pid not alive', () => {
      mockReadPidFile.mockReturnValue({ pid: 99, alive: false });
      expect(run(['node', 'control', 'pause'])).toBe(1);
      expect(killSpy).not.toHaveBeenCalled();
    });

    it('stop does not clear pid file when send fails', () => {
      mockReadPidFile.mockReturnValue({ pid: 99, alive: true });
      killSpy.mockImplementation(() => {
        throw new Error('EPERM');
      });
      expect(run(['node', 'control', 'stop'])).toBe(1);
      expect(mockClearPidFile).not.toHaveBeenCalled();
    });
  });

  describe('usage', () => {
    it('prints usage with no command (exit 0)', () => {
      expect(run(['node', 'control'])).toBe(0);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/usage:/);
    });

    it('prints usage and exits 1 on unknown command', () => {
      expect(run(['node', 'control', 'bogus'])).toBe(1);
      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/usage:/);
    });
  });
});
