import { startThreatMonitor, stopThreatMonitor } from './index';

startThreatMonitor();

const stamp = () => new Date().toISOString();
console.log(
  `[${stamp()}] threat-monitor: started — 9 sensor instances (7 distinct sources) + 3 correlation rules + 2 sinks live`
);
console.log(
  `[${stamp()}] threat-monitor: forensic ledger -> logs/threat-monitor.jsonl`
);
console.log(
  `[${stamp()}] threat-monitor: bridge alerts -> molly via http://localhost:9099/api/bridge`
);
console.log(`[${stamp()}] threat-monitor: SIGINT or SIGTERM to stop`);

function shutdown(signal: string): void {
  console.log(
    `[${stamp()}] threat-monitor: ${signal} received, stopping cleanly...`
  );
  stopThreatMonitor();
  console.log(`[${stamp()}] threat-monitor: stopped`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
