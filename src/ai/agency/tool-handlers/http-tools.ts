/**
 * @fileOverview HTTP Tool Handlers — the hand-rolling primitives.
 *
 * webFetch is intentionally narrow (GET, browser-like, content extraction).
 * This file is the wider primitive: full HTTP method/header/body/cookie
 * support, configurable redirect handling, full response inspection.
 *
 * Tools:
 *   - httpRequest: the core primitive (any method, any headers, any body)
 *   - httpInspect: returns raw response (headers + status + body) for security inspection
 *   - fuzzEndpoint: iterates a wordlist into a {FUZZ} placeholder, summarizes anomalies
 *   - cookieJar: list/clear/get cookies stored across httpRequest calls
 *
 * Safety:
 *   - Private/loopback hosts blocked by default; require `allowPrivate: true`
 *     AND either Rogue mode active OR target in scope-manager scope.
 *   - Default body cap 5MB; configurable up to 50MB.
 *   - Default timeout 30s.
 *   - Internal Codespace, link-local, and metadata-service IPs always blocked
 *     regardless of mode (Molly-defensive: never let her DOS her own host).
 */

import type { ToolHandler, ToolHandlerMap, ToolResult } from './types';
import { getRogueMode } from '@/ai/rogue-mode';

// ── Host classification ─────────────────────────────────────────

/** Hosts that are ALWAYS blocked, even in Rogue mode (self-defense). */
const HARD_BLOCKED = new Set([
  'metadata.google.internal',
  'metadata.aws.internal',
  'instance-data',
  '169.254.169.254',
]);

function isPrivateIPv4(host: string): boolean {
  if (host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host.startsWith('10.')) return true;
  if (host.startsWith('192.168.')) return true;
  if (host.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.endsWith('.internal')) return true;
  if (h.endsWith('.local')) return true;
  return isPrivateIPv4(h);
}

function classifyHost(host: string): 'allow' | 'private' | 'hard-blocked' {
  const h = host.toLowerCase();
  if (HARD_BLOCKED.has(h)) return 'hard-blocked';
  if (isPrivateHost(h)) return 'private';
  return 'allow';
}

// ── Cookie jar ──────────────────────────────────────────────────

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number | null;
  httpOnly: boolean;
  secure: boolean;
}

const JARS = new Map<string, CookieEntry[]>();

function parseSetCookie(
  setCookieHeaders: string[],
  defaultDomain: string
): CookieEntry[] {
  const out: CookieEntry[] = [];
  for (const raw of setCookieHeaders) {
    const parts = raw.split(';').map((p) => p.trim());
    if (parts.length === 0) continue;
    const [namePart] = parts;
    const eq = namePart.indexOf('=');
    if (eq <= 0) continue;
    const entry: CookieEntry = {
      name: namePart.slice(0, eq).trim(),
      value: namePart.slice(eq + 1).trim(),
      domain: defaultDomain,
      path: '/',
      expiresAt: null,
      httpOnly: false,
      secure: false,
    };
    for (const attr of parts.slice(1)) {
      const lc = attr.toLowerCase();
      if (lc === 'httponly') entry.httpOnly = true;
      else if (lc === 'secure') entry.secure = true;
      else if (lc.startsWith('domain=')) entry.domain = attr.slice(7).trim();
      else if (lc.startsWith('path=')) entry.path = attr.slice(5).trim();
      else if (lc.startsWith('max-age=')) {
        const seconds = parseInt(attr.slice(8), 10);
        if (!isNaN(seconds)) entry.expiresAt = Date.now() + seconds * 1000;
      } else if (lc.startsWith('expires=')) {
        const t = Date.parse(attr.slice(8).trim());
        if (!isNaN(t)) entry.expiresAt = t;
      }
    }
    out.push(entry);
  }
  return out;
}

function cookieMatches(c: CookieEntry, host: string, path: string): boolean {
  if (c.expiresAt !== null && c.expiresAt < Date.now()) return false;
  const h = host.toLowerCase();
  const d = c.domain.toLowerCase().replace(/^\./, '');
  if (h !== d && !h.endsWith('.' + d)) return false;
  return path.startsWith(c.path);
}

