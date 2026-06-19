/**
 * @jest-environment node
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writePidFile,
  clearPidFile,
  readPidFile,
  isProcessAlive,
} from '../pid-file';

describe('pid-file', () => {
  let dir: string;
  let pidPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tm-pid-'));
    pidPath = join(dir, '.threat-monitor.pid');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writePidFile writes current pid; readPidFile returns it with alive=true', () => {
    writePidFile(pidPath);
    const info = readPidFile(pidPath);
    expect(info).not.toBeNull();
    expect(info!.pid).toBe(process.pid);
    expect(info!.alive).toBe(true);
  });

  it('readPidFile returns null when file missing', () => {
    expect(readPidFile(pidPath)).toBeNull();
  });

  it('readPidFile returns alive=false for a non-existent pid', () => {
    // PID 1 is init/systemd — always alive. Use a huge pid that won't exist.
    writeFileSync(pidPath, '2147483646', 'utf8');
    const info = readPidFile(pidPath);
    expect(info).not.toBeNull();
    expect(info!.alive).toBe(false);
  });

  it('readPidFile returns null when contents are not a valid pid', () => {
    writeFileSync(pidPath, 'not-a-number', 'utf8');
    expect(readPidFile(pidPath)).toBeNull();
  });

  it('clearPidFile removes the file and is idempotent', () => {
    writePidFile(pidPath);
    clearPidFile(pidPath);
    expect(readPidFile(pidPath)).toBeNull();
    clearPidFile(pidPath); // no throw
  });

  it('isProcessAlive returns true for self, false for impossible pid', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2147483646)).toBe(false);
  });
});
