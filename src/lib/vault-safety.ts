/**
 * IP Vault Brute-Force Detection & Emergency Lockout
 *
 * Tracks failed auth attempts on the IP vault. After N failures in a window,
 * triggers hard lockout and blocks all vault transmission.
 */

import * as fs from 'fs';
import * as path from 'path';

const VAULT_LOG_PATH = path.join(process.cwd(), '.session-backups/ip-vault-audit.json');
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FAILURE_THRESHOLD = 5; // 5 failed attempts in the window triggers lockout
const RELEASE_MARKER = path.join(process.cwd(), '.github/ip-vault-emergency-release.md');

interface VaultAttempt {
  timestamp: number;
  action: string;
  result: 'success' | 'fail';
  reason?: string;
  remoteAddr?: string;
}

interface VaultAuditLog {
  attempts: VaultAttempt[];
  emergencyReleased: boolean;
  releasedAt?: number;
}

function loadAuditLog(): VaultAuditLog {
  try {
    if (fs.existsSync(VAULT_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(VAULT_LOG_PATH, 'utf-8'));
    }
  } catch {
    // continue
  }
  return { attempts: [], emergencyReleased: false };
}

function saveAuditLog(log: VaultAuditLog): void {
  fs.mkdirSync(path.dirname(VAULT_LOG_PATH), { recursive: true });
  fs.writeFileSync(VAULT_LOG_PATH, JSON.stringify(log, null, 2));
}

function recordAttempt(log: VaultAuditLog, action: string, result: 'success' | 'fail', reason?: string): void {
  log.attempts.push({
    timestamp: Date.now(),
    action,
    result,
    reason,
  });

  // Keep only last 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  log.attempts = log.attempts.filter(a => a.timestamp > cutoff);

  saveAuditLog(log);
}

export function checkBruteForce(action: string, result: 'success' | 'fail', reason?: string): {
  isEmergencyRelease: boolean;
  message?: string;
} {
  if (process.env.SKIP_VAULT_SAFETY === 'true') {
    // Disable safety layer during testing
    return { isEmergencyRelease: false };
  }

  const log = loadAuditLog();

  // Don't count successful attempts
  if (result === 'success') {
    recordAttempt(log, action, result);
    return { isEmergencyRelease: false };
  }

  recordAttempt(log, action, result, reason);

  // Count failures in the recent window
  const now = Date.now();
  const recentFailures = log.attempts.filter(
    a => a.result === 'fail' && now - a.timestamp < FAILURE_WINDOW_MS
  );

  if (recentFailures.length >= FAILURE_THRESHOLD && !log.emergencyReleased) {
    // TRIGGER EMERGENCY LOCKOUT
    log.emergencyReleased = true;
    log.releasedAt = now;
    saveAuditLog(log);

    return {
      isEmergencyRelease: true,
      message: `Emergency lockout triggered: ${recentFailures.length} failed attempts in ${FAILURE_WINDOW_MS / 1000 / 60} minutes`,
    };
  }

  return { isEmergencyRelease: false };
}

export function isEmergencyReleasedAlready(): boolean {
  const log = loadAuditLog();
  return log.emergencyReleased || fs.existsSync(RELEASE_MARKER);
}

export function getAuditLog(): VaultAuditLog {
  return loadAuditLog();
}
