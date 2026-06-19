import { readPidFile, clearPidFile, HUNT_MODE_PID_PATH } from './pid-file';
import { rebuildProfiles } from './rebuild';

type Command = 'status' | 'snapshot' | 'stop' | 'rebuild';

const COMMANDS: Command[] = ['status', 'snapshot', 'stop', 'rebuild'];

export interface RunDeps {
  readPid?: typeof readPidFile;
  clearPid?: typeof clearPidFile;
  rebuild?: typeof rebuildProfiles;
  kill?: (pid: number, sig: NodeJS.Signals | 0) => boolean;
  log?: (msg: string) => void;
  err?: (msg: string) => void;
}

function defaultKill(pid: number, sig: NodeJS.Signals | 0): boolean {
  process.kill(pid, sig);
  return true;
}

function usage(log: (m: string) => void): void {
  log('usage: hunt-mode:ctl <status|snapshot|stop|rebuild>');
  log('  status   — show pid, alive, pid-file path');
  log('  snapshot — SIGUSR1 to running hunt-mode (force snapshot now)');
  log('  stop     — SIGTERM to running hunt-mode (graceful shutdown)');
  log(
    '  rebuild  — wipe profile store, replay forensic ledger, write fresh snapshot'
  );
}

function status(deps: Required<RunDeps>): number {
  const info = deps.readPid();
  if (!info) {
    deps.log('hunt-mode: not running (no pid file)');
    return 0;
  }
  if (!info.alive) {
    deps.log(
      `hunt-mode: pid file present (pid ${info.pid}) but process is dead — stale pid file`
    );
    deps.log(`  hint: rm ${HUNT_MODE_PID_PATH}`);
    return 1;
  }
  deps.log(`hunt-mode: running (pid ${info.pid})`);
  deps.log(`  pid file: ${HUNT_MODE_PID_PATH}`);
  return 0;
}

function signalRunning(
  deps: Required<RunDeps>,
  sig: NodeJS.Signals,
  label: string
): number {
  const info = deps.readPid();
  if (!info) {
    deps.err(`hunt-mode: not running — cannot ${label}`);
    return 1;
  }
  if (!info.alive) {
    deps.err(
      `hunt-mode: pid ${info.pid} not alive — cannot ${label} (clear stale pid file)`
    );
    return 1;
  }
  try {
    deps.kill(info.pid, sig);
    deps.log(`hunt-mode: sent ${sig} to pid ${info.pid} (${label})`);
    return 0;
  } catch (err) {
    deps.err(`hunt-mode: failed to send ${sig}: ${(err as Error).message}`);
    return 1;
  }
}

function stop(deps: Required<RunDeps>): number {
  const code = signalRunning(deps, 'SIGTERM', 'stop');
  if (code === 0) deps.clearPid();
  return code;
}

function rebuild(deps: Required<RunDeps>): number {
  const info = deps.readPid();
  if (info && info.alive) {
    deps.err(
      `hunt-mode: refusing to rebuild — running monitor (pid ${info.pid}) would race the snapshot. Stop it first.`
    );
    return 1;
  }
  const r = deps.rebuild();
  deps.log(
    `hunt-mode: rebuild complete — processed=${r.processed} skipped=${r.skipped} created=${r.created} updated=${r.updated} noIdentity=${r.noIdentity} profiles=${r.profiles}`
  );
  return 0;
}

export function run(argv: string[], depsIn: RunDeps = {}): number {
  const deps: Required<RunDeps> = {
    readPid: depsIn.readPid ?? readPidFile,
    clearPid: depsIn.clearPid ?? clearPidFile,
    rebuild: depsIn.rebuild ?? rebuildProfiles,
    kill: depsIn.kill ?? defaultKill,
    log: depsIn.log ?? ((m: string) => console.log(m)),
    err: depsIn.err ?? ((m: string) => console.error(m)),
  };
  const cmd = argv[2] as Command | undefined;
  if (!cmd || !COMMANDS.includes(cmd)) {
    usage(deps.log);
    return cmd ? 1 : 0;
  }
  switch (cmd) {
    case 'status':
      return status(deps);
    case 'snapshot':
      return signalRunning(deps, 'SIGUSR1', 'snapshot');
    case 'stop':
      return stop(deps);
    case 'rebuild':
      return rebuild(deps);
  }
}

if (require.main === module) {
  process.exit(run(process.argv));
}
