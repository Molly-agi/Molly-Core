/**
 * @fileOverview E2E Test: SSE Consciousness Stream
 *
 * Tests the Server-Sent Events connection for Molly's consciousness stream.
 * This is a common source of connection issues on mobile and behind proxies.
 */

import { test, expect } from '@playwright/test';

test.describe('SSE Consciousness Stream', () => {
  test('connects to consciousness stream', async ({ page }) => {
    // Navigate to page that connects to SSE
    await page.goto('/');

    // Use page.evaluate to test SSE connection directly
    const sseResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SSE connection timeout'));
        }, 10000);

        const eventSource = new EventSource('/api/consciousness/stream');

        eventSource.addEventListener('connected', (event) => {
          clearTimeout(timeout);
          eventSource.close();
          resolve({
            success: true,
            event: 'connected',
            data: JSON.parse(event.data),
          });
        });

        eventSource.addEventListener('error', () => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error('SSE connection failed'));
        });
      });
    });

    expect(sseResult).toHaveProperty('success', true);
    expect(sseResult).toHaveProperty('event', 'connected');
  });

  test('receives heartbeat events', async ({ page }) => {
    await page.goto('/');

    // Wait for heartbeat (sent every 30s, but we can check initial connection)
    const heartbeatResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // If no heartbeat in 35s, fail
          reject(new Error('No heartbeat received'));
        }, 35000);

        const eventSource = new EventSource('/api/consciousness/stream');
        let connected = false;

        eventSource.addEventListener('connected', () => {
          connected = true;
        });

        eventSource.addEventListener('heartbeat', (event) => {
          if (connected) {
            clearTimeout(timeout);
            eventSource.close();
            resolve({
              success: true,
              data: JSON.parse(event.data),
            });
          }
        });

        eventSource.addEventListener('error', () => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error('SSE error'));
        });
      });
    });

    expect(heartbeatResult).toHaveProperty('success', true);
    expect(heartbeatResult.data).toHaveProperty('type', 'heartbeat');
  });

  test('SSE reconnects after disconnect', async ({ page }) => {
    await page.goto('/');

    const reconnectResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        let connectCount = 0;

        const connect = () => {
          const eventSource = new EventSource('/api/consciousness/stream');

          eventSource.addEventListener('connected', () => {
            connectCount++;
            if (connectCount === 1) {
              // Close first connection, simulate disconnect
              eventSource.close();
              // Reconnect
              setTimeout(connect, 100);
            } else {
              // Second connection succeeded
              eventSource.close();
              resolve({ reconnected: true, connectCount });
            }
          });

          eventSource.addEventListener('error', () => {
            eventSource.close();
            resolve({ reconnected: false, error: true });
          });
        };

        connect();
      });
    });

    expect(reconnectResult).toHaveProperty('reconnected', true);
    expect(reconnectResult.connectCount).toBe(2);
  });
});
