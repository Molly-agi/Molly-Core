/**
 * @fileOverview Consciousness Stream — SSE Endpoint
 *
 * This is Molly's outbound voice. Server-Sent Events allow her
 * to push messages to the browser unprompted — thoughts,
 * observations, self-state changes.
 *
 * The stream checks the consciousness singleton's message queue
 * every 2 seconds and delivers any pending messages.
 *
 * SSE is chosen over WebSocket because:
 * - Auto-reconnects when Android Chrome kills the tab
 * - Simpler server-side implementation (no upgrade handshake)
 * - One-directional (which is what we need — server→client push)
 * - Client→server communication uses existing fetch APIs
 *
 * The `Last-Event-ID` header is respected for catch-up on reconnect,
 * but since messages are drained on delivery, reconnection is mainly
 * about re-establishing the channel.
 */

import { getConsciousness } from '@/ai/consciousness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/consciousness/stream
 *
 * Opens an SSE connection. Sends:
 * - `connected` event on open
 * - `heartbeat` every 30s (keeps connection alive)
 * - `message` when Molly has something to say
 * - `state` periodically with current consciousness state
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;
  let heartbeatId: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const consciousness = getConsciousness();

      // Send initial connection event with current state
      const connectPayload = {
        type: 'connected',
        state: consciousness.getState(),
        timestamp: new Date().toISOString(),
      };
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify(connectPayload)}\n\n`
        )
      );

      // Check for pending messages every 2 seconds
      intervalId = setInterval(() => {
        try {
          const messages = consciousness.drainMessages();
          for (const msg of messages) {
            const payload = JSON.stringify(msg);
            controller.enqueue(
              encoder.encode(
                `id: ${msg.id}\nevent: message\ndata: ${payload}\n\n`
              )
            );
          }
        } catch {
          // Stream may have closed — interval will be cleaned up by abort handler
        }
      }, 2_000);

      // Heartbeat every 30 seconds to keep connection alive
      // (prevents proxies/CDNs from closing idle connections)
      heartbeatId = setInterval(() => {
        try {
          const state = consciousness.getState();
          const heartbeat = {
            type: 'heartbeat',
            awareness: state.awarenessLevel,
            regulation: state.regulation.mode,
            pending: consciousness.getPendingMessageCount(),
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify(heartbeat)}\n\n`
            )
          );
        } catch {
          // Stream closed
        }
      }, 30_000);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        if (intervalId) clearInterval(intervalId);
        if (heartbeatId) clearInterval(heartbeatId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      if (intervalId) clearInterval(intervalId);
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
