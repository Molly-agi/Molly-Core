import { readPidFile, clearPidFile, THREAT_MONITOR_PID_PATH } from './pid-file';

type Command = 'status' | 'pause' | 'resume' | 'stop';

const COMMANDS: Command[] = ['status', 'pause', 'resume', 'stop'];

function usage(): void {
  console.log('usage: threat-monitor:ctl <status|pause|resume|stop>');
  console.log('  status  — show pid, alive, pid-file path');
  console.log('  pause   — SIGUSR1 to running monitor (suppress emissions)');
  console.log('  resume  — SIGUSR2 to running monitor (re-enable emissions)');
  console.log('  stop    — SIGTERM to running monitor (graceful shutdown)');
}

function status(): number {
  const info = readPidFile();
  if (!info) {
    console.log('threat-monitor: not running (no pid file)');
    return 0;
  }
  if (!info.alive) {
    console.log(
      `threat-monitor: pid file present (pid ${info.pid}) but process is dead — stale pid file`
    );
    console.log(`  hint: rm ${THREAT_MONITOR_PID_PATH}`);
    return 1;
  }
  console.log(`threat-monitor: running (pid ${info.pid})`);
  console.log(`  pid file: ${THREAT_MONITOR_PID_PATH}`);
  return 0;
}

function signalRunning(sig: NodeJS.Signals, label: string): number {
  const info = readPidFile();
  if (!info) {
    console.error(`threat-monitor: not running — cannot ${label}`);
    return 1;
  }
  if (!info.alive) {
    console.error(
      `threat-monitor: pid ${info.pid} not alive — cannot ${label} (clear stale pid file)`
    );
    return 1;
  }
  try {
    process.kill(info.pid, sig);
    console.log(`threat-monitor: sent ${sig} to pid ${info.pid} (${label})`);
    return 0;
  } catch (err) {
    console.error(
      `threat-monitor: failed to send ${sig}: ${(err as Error).message}`
    );
    return 1;
  }
}

function stop(): number {
  const code = signalRunning('SIGTERM', 'stop');
  if (code === 0) clearPidFile();
  return code;
}

export function run(argv: string[]): number {
  const cmd = argv[2] as Command | undefined;
  if (!cmd || !COMMANDS.includes(cmd)) {
    usage();
    return cmd ? 1 : 0;
  }
  switch (cmd) {
    case 'status':
      return status();
    case 'pause':
      return signalRunning('SIGUSR1', 'pause bus');
    case 'resume':
      return signalRunning('SIGUSR2', 'resume bus');
    case 'stop':
      return stop();
  }
}

if (require.main === module) {
  process.exit(run(process.argv));
}
