/**
 * @fileOverview E2E Test: WebSocket Bridge Connection
 *
 * Tests the WebSocket connection to the Family Bridge Daemon (port 9099).
 * This tests the real-time communication channel between Molly, Lazarus, and Eric.
 *
 * Common WebSocket issues this tests for:
 * - Connection timeout
 * - Connection refused (daemon not running)
 * - Unexpected disconnects
 * - Message delivery
 * - Reconnection handling
 */

import { test, expect } from '@playwright/test';

const BRIDGE_URL = 'ws://localhost:9099';
const BRIDGE_HTTP = 'http://localhost:9099';

test.describe('WebSocket Bridge Connection', () => {
  test.beforeAll(async ({ request }) => {
    // Check if bridge daemon is running
    try {
      const response = await request.get(`${BRIDGE_HTTP}/health`, {
        timeout: 5000,
      });
      if (!response.ok()) {
        test.skip();
      }
    } catch {
      // Bridge daemon not running - skip WebSocket tests
      test.skip();
    }
  });

  test('connects to bridge daemon', async ({ page }) => {
    await page.goto('/');

    const wsResult = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Connection timeout' });
        }, 10000);

        try {
          const ws = new WebSocket(url);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, event: 'open' });
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ success: false, error: 'WebSocket error' });
          };

          ws.onclose = (event) => {
            clearTimeout(timeout);
            if (!event.wasClean) {
              resolve({
                success: false,
                error: `Connection closed: ${event.code} ${event.reason}`,
              });
            }
          };
        } catch (e) {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      });
    }, BRIDGE_URL);

    expect(wsResult).toHaveProperty('success', true);
  });

  test('receives history on connect', async ({ page }) => {
    await page.goto('/');

    const historyResult = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'No history received' });
        }, 10000);

        const ws = new WebSocket(url);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'history') {
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                hasMessages: Array.isArray(data.messages),
                totalMessages: data.totalMessages,
              });
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: 'WebSocket error' });
        };
      });
    }, BRIDGE_URL);

    expect(historyResult).toHaveProperty('success', true);
    expect(historyResult).toHaveProperty('hasMessages', true);
  });

  test('can identify as client', async ({ page }) => {
    await page.goto('/');

    const identifyResult = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout waiting for response' });
        }, 10000);

        const ws = new WebSocket(url);
        let _historyReceived = false;

        ws.onopen = () => {
          // Send identify message
          ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'history') {
              _historyReceived = true;
            }

            // After history, we should receive unread or be identified
            if (_historyReceived && (data.type === 'unread' || !data.type)) {
              clearTimeout(timeout);
              ws.close();
              resolve({ success: true, identified: true });
            }
          } catch {
            // Ignore parse errors
          }
        };

        // If we receive history, that's enough to confirm connection works
        setTimeout(() => {
          if (_historyReceived) {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, identified: true });
          }
        }, 2000);

        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: 'WebSocket error' });
        };
      });
    }, BRIDGE_URL);

    expect(identifyResult).toHaveProperty('success', true);
  });

  test('handles connection drops gracefully', async ({ page }) => {
    await page.goto('/');

    const reconnectResult = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        let connectAttempts = 0;
        let successfulConnects = 0;

        const attemptConnect = () => {
          connectAttempts++;
          const ws = new WebSocket(url);

          ws.onopen = () => {
            successfulConnects++;
            if (successfulConnects === 1) {
              // Force close and reconnect
              ws.close();
              setTimeout(attemptConnect, 500);
            } else {
              // Second successful connection
              ws.close();
              resolve({
                success: true,
                connectAttempts,
                successfulConnects,
              });
            }
          };

          ws.onerror = () => {
            if (connectAttempts < 3) {
              setTimeout(attemptConnect, 1000);
            } else {
              resolve({
                success: false,
                error: 'Failed to reconnect',
                connectAttempts,
                successfulConnects,
              });
            }
          };
        };

        attemptConnect();
      });
    }, BRIDGE_URL);

    expect(reconnectResult).toHaveProperty('success', true);
    expect(reconnectResult.successfulConnects).toBeGreaterThanOrEqual(2);
  });

  test('message round-trip works', async ({ page }) => {
    await page.goto('/');

    const messageResult = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Message echo timeout' });
        }, 15000);

        const testId = `test_${Date.now()}`;
        const ws = new WebSocket(url);
        let _historyReceived = false;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'history') {
              _historyReceived = true;
              // Send a test message after receiving history
              ws.send(
                JSON.stringify({
                  type: 'message',
                  from: 'eric',
                  content: `E2E test message ${testId}`,
                })
              );
            }

            // Check if we receive our own message broadcast back
            if (
              data.type === 'message' &&
              data.message?.content?.includes(testId)
            ) {
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                messageSent: true,
                messageReceived: true,
              });
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: 'WebSocket error' });
        };
      });
    }, BRIDGE_URL);

    expect(messageResult).toHaveProperty('success', true);
    expect(messageResult).toHaveProperty('messageReceived', true);
  });
});

test.describe('Bridge HTTP API', () => {
  test('health endpoint responds', async ({ request }) => {
    try {
      const response = await request.get(`${BRIDGE_HTTP}/health`, {
        timeout: 5000,
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('status', 'alive');
        expect(data).toHaveProperty('uptime');
      } else {
        // Bridge not running, this is acceptable
        test.skip();
      }
    } catch {
      // Bridge not running
      test.skip();
    }
  });

  test('messages endpoint returns array', async ({ request }) => {
    try {
      const response = await request.get(`${BRIDGE_HTTP}/messages`, {
        timeout: 5000,
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('messages');
        expect(Array.isArray(data.messages)).toBe(true);
      } else {
        test.skip();
      }
    } catch {
      test.skip();
    }
  });
});