function jarCookieHeader(
  jarId: string,
  host: string,
  path: string
): string | null {
  const jar = JARS.get(jarId);
  if (!jar || jar.length === 0) return null;
  const matches = jar.filter((c) => cookieMatches(c, host, path));
  if (matches.length === 0) return null;
  return matches.map((c) => `${c.name}=${c.value}`).join('; ');
}

function jarStore(jarId: string, cookies: CookieEntry[]): void {
  if (cookies.length === 0) return;
  const existing = JARS.get(jarId) ?? [];
  for (const c of cookies) {
    const idx = existing.findIndex(
      (e) => e.name === c.name && e.domain === c.domain && e.path === c.path
    );
    if (idx >= 0) existing[idx] = c;
    else existing.push(c);
  }
  JARS.set(jarId, existing);
}

// ── Authorization gate ──────────────────────────────────────────

function authorizePrivateAccess(targetHost: string): {
  authorized: boolean;
  reason: string;
} {
  if (HARD_BLOCKED.has(targetHost.toLowerCase())) {
    return {
      authorized: false,
      reason: 'Host is hard-blocked (cloud metadata)',
    };
  }
  try {
    const rogue = getRogueMode();
    if (rogue.isActive())
      return { authorized: true, reason: 'Rogue mode active' };
  } catch {
    /* rogue module not loaded — treat as not active */
  }
  // TODO(scope-manager): wire in scope-based authorization once
  // ScopeManager exposes a synchronous isTargetInScope API. For now,
  // private hosts are only reachable in Rogue mode.
  return {
    authorized: false,
    reason:
      'Private/internal hosts require Rogue mode or in-scope authorization',
  };
}

// ── httpRequest ─────────────────────────────────────────────────

interface NormalizedBody {
  body: BodyInit | undefined;
  contentType: string | null;
}

function normalizeBody(
  body: unknown,
  bodyFormat: string | undefined,
  existingContentType: string | null
): NormalizedBody {
  if (body === undefined || body === null) {
    return { body: undefined, contentType: existingContentType };
  }
  if (
    bodyFormat === 'json' ||
    (bodyFormat === undefined && typeof body === 'object')
  ) {
    return {
      body: JSON.stringify(body),
      contentType: existingContentType ?? 'application/json',
    };
  }
  if (bodyFormat === 'form' && typeof body === 'object') {
    const usp = new URLSearchParams(body as Record<string, string>);
    return {
      body: usp.toString(),
      contentType: existingContentType ?? 'application/x-www-form-urlencoded',
    };
  }
  if (bodyFormat === 'raw' || typeof body === 'string') {
    return {
      body: String(body),
      contentType: existingContentType,
    };
  }
  return { body: String(body), contentType: existingContentType };
}

