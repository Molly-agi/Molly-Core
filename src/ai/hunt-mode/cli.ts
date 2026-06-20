import { startHuntMode, HuntModeHandle, HuntModeOptions } from './index';
import { writePidFile, clearPidFile } from './pid-file';

export interface BootCliDeps {
  start?: (opts?: HuntModeOptions) => HuntModeHandle;
  writePid?: () => void;
  clearPid?: () => void;
  log?: (msg: string) => void;
  proc?: NodeJS.Process;
  pid?: number;
  options?: HuntModeOptions;
}

const stamp = () => new Date().toISOString();

export function bootCli(deps: BootCliDeps = {}): () => void {
  const start = deps.start ?? startHuntMode;
  const writePid = deps.writePid ?? (() => writePidFile());
  const clearPid = deps.clearPid ?? (() => clearPidFile());
  const log = deps.log ?? ((m: string) => console.log(m));
  const proc = deps.proc ?? process;
  const pid = deps.pid ?? proc.pid;

  writePid();
  const handle = start(deps.options);

  log(
    `[${stamp()}] hunt-mode: started — tailing forensic ledger, building attacker profiles`
  );
  log(`[${stamp()}] hunt-mode: pid ${pid} written to .hunt-mode.pid`);
  log(`[${stamp()}] hunt-mode: profile store -> .hunt/profiles.snapshot.json`);
  log(
    `[${stamp()}] hunt-mode: control via 'npm run hunt-mode:ctl <status|snapshot|stop>'`
  );
  log(`[${stamp()}] hunt-mode: SIGINT or SIGTERM to stop`);

  const shutdown = (signal: string): void => {
    log(`[${stamp()}] hunt-mode: ${signal} received, stopping cleanly...`);
    handle.stop();
    clearPid();
    log(
      `[${stamp()}] hunt-mode: stopped (${handle.store().size()} profiles persisted)`
    );
    proc.exit(0);
  };

  const onSnapshot = (): void => {
    const fired = handle.snapshotIfDue();
    const size = handle.store().size();
    log(
      `[${stamp()}] hunt-mode: SIGUSR1 — snapshot ${fired ? 'written' : 'skipped (nothing pending)'} (${size} profiles)`
    );
  };

  const onDrain = (): void => {
    handle.tail().drainOnce();
    log(`[${stamp()}] hunt-mode: SIGUSR2 — forced ledger drain`);
  };

  const onSigint = () => shutdown('SIGINT');
  const onSigterm = () => shutdown('SIGTERM');

  proc.on('SIGINT', onSigint);
  proc.on('SIGTERM', onSigterm);
  proc.on('SIGUSR1', onSnapshot);
  proc.on('SIGUSR2', onDrain);

  return () => {
    proc.off('SIGINT', onSigint);
    proc.off('SIGTERM', onSigterm);
    proc.off('SIGUSR1', onSnapshot);
    proc.off('SIGUSR2', onDrain);
  };
}

if (require.main === module) {
  bootCli();
}
