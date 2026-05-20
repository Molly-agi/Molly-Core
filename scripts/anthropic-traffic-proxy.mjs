#!/usr/bin/env node
/**
 * anthropic-traffic-proxy.mjs — research tool (NOT production infrastructure)
 *
 * Sits between Claude Code (or any Anthropic SDK client) and api.anthropic.com.
 * Logs every request and response so you can see exactly what the client sends
 * and what the server returns — including GrowthBook flag evaluations, any
 * undocumented endpoints, and the raw shape of every API call.
 *
 * ────────────── HOW TO USE ──────────────
 *
 * 1. Start the proxy:
 *      node scripts/anthropic-traffic-proxy.mjs
 *    (default port 8118 — set PORT env var to change)
 *
 * 2. In another terminal, start Claude Code pointed at the proxy:
 *      ANTHROPIC_BASE_URL=http://localhost:8118 claude
 *
 * 3. Use Claude Code normally. Watch the proxy terminal for a summary line
 *    per request; full bodies are written as JSONL to:
 *      .anthropic-traffic/YYYY-MM-DD.jsonl
 *
 * ─────────────── HOW IT WORKS ───────────────
 *
 *   [Claude Code] ──HTTP──> [this proxy on :8118] ──HTTPS──> [api.anthropic.com]
 *                                  │
 *                                  ├─ logs request body
 *                                  └─ logs response body
 *
 * The proxy is read-only — it forwards bytes unmodified in both directions.
 * It does NOT modify responses (that would defeat the point and cross into
 * ToS territory). It only OBSERVES.
 *
 * ─────────────── SECURITY NOTES ───────────────
 *
 * - Your ANTHROPIC_API_KEY passes through this proxy. The proxy redacts it
 *   from logs (replaces the value with [REDACTED]) but a malicious local
 *   process with read access to your terminal could see it. Don't run this
 *   on a shared machine.
 * - Logs contain your conversation content (prompts and model responses).
 *   Treat .anthropic-traffic/ like you'd treat your shell history.
 * - This proxy is HTTP-only on the listening side; outbound to Anthropic is
 *   still HTTPS. That's fine for localhost.
 */

import http from 'node:http';
import https from 'node:https';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const PORT = parseInt(process.env.PORT || '8118', 10);
const UPSTREAM = new URL(
  process.env.PROXY_UPSTREAM || 'https://api.anthropic.com'
);
const LOG_DIR = process.env.PROXY_LOG_DIR || '.anthropic-traffic';
const REDACT_HEADERS = new Set([
  'x-api-key',
  'authorization',
  'cookie',
  'set-cookie',
]);

mkdirSync(LOG_DIR, { recursive: true });

function redact(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACT_HEADERS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

function tryParseJson(s) {
  if (!s) return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function logFile() {
  return join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.jsonl`);
}

const server = http.createServer((clientReq, clientRes) => {
  const id = randomUUID();
  const start = Date.now();

  // Buffer the request body so we can both forward and log it.
  const reqChunks = [];
  clientReq.on('data', (c) => reqChunks.push(c));
  clientReq.on('end', () => {
    const reqBody = Buffer.concat(reqChunks);

    // Build outgoing headers. We strip accept-encoding so the upstream
    // returns plain bytes (not gzip) — this means the proxy logs are
    // human-readable without an extra decompression step.
    const outHeaders = { ...clientReq.headers };
    delete outHeaders['accept-encoding'];
    outHeaders.host = UPSTREAM.host;

    const upstreamReq = https.request(
      {
        protocol: UPSTREAM.protocol,
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port || 443,
        path: clientReq.url,
        method: clientReq.method,
        headers: outHeaders,
      },
      (upstreamRes) => {
        // Forward the response status + headers to the client immediately.
        clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);

        // Tee the response: each chunk goes to the client AND to a buffer
        // for logging. This is what makes streaming responses (SSE) work —
        // the client sees bytes as they arrive, but we still capture
        // the full stream for the log entry.
        const resChunks = [];
        upstreamRes.on('data', (c) => {
          resChunks.push(c);
          clientRes.write(c);
        });
        upstreamRes.on('end', () => {
          clientRes.end();
          const resBody = Buffer.concat(resChunks).toString('utf-8');
          const entry = {
            id,
            ts: new Date().toISOString(),
            durationMs: Date.now() - start,
            request: {
              method: clientReq.method,
              path: clientReq.url,
              headers: redact(clientReq.headers),
              body: tryParseJson(reqBody.toString('utf-8')),
            },
            response: {
              status: upstreamRes.statusCode,
              headers: redact(upstreamRes.headers),
              body: tryParseJson(resBody),
            },
          };
          try {
            appendFileSync(logFile(), JSON.stringify(entry) + '\n');
          } catch (e) {
            console.error('[proxy] log write failed:', e.message);
          }
          const tag = upstreamRes.statusCode >= 400 ? '✗' : '✓';
          console.log(
            `${tag} ${clientReq.method.padEnd(6)} ${clientReq.url.slice(0, 60).padEnd(60)} → ${upstreamRes.statusCode}  ${Date.now() - start}ms`
          );
        });
      }
    );

    upstreamReq.on('error', (e) => {
      console.error('[proxy] upstream error:', e.message);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'content-type': 'text/plain' });
      }
      clientRes.end(`Bad gateway: ${e.message}`);
    });

    if (reqBody.length > 0) upstreamReq.write(reqBody);
    upstreamReq.end();
  });

  clientReq.on('error', (e) => {
    console.error('[proxy] client error:', e.message);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('═════════════════════════════════════════════════════════');
  console.log(
    `  anthropic-traffic-proxy listening on http://localhost:${PORT}`
  );
  console.log(`  forwarding to ${UPSTREAM.origin}`);
  console.log(
    `  logs: ${LOG_DIR}/${new Date().toISOString().split('T')[0]}.jsonl`
  );
  console.log('  ');
  console.log('  Start a new Claude Code session pointed at this proxy:');
  console.log(`    ANTHROPIC_BASE_URL=http://localhost:${PORT} claude`);
  console.log('  Stop with Ctrl-C.');
  console.log('═════════════════════════════════════════════════════════');
});

// Clean shutdown — flush stdout before exiting so the last log line lands.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[proxy] ${sig} — stopping.`);
    server.close(() => process.exit(0));
  });
}
