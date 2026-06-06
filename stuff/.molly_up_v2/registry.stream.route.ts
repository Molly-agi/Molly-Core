/**
 * /api/agency/registry/stream  (Server-Sent Events)
 * ------------------------------------------------------------------
 * Live change feed for the admin window + terminals. Subscribes to the
 * registry's change events for the requested key(s) and pushes each
 * ParameterChange as an SSE message. Read-only — no mutation here.
 *
 *   GET /api/agency/registry/stream            → all keys
 *   GET /api/agency/registry/stream?key=...     → one key
 */

import { getAgencyRuntime } from '@/ai/agency/agency-runtime';
import type { ParameterChange } from '@/ai/agency/registry/parameter-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const rt = getAgencyRuntime();

  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (change: ParameterChange) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(change)}\n\n`));
      };
      // If a specific key is requested, subscribe to it; otherwise subscribe
      // to every currently-known key.
      if (key) {
        unsub = rt.registry.subscribe(key, send);
      } else {
        const unsubs = Object.keys(rt.registry.snapshot()).map((k) =>
          rt.registry.subscribe(k, send),
        );
        unsub = () => unsubs.forEach((u) => u());
      }
      // Initial comment to open the stream.
      controller.enqueue(encoder.encode(`: connected\n\n`));
    },
    cancel() {
      if (unsub) unsub();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
