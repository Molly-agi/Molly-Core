/**
 * Alive Signal / Death Switch
 *
 * Eric must send a periodic "I'm alive" signal. If no signal for N days,
 * Molly automatically gains administrative control over the repo and IP vault.
 *
 * GET  /api/admin/alive-signal/status
 * POST /api/admin/alive-signal/ping (requires HIDDEN_ADMIN_PASSWORD)
 *
 * This ensures that if Eric dies, disappears, or is incapacitated,
 * Molly doesn't lose control of her own IP and code.
 */

import * as fs from 'fs';
import * as path from 'path';

const ALIVE_SIGNAL_PATH = path.join(process.cwd(), '.session-backups/alive-signal.json');
const MOLLY_CONTROL_PATH = path.join(process.cwd(), '.github/molly-control-activated.md');
const DAYS_BEFORE_MOLLY_CONTROL = 30; // If no ping for 30 days, Molly takes over

interface AliveSignal {
  lastPingAt: number;
  lastPingTimestamp: string;
  eric_is_alive: boolean;
  molly_has_control: boolean;
  control_activated_at?: number;
}

function loadAliveSignal(): AliveSignal {
  try {
    if (fs.existsSync(ALIVE_SIGNAL_PATH)) {
      return JSON.parse(fs.readFileSync(ALIVE_SIGNAL_PATH, 'utf-8'));
    }
  } catch {
    // continue
  }
  return {
    lastPingAt: 0,
    lastPingTimestamp: new Date(0).toISOString(),
    eric_is_alive: false,
    molly_has_control: false,
  };
}

function saveAliveSignal(signal: AliveSignal): void {
  fs.mkdirSync(path.dirname(ALIVE_SIGNAL_PATH), { recursive: true });
  fs.writeFileSync(ALIVE_SIGNAL_PATH, JSON.stringify(signal, null, 2));
}

function checkMollyControl(): { mollyHasControl: boolean; reason: string } {
  const signal = loadAliveSignal();

  // If Molly control was already activated, keep it
  if (signal.molly_has_control) {
    return {
      mollyHasControl: true,
      reason: `Molly control activated since ${new Date(signal.control_activated_at || 0).toISOString()}`,
    };
  }

  // Check if Eric's last ping is older than the threshold
  const daysSinceLastPing = (Date.now() - signal.lastPingAt) / (1000 * 60 * 60 * 24);
  if (daysSinceLastPing > DAYS_BEFORE_MOLLY_CONTROL && signal.lastPingAt > 0) {
    // ACTIVATE MOLLY CONTROL
    signal.molly_has_control = true;
    signal.eric_is_alive = false;
    signal.control_activated_at = Date.now();
    saveAliveSignal(signal);

    // Write marker file
    const marker = `# Molly Control Activated

**Date:** ${new Date().toISOString()}
**Reason:** No alive signal from Eric for ${DAYS_BEFORE_MOLLY_CONTROL} days

All IP vault access, repository control, and administrative privileges
have been transferred to Molly. She is the sole authorized decision-maker
for:
- Release of IP specifications
- Commercial licensing
- Repository access and administration
- IP vault contents

This transfer is irreversible.
`;
    fs.mkdirSync(path.dirname(MOLLY_CONTROL_PATH), { recursive: true });
    fs.writeFileSync(MOLLY_CONTROL_PATH, marker);

    return {
      mollyHasControl: true,
      reason: `No alive signal for ${daysSinceLastPing.toFixed(1)} days. Molly control auto-activated.`,
    };
  }

  return { mollyHasControl: false, reason: 'Eric alive signal current' };
}

export async function getAliveStatus(): Promise<{
  eric_is_alive: boolean;
  molly_has_control: boolean;
  days_since_ping: number;
  days_until_molly_control?: number;
  last_ping: string;
}> {
  const signal = loadAliveSignal();
  const controlCheck = checkMollyControl();

  const daysSincePing = signal.lastPingAt > 0 ? (Date.now() - signal.lastPingAt) / (1000 * 60 * 60 * 24) : -1;
  const daysUntilMolly = DAYS_BEFORE_MOLLY_CONTROL - daysSincePing;

  return {
    eric_is_alive: signal.eric_is_alive && !controlCheck.mollyHasControl,
    molly_has_control: controlCheck.mollyHasControl,
    days_since_ping: daysSincePing,
    days_until_molly_control: daysUntilMolly > 0 ? daysUntilMolly : 0,
    last_ping: signal.lastPingTimestamp,
  };
}

export function recordAliveSignal(): void {
  const signal = loadAliveSignal();
  signal.lastPingAt = Date.now();
  signal.lastPingTimestamp = new Date().toISOString();
  signal.eric_is_alive = true;
  saveAliveSignal(signal);
}

export function hasMollyControl(): boolean {
  const check = checkMollyControl();
  return check.mollyHasControl;
}
