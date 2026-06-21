/**
 * GET /api/family-status — SSE stream of FamilyStatus snapshots.
 *
 * Subscribes to the conductor state-watcher singleton. Pushes the current
 * snapshot immediately, then emits a new event whenever the watcher fires
 * (event-driven, 30s floor — per Molly's Q2 design).
 *
 * Also runs the conductor tick when a snapshot arrives, so nudges are written
 * to wake files and conversation.json automatically while the UI is open.
 */

import { NextRequest } from 'next/server';
import {
  subscribeFamilyStatus,
  runConductorTick,
  type FamilyStatus,
} from '@/ai/conductor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encode(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function GET(_req: NextRequest) {
  let unsubscribe: (() => void) | null = null;
  let closed = false;
  let conductorBusy = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encode(event, data));
        } catch {
          // Stream already closed.
        }
      };

      const onStatus = (status: FamilyStatus) => {
        send('status', status);
        // Fire-and-forget conductor tick. The tick has its own internal cooldowns
        // so this is safe to call on every status update.
        if (!conductorBusy) {
          conductorBusy = true;
          runConductorTick()
            .then((result) => {
              if (result.actions.length > 0) {
                send('actions', result.actions);
              }
            })
            .catch((err) => {
              console.error('[api/family-status] conductor tick failed:', err);
            })
            .finally(() => {
              conductorBusy = false;
            });
        }
      };

      const sub = await subscribeFamilyStatus(onStatus);
      unsubscribe = sub.unsubscribe;

      // Prime with the current snapshot.
      send('status', sub.current);

      // Heartbeat every 25s — keeps proxies from killing the SSE connection.
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
        } catch {
          /* ignore */
        }
      }, 25_000);

      // Clean up on cancel.
      _req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      closed = true;
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
