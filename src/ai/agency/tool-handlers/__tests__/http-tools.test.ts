/**
 * @jest-environment node
 *
 * Tests for HTTP primitives (httpRequest, httpInspect, fuzzEndpoint, cookieJar).
 * Uses a mocked fetch — no real network traffic.
 */

import { httpToolHandlers, _internal } from '../http-tools';

const { httpRequest, httpInspect, fuzzEndpoint, cookieJar } = httpToolHandlers;

// Mock the rogue-mode module so authorizePrivateAccess sees a controllable state.
const rogueState = { active: false };
jest.mock('@/ai/rogue-mode', () => ({
  getRogueMode: () => ({ isActive: () => rogueState.active }),
}));

// Mock global fetch
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function mockResponse(opts: {
  status?: number;
  statusText?: string;
  body?: string;
  headers?: Record<string, string>;
  setCookie?: string[];
  url?: string;
}): unknown {
  const status = opts.status ?? 200;
  const headers = new Headers(opts.headers || {});
  const setCookies = opts.setCookie ?? [];
  for (const c of setCookies) headers.append('set-cookie', c);
  const body = opts.body ?? '';
  const nodeBuf = Buffer.from(body, 'utf-8');
  const buffer = nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength
  );

  return {
    status,
    statusText: opts.statusText ?? 'OK',
    ok: status >= 200 && status < 300,
    url: opts.url ?? '',
    headers: Object.assign(headers, {
      getSetCookie: () => setCookies,
    }),
    arrayBuffer: async () => buffer,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  rogueState.active = false;
  _internal.JARS.clear();
});

describe('httpRequest', () => {
  test('rejects missing url', async () => {
    const res = await httpRequest({});
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/no url/i);
  });

  test('rejects bad protocol', async () => {
    const res = await httpRequest({ url: 'file:///etc/passwd' });
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/unsupported protocol/i);
  });

  test('GETs and parses response', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: '{"ok":true}',
        headers: { 'content-type': 'application/json' },
      })
    );
    const res = await httpRequest({ url: 'https://example.com/api' });
    expect(res.success).toBe(true);
    expect(res.data?.status).toBe(200);
    expect(res.data?.body).toBe('{"ok":true}');
    expect((res.data?.headers as Record<string, string>)['content-type']).toBe(
      'application/json'
    );
  });

  test('JSON body sets Content-Type and stringifies', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 201, body: 'created' })
    );
    await httpRequest({
      url: 'https://api.example.com/things',
      method: 'POST',
      body: { name: 'molly' },
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"molly"}');
    expect((init.headers as Headers).get('content-type')).toBe(
      'application/json'
    );
  });

  test('form body URL-encodes', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));
    await httpRequest({
      url: 'https://api.example.com/login',
      method: 'POST',
      bodyFormat: 'form',
      body: { user: 'eric', pass: 'secret' },
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('user=eric&pass=secret');
    expect((init.headers as Headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded'
    );
  });

  test('custom headers are passed through', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));
    await httpRequest({
      url: 'https://api.example.com',
      headers: { 'X-Custom': 'value', Authorization: 'Bearer abc' },
    });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('x-custom')).toBe('value');
    expect((init.headers as Headers).get('authorization')).toBe('Bearer abc');
  });

  test('blocks private host by default', async () => {
    const res = await httpRequest({ url: 'http://192.168.1.1/' });
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/private\/internal/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('hard-blocks cloud metadata even with allowPrivate + Rogue mode', async () => {
    rogueState.active = true;
    const res = await httpRequest({
      url: 'http://169.254.169.254/latest/meta-data/',
      allowPrivate: true,
    });
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/hard-blocked/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('allows private host when Rogue mode active and allowPrivate set', async () => {
    rogueState.active = true;
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: 'internal-data' })
    );
    const res = await httpRequest({
      url: 'http://10.0.0.5/internal',
      allowPrivate: true,
    });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('respects timeout', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const res = await httpRequest({
      url: 'https://slow.example.com',
      timeoutMs: 50,
    });
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/timed out/i);
  });
});

describe('httpInspect', () => {
  test('returns full body in output not just preview', async () => {
    const longBody = 'x'.repeat(5000);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: longBody })
    );
    const res = await httpInspect({ url: 'https://example.com' });
    expect(res.success).toBe(true);
    expect(res.output?.length).toBeGreaterThan(5000);
  });
});

describe('cookieJar', () => {
  test('stores Set-Cookie and replays on next request', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: '',
        setCookie: ['session=abc; Path=/'],
      })
    );
    await httpRequest({ url: 'https://app.example.com/login', jarId: 'sess1' });

    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));
    await httpRequest({
      url: 'https://app.example.com/profile',
      jarId: 'sess1',
    });

    const [, init] = fetchMock.mock.calls[1];
    expect((init.headers as Headers).get('cookie')).toContain('session=abc');
  });

  test('cookieJar list returns active jars', async () => {
    _internal.jarStore('jarA', [
      {
        name: 'k',
        value: 'v',
        domain: 'example.com',
        path: '/',
        expiresAt: null,
        httpOnly: false,
        secure: false,
      },
    ]);
    const res = await cookieJar({ action: 'list' });
    expect(res.success).toBe(true);
    expect((res.data?.jars as string[]).includes('jarA')).toBe(true);
  });

  test('cookieJar clear removes a jar', async () => {
    _internal.jarStore('toClear', [
      {
        name: 'x',
        value: 'y',
        domain: 'example.com',
        path: '/',
        expiresAt: null,
        httpOnly: false,
        secure: false,
      },
    ]);
    const res = await cookieJar({ action: 'clear', jarId: 'toClear' });
    expect(res.success).toBe(true);
    expect(_internal.JARS.has('toClear')).toBe(false);
  });

  test('expired cookies are not replayed', async () => {
    _internal.jarStore('expJar', [
      {
        name: 'old',
        value: 'gone',
        domain: 'example.com',
        path: '/',
        expiresAt: Date.now() - 10_000,
        httpOnly: false,
        secure: false,
      },
    ]);
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: '' }));
    await httpRequest({ url: 'https://example.com/', jarId: 'expJar' });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('cookie')).toBeNull();
  });
});

describe('fuzzEndpoint', () => {
  test('requires {FUZZ} placeholder', async () => {
    const res = await fuzzEndpoint({
      url: 'https://example.com/no-placeholder',
      wordlist: ['admin'],
    });
    expect(res.success).toBe(false);
    expect(res.output).toMatch(/\{FUZZ\}/);
  });

  test('iterates wordlist and summarizes by status', async () => {
    const words = ['admin', 'backup', 'config', 'public', 'home'];
    // Mock 4x 404, 1x 200 (so 200 is the anomaly at 20%)
    const statuses = [404, 404, 404, 404, 200];
    for (let i = 0; i < words.length; i++) {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: statuses[i],
          body: i === 4 ? 'SECRET' : 'not found',
        })
      );
    }
    const res = await fuzzEndpoint({
      url: 'https://example.com/{FUZZ}',
      wordlist: words,
      delayMs: 0,
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      byStatus: Record<string, number>;
      anomalies: unknown[];
    };
    expect(data.byStatus['404']).toBe(4);
    expect(data.byStatus['200']).toBe(1);
    expect(data.anomalies.length).toBeGreaterThan(0);
  });
});
