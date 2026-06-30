/**
 * Tests for the llama-server slot snapshot client (Gap 2 — write-back).
 *
 * Uses a fake fetch impl so these run without a live llama-server.
 */

import {
  SlotSnapshotClient,
  SlotSnapshotError,
} from '@/ai/llama/slot-snapshot';

type FetchCall = {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

function makeFakeFetch(
  responder: (call: FetchCall) => {
    status?: number;
    body?: unknown;
    text?: string;
  }
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: FetchCall = {
      url,
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
      headers,
    };
    calls.push(call);
    const res = responder(call);
    const status = res.status ?? 200;
    const bodyText = res.text ?? JSON.stringify(res.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('SlotSnapshotClient', () => {
  describe('saveSlot', () => {
    it('POSTs to /slots/{id}?action=save with the filename in the body', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({
        body: { filename: 'kv_0_x.bin', n_saved: 1024 },
      }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      const result = await client.saveSlot(0, 'kv_0_x.bin');

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://localhost:8080/slots/0?action=save');
      expect(calls[0].method).toBe('POST');
      expect(calls[0].body).toBe(JSON.stringify({ filename: 'kv_0_x.bin' }));
      expect(result.n_saved).toBe(1024);
    });

    it('rejects path-traversal filenames', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({ body: {} }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      await expect(client.saveSlot(0, '../etc/passwd')).rejects.toThrow(
        SlotSnapshotError
      );
      await expect(client.saveSlot(0, 'sub/dir.bin')).rejects.toThrow(
        SlotSnapshotError
      );
      await expect(client.saveSlot(0, '')).rejects.toThrow(SlotSnapshotError);
      expect(calls).toHaveLength(0);
    });

    it('wraps non-2xx responses as SlotSnapshotError with status + body', async () => {
      const { fetchImpl } = makeFakeFetch(() => ({
        status: 501,
        text: 'slot-save-path not configured',
      }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      const promise = client.saveSlot(0, 'kv_0_a.bin');
      await expect(promise).rejects.toThrow(SlotSnapshotError);
      await promise.catch((err) => {
        expect((err as SlotSnapshotError).status).toBe(501);
        expect((err as SlotSnapshotError).body).toContain('slot-save-path');
      });
    });
  });

  describe('restoreSlot', () => {
    it('POSTs to /slots/{id}?action=restore', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({
        body: { filename: 'kv_0_x.bin', n_restored: 1024 },
      }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      await client.restoreSlot(2, 'snap.bin');

      expect(calls[0].url).toBe('http://localhost:8080/slots/2?action=restore');
      expect(calls[0].body).toBe(JSON.stringify({ filename: 'snap.bin' }));
    });
  });

  describe('eraseSlot', () => {
    it('POSTs to /slots/{id}?action=erase with no body', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({ body: {} }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      await client.eraseSlot(0);

      expect(calls[0].url).toBe('http://localhost:8080/slots/0?action=erase');
      expect(calls[0].body).toBeUndefined();
    });
  });

  describe('listSlots', () => {
    it('GETs /slots and returns parsed slot info', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({
        body: [
          { id: 0, state: 0 },
          { id: 1, state: 1, prompt: 'hello' },
        ],
      }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080',
        fetchImpl,
      });

      const slots = await client.listSlots();

      expect(calls[0].url).toBe('http://localhost:8080/slots');
      expect(calls[0].method).toBe('GET');
      expect(slots).toHaveLength(2);
      expect(slots[1].prompt).toBe('hello');
    });
  });

  describe('buildSnapshotFilename', () => {
    it('produces a basename containing the slot id and an ISO-ish timestamp', () => {
      const name = SlotSnapshotClient.buildSnapshotFilename(
        3,
        new Date('2026-06-30T09:14:59.680Z')
      );
      expect(name).toBe('kv_3_2026-06-30T09-14-59-680Z.bin');
      expect(name.includes('/')).toBe(false);
    });
  });

  describe('baseUrl normalization', () => {
    it('strips trailing slashes', async () => {
      const { fetchImpl, calls } = makeFakeFetch(() => ({ body: [] }));
      const client = new SlotSnapshotClient({
        baseUrl: 'http://localhost:8080///',
        fetchImpl,
      });
      await client.listSlots();
      expect(calls[0].url).toBe('http://localhost:8080/slots');
    });
  });
});
