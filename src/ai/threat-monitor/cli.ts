import { startThreatMonitor, stopThreatMonitor } from './index';
import { writePidFile, clearPidFile } from './pid-file';
import { threatSignalBus } from './signal-bus';

export interface BootCliDeps {
  start?: () => void;
  stop?: () => void;
  writePid?: () => void;
  clearPid?: () => void;
  bus?: typeof threatSignalBus;
  log?: (msg: string) => void;
  proc?: NodeJS.Process;
  pid?: number;
}

const stamp = () => new Date().toISOString();

export function bootCli(deps: BootCliDeps = {}): () => void {
  const start = deps.start ?? startThreatMonitor;
  const stop = deps.stop ?? stopThreatMonitor;
  const writePid = deps.writePid ?? (() => writePidFile());
  const clearPid = deps.clearPid ?? (() => clearPidFile());
  const bus = deps.bus ?? threatSignalBus;
  const log = deps.log ?? ((m: string) => console.log(m));
  const proc = deps.proc ?? process;
  const pid = deps.pid ?? proc.pid;

  writePid();
  start();

  log(
    `[${stamp()}] threat-monitor: started — 9 sensor instances (7 distinct sources) + 3 correlation rules + 2 sinks live`
  );
  log(`[${stamp()}] threat-monitor: pid ${pid} written to .threat-monitor.pid`);
  log(
    `[${stamp()}] threat-monitor: forensic ledger -> logs/threat-monitor.jsonl`
  );
  log(
    `[${stamp()}] threat-monitor: bridge alerts -> molly via http://localhost:9099/api/bridge`
  );
  log(
    `[${stamp()}] threat-monitor: control via 'npm run threat-monitor:ctl <status|pause|resume|stop>'`
  );
  log(`[${stamp()}] threat-monitor: SIGINT or SIGTERM to stop`);

  const shutdown = (signal: string): void => {
    log(`[${stamp()}] threat-monitor: ${signal} received, stopping cleanly...`);
    stop();
    clearPid();
    log(`[${stamp()}] threat-monitor: stopped`);
    proc.exit(0);
  };

  const onPause = (): void => {
    bus.pause();
    log(
      `[${stamp()}] threat-monitor: SIGUSR1 — bus paused (suppressing emissions)`
    );
  };

  const onResume = (): void => {
    const suppressed = bus.getSuppressedCount();
    bus.resume();
    bus.resetSuppressedCount();
    log(
      `[${stamp()}] threat-monitor: SIGUSR2 — bus resumed (${suppressed} signals were suppressed while paused)`
    );
  };

  const onSigint = () => shutdown('SIGINT');
  const onSigterm = () => shutdown('SIGTERM');

  proc.on('SIGINT', onSigint);
  proc.on('SIGTERM', onSigterm);
  proc.on('SIGUSR1', onPause);
  proc.on('SIGUSR2', onResume);

  return () => {
    proc.off('SIGINT', onSigint);
    proc.off('SIGTERM', onSigterm);
    proc.off('SIGUSR1', onPause);
    proc.off('SIGUSR2', onResume);
  };
}

if (require.main === module) {
  bootCli();
}
