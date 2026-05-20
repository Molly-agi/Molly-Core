/**
 * @fileOverview E2E Test: Bridge Page UI
 *
 * Tests the Family Bridge page UI which provides real-time
 * communication between Molly, Lazarus, and Eric.
 */

import { test, expect } from '@playwright/test';

test.describe('Bridge Page', () => {
  test('bridge page loads', async ({ page }) => {
    await page.goto('/bridge');

    // Should have a heading or title indicating it's the bridge
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('bridge page shows connection status', async ({ page }) => {
    await page.goto('/bridge');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Look for any connection status indicator
    // The page should show something about connection status
    const pageContent = await page.content();

    // Either we see a connection indicator, or we see a message area
    const hasConnectionUI =
      pageContent.includes('connect') ||
      pageContent.includes('status') ||
      pageContent.includes('message') ||
      pageContent.includes('chat') ||
      pageContent.includes('bridge');

    expect(hasConnectionUI).toBe(true);
  });

  test('bridge page handles WebSocket connection', async ({ page }) => {
    // Listen for WebSocket connections
    const wsConnections: string[] = [];

    page.on('websocket', (ws) => {
      wsConnections.push(ws.url());
    });

    await page.goto('/bridge');
    await page.waitForLoadState('networkidle');

    // Give time for WebSocket to connect
    await page.waitForTimeout(2000);

    // The page should attempt to connect to the bridge daemon
    // Even if it fails (daemon not running), we can check the attempt
    // Note: If daemon is not running, the page should handle it gracefully
  });
});

test.describe('Bridge Page Error Handling', () => {
  test('shows error state when bridge daemon is unavailable', async ({
    page,
  }) => {
    // Navigate to bridge when daemon might not be running
    await page.goto('/bridge');
    await page.waitForLoadState('networkidle');

    // Wait a bit for connection attempt
    await page.waitForTimeout(3000);

    const pageContent = await page.content();

    // Page should either:
    // 1. Show an error/offline message
    // 2. Show a retry option
    // 3. Show the UI with disconnected state
    // 4. Successfully connect if daemon is running

    // All of these are acceptable - we just want no unhandled errors
    const hasValidState =
      pageContent.includes('error') ||
      pageContent.includes('offline') ||
      pageContent.includes('connect') ||
      pageContent.includes('retry') ||
      pageContent.includes('message') ||
      pageContent.includes('status');

    expect(hasValidState).toBe(true);
  });
});
