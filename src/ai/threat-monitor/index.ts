import { CorrelationEngine } from './correlation/correlation-engine';
import { createBurstRule } from './correlation/rules/burst-rule';
import { createMultiSourceRule } from './correlation/rules/multi-source-rule';
import { createAuthPressureRule } from './correlation/rules/auth-pressure-rule';

import { adminAuditSensor } from './sensors/admin-audit.sensor';
import { agentRegistrySensor } from './sensors/agent-registry.sensor';
import { bridgeEventsSensor } from './sensors/bridge-events.sensor';
import { familyAnchorSensor } from './sensors/family-anchor.sensor';
import { honeypotScanSensor } from './sensors/honeypot-scan.sensor';
import {
  memoryAuditConsolSensor,
  memoryAuditEvictSensor,
  memoryAuditLifecycleSensor,
} from './sensors/memory-audit.sensor';
import { quarantineLedgerSensor } from './sensors/quarantine-ledger.sensor';

import { forensicLedger } from './response/forensic-ledger';
import { bridgeAlerter } from './response/bridge-alerter';

export {
  threatSignalBus,
  type ThreatSignal,
  type ThreatSeverity,
} from './signal-bus';

const sensors = [
  adminAuditSensor,
  agentRegistrySensor,
  bridgeEventsSensor,
  familyAnchorSensor,
  honeypotScanSensor,
  memoryAuditConsolSensor,
  memoryAuditEvictSensor,
  memoryAuditLifecycleSensor,
  quarantineLedgerSensor,
];

let correlationEngine: CorrelationEngine | null = null;
let running = false;

export function startThreatMonitor(): void {
  if (running) return;

  // Sinks first so they catch any prime-time emissions during sensor boot.
  forensicLedger.start();
  bridgeAlerter.start();

  correlationEngine = new CorrelationEngine([
    createBurstRule(),
    createMultiSourceRule(),
    createAuthPressureRule(),
  ]);
  correlationEngine.start();

  for (const sensor of sensors) sensor.start();

  running = true;
}

export function stopThreatMonitor(): void {
  if (!running) return;

  for (const sensor of sensors) sensor.stop();
  correlationEngine?.stop();
  correlationEngine = null;
  bridgeAlerter.stop();
  forensicLedger.stop();

  running = false;
}

export function isThreatMonitorRunning(): boolean {
  return running;
}
