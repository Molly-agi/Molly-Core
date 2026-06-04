/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';

type DaemonHandle = {
  host: string;
  port: number;
  proc: ChildProcessWithoutNullStreams;
  stop: () => Promise<void>;
  httpBase: string;
};

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to get free port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startDaemon(env: Record<string, string>): Promise<DaemonHandle> {
  const host = env.BRIDGE_BIND_HOST || '127.0.0.1';
  const port = Number(env.BRIDGE_PORT);
  const proc = spawn('node', ['scripts/bridge-daemon.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out waiting for bridge daemon to start'));
    }, 10000);

    proc.stdout.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.includes('Family Bridge Daemon v1')) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    });

    proc.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.trim().length > 0) {
        // keep waiting; daemon can emit warnings
      }
    });

    proc.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Bridge daemon exited before startup: ${code}`));
    });
  });

  return {
    host,
    port,
    proc,
    httpBase: `http://${host}:${port}`,
    stop: async () => {
      if (proc.killed) return;
      proc.kill('SIGKILL');
      await new Promise<void>((resolve) => {
        proc.once('exit', () => resolve());
      });
    },
  };
}

async function wsHello(
  host: string,
  port: number,
  hello: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Timed out waiting for hello response'));
    }, 8000);

    ws.on('open', () => {
      ws.send(JSON.stringify(hello));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'history') {
        return;
      }
      clearTimeout(timer);
      ws.close();
      resolve(msg);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function signHello(
  secret: string,
  deviceId: string,
  ts: number,
  nonce: string
): string {
  return createHmac('sha256', secret)
    .update(`${deviceId}|${ts}|${nonce}`)
    .digest('base64');
}

describe('bridge daemon hardening (W0.2)', () => {
  it('F2.1 rejects unknown-device bootstrap over hello and does not auto-provision', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bridge-hardening-f21-'));
    const port = await getFreePort();
    const secretsFile = join(tmp, 'bridge-secrets.json');

    const daemon = await startDaemon({
      BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: '127.0.0.1',
      BRIDGE_SECRETS_FILE: secretsFile,
      BRIDGE_NONCE_CACHE_FILE: join(tmp, 'nonce-cache.json'),
      BRIDGE_QUARANTINE_LEDGER_FILE: join(tmp, 'quarantine-ledger.jsonl'),
    });

    try {
      const reply = await wsHello(daemon.host, daemon.port, {
        op: 'hello',
        device: 'new-device',
        ts: Date.now(),
        nonce: 'n-bootstrap',
        sig: '',
      });

      expect(reply).toMatchObject({
        type: 'hello_ack',
        ok: false,
        reason: 'unknown_device',
      });
      expect(existsSync(secretsFile)).toBe(false);
    } finally {
      await daemon.stop();
    }
  });

  it('F2.2 persists nonce cache and blocks replay after daemon restart', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bridge-hardening-f22-'));
    const port = await getFreePort();
    const secretsFile = join(tmp, 'bridge-secrets.json');
    const nonceCacheFile = join(tmp, 'nonce-cache.json');
    const deviceId = 'device-replay';
    const secret = 'replay-secret-32-bytes-material!!';

    writeFileSync(
      secretsFile,
      JSON.stringify({ devices: { [deviceId]: secret } }, null, 2),
      'utf-8'
    );

    const env = {
      BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: '127.0.0.1',
      BRIDGE_SECRETS_FILE: secretsFile,
      BRIDGE_NONCE_CACHE_FILE: nonceCacheFile,
      BRIDGE_QUARANTINE_LEDGER_FILE: join(tmp, 'quarantine-ledger.jsonl'),
    };

    const ts = Date.now();
    const nonce = 'nonce-replay-1';
    const sig = signHello(secret, deviceId, ts, nonce);

    const first = await startDaemon(env);
    try {
      const ok = await wsHello(first.host, first.port, {
        op: 'hello',
        device: deviceId,
        ts,
        nonce,
        sig,
      });
      expect(ok).toMatchObject({
        type: 'hello_ack',
        ok: true,
        device: deviceId,
      });
    } finally {
      await first.stop();
    }

    const second = await startDaemon(env);
    try {
      const replay = await wsHello(second.host, second.port, {
        op: 'hello',
        device: deviceId,
        ts,
        nonce,
        sig,
      });
      expect(replay).toMatchObject({
        type: 'hello_ack',
        ok: false,
        reason: 'replayed_nonce',
      });
    } finally {
      await second.stop();
    }
  });

  it('F2.3 writes auth failures to quarantine ledger and keeps it write-only', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bridge-hardening-f23-'));
    const port = await getFreePort();
    const secretsFile = join(tmp, 'bridge-secrets.json');
    const nonceCacheFile = join(tmp, 'nonce-cache.json');
    const ledgerFile = join(tmp, 'quarantine-ledger.jsonl');
    const deviceId = 'device-quarantine';
    const secret = 'quarantine-secret-32-bytes-material!';

    writeFileSync(
      secretsFile,
      JSON.stringify({ devices: { [deviceId]: secret } }, null, 2),
      'utf-8'
    );

    const daemon = await startDaemon({
      BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: '127.0.0.1',
      BRIDGE_SECRETS_FILE: secretsFile,
      BRIDGE_NONCE_CACHE_FILE: nonceCacheFile,
      BRIDGE_QUARANTINE_LEDGER_FILE: ledgerFile,
    });

    try {
      const reply = await wsHello(daemon.host, daemon.port, {
        op: 'hello',
        device: deviceId,
        ts: Date.now(),
        nonce: 'nonce-quarantine',
        sig: 'bad-signature',
      });

      expect(reply).toMatchObject({
        type: 'hello_ack',
        ok: false,
        reason: 'invalid_signature',
      });

      const ledger = readFileSync(ledgerFile, 'utf-8');
      expect(ledger).toContain('invalid_signature');
      expect(ledger).toContain(deviceId);

      const res = await fetch(`${daemon.httpBase}/quarantine`);
      expect(res.status).toBe(404);
    } finally {
      await daemon.stop();
    }
  });

  it('F2.4 reports explicit bind interface in health snapshot', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bridge-hardening-f24-'));
    const port = await getFreePort();

    const daemon = await startDaemon({
      BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: '127.0.0.1',
      BRIDGE_SECRETS_FILE: join(tmp, 'bridge-secrets.json'),
      BRIDGE_NONCE_CACHE_FILE: join(tmp, 'nonce-cache.json'),
      BRIDGE_QUARANTINE_LEDGER_FILE: join(tmp, 'quarantine-ledger.jsonl'),
    });

    try {
      const res = await fetch(`${daemon.httpBase}/health`);
      const body = await res.json();
      expect(body.bind).toEqual({ host: '127.0.0.1', port });
    } finally {
      await daemon.stop();
    }
  });

  it('F2.5 rejects malformed signatures without non-constant-time fallback behavior', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bridge-hardening-f25-'));
    const port = await getFreePort();
    const deviceId = 'device-ct';
    const secret = 'constant-time-secret-32-bytes-yes!';

    writeFileSync(
      join(tmp, 'bridge-secrets.json'),
      JSON.stringify({ devices: { [deviceId]: secret } }, null, 2),
      'utf-8'
    );

    const daemon = await startDaemon({
      BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: '127.0.0.1',
      BRIDGE_SECRETS_FILE: join(tmp, 'bridge-secrets.json'),
      BRIDGE_NONCE_CACHE_FILE: join(tmp, 'nonce-cache.json'),
      BRIDGE_QUARANTINE_LEDGER_FILE: join(tmp, 'quarantine-ledger.jsonl'),
    });

    try {
      const reply = await wsHello(daemon.host, daemon.port, {
        op: 'hello',
        device: deviceId,
        ts: Date.now(),
        nonce: 'nonce-ct',
        sig: 'A',
      });

      expect(reply).toMatchObject({
        type: 'hello_ack',
        ok: false,
        reason: 'invalid_signature',
      });
    } finally {
      await daemon.stop();
    }
  });
});