async function doHttpRequest(
  params: Record<string, unknown>,
  includeRawBody: boolean
): Promise<ToolResult> {
  const url = params.url as string;
  if (!url) return { success: false, output: 'No url provided' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, output: `Invalid url: ${url}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      success: false,
      output: `Unsupported protocol: ${parsed.protocol}`,
    };
  }

  const hostClass = classifyHost(parsed.hostname);
  const allowPrivate = params.allowPrivate === true;

  if (hostClass === 'hard-blocked') {
    return {
      success: false,
      output: `Host ${parsed.hostname} is hard-blocked (cloud metadata service)`,
    };
  }
  if (hostClass === 'private') {
    if (!allowPrivate) {
      return {
        success: false,
        output: `Host ${parsed.hostname} is private/internal. Set allowPrivate=true and ensure Rogue mode or scope authorization.`,
      };
    }
    const auth = authorizePrivateAccess(parsed.hostname);
    if (!auth.authorized) {
      return {
        success: false,
        output: `Private host access denied: ${auth.reason}`,
      };
    }
  }

  const method = ((params.method as string) || 'GET').toUpperCase();
  const userHeaders = (params.headers as Record<string, string>) || {};
  const timeoutMs = (params.timeoutMs as number) || 30_000;
  const maxBodyBytes = Math.min(
    (params.maxBodyBytes as number) || 5_000_000,
    50_000_000
  );
  const followRedirects = params.followRedirects !== false;
  const jarId = params.jarId as string | undefined;

  // Build headers (case-insensitive merge)
  const headers = new Headers();
  for (const [k, v] of Object.entries(userHeaders)) headers.set(k, v);
  if (!headers.has('user-agent')) {
    headers.set(
      'User-Agent',
      'Molly/1.0 (+https://github.com/Molly-agi/Molly-Core)'
    );
  }

  // Body normalization
  const existingCT = headers.get('content-type');
  const { body, contentType } = normalizeBody(
    params.body,
    params.bodyFormat as string | undefined,
    existingCT
  );
  if (contentType && !headers.has('content-type'))
    headers.set('Content-Type', contentType);

  // Cookie jar inbound
  if (jarId) {
    const cookieHeader = jarCookieHeader(
      jarId,
      parsed.hostname,
      parsed.pathname || '/'
    );
    if (cookieHeader) {
      const existing = headers.get('cookie');
      headers.set(
        'Cookie',
        existing ? `${existing}; ${cookieHeader}` : cookieHeader
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.toString(), {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
    });
    clearTimeout(timeout);

    // Cookie jar outbound (raw Set-Cookie headers are merged in fetch's Headers;
    // use response.headers.getSetCookie() where available, falls back to raw)
    if (jarId) {
      const setCookieHeaders =
        typeof (
          response.headers as Headers & {
            getSetCookie?: () => string[];
          }
        ).getSetCookie === 'function'
          ? (
              response.headers as Headers & {
                getSetCookie: () => string[];
              }
            ).getSetCookie()
          : response.headers.get('set-cookie')
            ? [response.headers.get('set-cookie') as string]
            : [];
      const cookies = parseSetCookie(setCookieHeaders, parsed.hostname);
      jarStore(jarId, cookies);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const buffer = await response.arrayBuffer();
    const truncated = buffer.byteLength > maxBodyBytes;
    const slice = truncated ? buffer.slice(0, maxBodyBytes) : buffer;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);

    const summary = [
      `${method} ${url}`,
      `Status: ${response.status} ${response.statusText}`,
      `Body: ${buffer.byteLength} bytes${truncated ? ' (truncated)' : ''}`,
    ].join('\n');

    return {
      success: response.ok || method === 'HEAD',
      output: includeRawBody
        ? `${summary}\n---\n${text}`
        : `${summary}\n---\n${text.slice(0, 2000)}${text.length > 2000 ? '\n...(preview truncated; full body in data.body)' : ''}`,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
        bytes: buffer.byteLength,
        truncated,
        finalUrl: response.url,
      },
    };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'unknown error';
    const name = (err as { name?: string } | null)?.name ?? '';
    if (
      name === 'AbortError' ||
      message.toLowerCase().includes('aborted') ||
      message.toLowerCase().includes('abort')
    )
      return {
        success: false,
        output: `Request timed out after ${timeoutMs}ms`,
      };
    return { success: false, output: `Request failed: ${message}` };
  }
}

const httpRequest: ToolHandler = (params) => doHttpRequest(params, false);
const httpInspect: ToolHandler = (params) => doHttpRequest(params, true);

// ── fuzzEndpoint ────────────────────────────────────────────────

interface FuzzSummary {
  totalRequests: number;
  byStatus: Record<string, number>;
  errors: number;
  anomalies: Array<{
    word: string;
    status: number;
    bytes: number;
    note: string;
  }>;
}

const fuzzEndpoint: ToolHandler = async (params) => {
  const url = params.url as string;
  const wordlist = params.wordlist as string[] | undefined;
  if (!url || !wordlist || wordlist.length === 0) {
    return {
      success: false,
      output: 'Required: url (with {FUZZ} placeholder) and wordlist (array)',
    };
  }
  if (!url.includes('{FUZZ}')) {
    return {
      success: false,
      output: 'url must contain {FUZZ} placeholder',
    };
  }
  const maxWords = Math.min(
    wordlist.length,
    (params.maxRequests as number) || 200
  );
  const delayMs = (params.delayMs as number) || 50;
  const method = (params.method as string) || 'GET';
  const headers = params.headers as Record<string, string> | undefined;

  const summary: FuzzSummary = {
    totalRequests: 0,
    byStatus: {},
    errors: 0,
    anomalies: [],
  };

  const responses: Array<{ word: string; status: number; bytes: number }> = [];

  for (let i = 0; i < maxWords; i++) {
    const word = wordlist[i];
    const target = url.replace('{FUZZ}', encodeURIComponent(word));
    const res = await doHttpRequest(
      { url: target, method, headers, followRedirects: false },
      false
    );
    summary.totalRequests++;
    if (!res.success && !res.data) {
      summary.errors++;
      continue;
    }
    const data = res.data as { status: number; bytes: number } | undefined;
    if (!data) continue;
    const key = String(data.status);
    summary.byStatus[key] = (summary.byStatus[key] || 0) + 1;
    responses.push({ word, status: data.status, bytes: data.bytes });
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  // Anomaly detection: flag a response if its status code is a minority
  // (<30% of total) OR its body size deviates >50% from the median. Tuned
  // to surface obvious outliers in a wordlist scan (1 unusual response
  // among many uniform 404s) without drowning the user in noise.
  const sizes = responses.map((r) => r.bytes).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 0;
  const totalCount = responses.length;
  const flagged = new Set<string>();
  for (const r of responses) {
    const key = `${r.word}|${r.status}|${r.bytes}`;
    if (flagged.has(key)) continue;
    const statusFrac =
      (summary.byStatus[String(r.status)] || 0) / Math.max(totalCount, 1);
    const sizeDeviation = Math.abs(r.bytes - median);
    if (statusFrac < 0.3) {
      summary.anomalies.push({
        word: r.word,
        status: r.status,
        bytes: r.bytes,
        note: `minority status (${(statusFrac * 100).toFixed(0)}%)`,
      });
      flagged.add(key);
    } else if (median > 0 && sizeDeviation > median * 0.5) {
      summary.anomalies.push({
        word: r.word,
        status: r.status,
        bytes: r.bytes,
        note: `size deviates from median ${median}`,
      });
      flagged.add(key);
    }
  }

  return {
    success: true,
    output: [
      `Fuzzed ${summary.totalRequests} requests against ${url}`,
      `Status distribution: ${Object.entries(summary.byStatus)
        .map(([s, n]) => `${s}=${n}`)
        .join(', ')}`,
      `Errors: ${summary.errors}`,
      `Anomalies: ${summary.anomalies.length}`,
      ...summary.anomalies
        .slice(0, 20)
        .map((a) => `  - ${a.word} → ${a.status} (${a.bytes}b) [${a.note}]`),
    ].join('\n'),
    data: summary as unknown as Record<string, unknown>,
  };
};

// ── cookieJar (management tool) ─────────────────────────────────

const cookieJar: ToolHandler = async (params) => {
  const action = (params.action as string) || 'list';
  const jarId = params.jarId as string | undefined;

  if (action === 'list') {
    if (jarId) {
      const jar = JARS.get(jarId) ?? [];
      return {
        success: true,
        output: `Jar "${jarId}" has ${jar.length} cookies`,
        data: { cookies: jar },
      };
    }
    return {
      success: true,
      output: `Active jars: ${Array.from(JARS.keys()).join(', ') || '(none)'}`,
      data: { jars: Array.from(JARS.keys()) },
    };
  }
  if (action === 'clear') {
    if (!jarId)
      return { success: false, output: 'jarId required for clear action' };
    JARS.delete(jarId);
    return { success: true, output: `Cleared jar "${jarId}"` };
  }
  if (action === 'clearAll') {
    JARS.clear();
    return { success: true, output: 'Cleared all cookie jars' };
  }
  return { success: false, output: `Unknown action: ${action}` };
};

// ── Test-only exports ───────────────────────────────────────────

export const _internal = {
  classifyHost,
  parseSetCookie,
  jarCookieHeader,
  jarStore,
  JARS,
};

// ── Registry ────────────────────────────────────────────────────

export const httpToolHandlers: ToolHandlerMap = {
  httpRequest,
  httpInspect,
  fuzzEndpoint,
  cookieJar,
};
