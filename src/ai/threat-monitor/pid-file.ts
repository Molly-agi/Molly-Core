import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PID_PATH = resolve(process.cwd(), '.threat-monitor.pid');

export interface PidFileInfo {
  pid: number;
  alive: boolean;
}

export function writePidFile(path: string = DEFAULT_PID_PATH): void {
  writeFileSync(path, String(process.pid), 'utf8');
}

export function clearPidFile(path: string = DEFAULT_PID_PATH): void {
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
}

export function readPidFile(
  path: string = DEFAULT_PID_PATH
): PidFileInfo | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  const pid = Number.parseInt(raw, 10);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return { pid, alive: isProcessAlive(pid) };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export const THREAT_MONITOR_PID_PATH = DEFAULT_PID_PATH;
