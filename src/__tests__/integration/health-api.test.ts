/**
 * @fileOverview Integration Tests for Health API
 *
 * Tests the health check endpoint end-to-end.
 * This is the simplest API route - good baseline for integration testing.
 */

import { MockNextResponse } from './helpers/next-mocks.helper';

// Mock next/server before importing the route
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET } from '@/app/api/health/route';

describe('Health API Integration', () => {
  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('includes timestamp', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });

    it('includes uptime', async () => {
      const response = await GET();
      const data = await response.json();

      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('sets no-cache header', async () => {
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('responds quickly (< 50ms)', async () => {
      const start = Date.now();
      await GET();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
