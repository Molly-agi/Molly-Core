/**
 * @fileOverview Mock NextResponse for integration tests
 *
 * Since Jest doesn't have the full Next.js runtime environment,
 * we need to mock NextResponse and NextRequest.
 */

export class MockNextResponse {
  private body: unknown;
  private init: ResponseInit;

  constructor(body: unknown, init?: ResponseInit) {
    this.body = body;
    this.init = init || {};
  }

  static json(data: unknown, init?: ResponseInit) {
    return new MockNextResponse(data, init);
  }

  get status() {
    return this.init.status || 200;
  }

  get headers() {
    const headers = new Map<string, string>();
    if (this.init.headers) {
      const h = this.init.headers as Record<string, string>;
      Object.entries(h).forEach(([k, v]) => headers.set(k, v));
    }
    return {
      get: (key: string) => headers.get(key),
    };
  }

  async json() {
    return this.body;
  }
}

export class MockNextRequest {
  readonly url: string;
  readonly method: string;
  private bodyContent: string | null;
  private headersMap: Map<string, string>;

  constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.method = init?.method || 'GET';
    this.bodyContent = (init?.body as string) || null;
    this.headersMap = new Map<string, string>();

    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      Object.entries(h).forEach(([k, v]) =>
        this.headersMap.set(k.toLowerCase(), v)
      );
    }
  }

  get headers() {
    return {
      get: (key: string) => this.headersMap.get(key.toLowerCase()) || null,
    };
  }

  async json() {
    if (!this.bodyContent) return {};
    return JSON.parse(this.bodyContent);
  }
}

// Setup mock before tests run
export function setupNextMocks() {
  jest.mock('next/server', () => ({
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  }));
}
