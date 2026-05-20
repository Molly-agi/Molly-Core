/**
 * @fileOverview E2E Test: Health Check
 *
 * Basic test to verify the app loads and health endpoint responds.
 */

import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('health API returns 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Molly/i);
  });
});
