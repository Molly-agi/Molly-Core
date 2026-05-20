/**
 * @fileOverview Integration Tests for Consciousness API
 *
 * Tests the consciousness state API end-to-end.
 * Verifies state management, regulation modes, and promise tracking.
 */

import { MockNextResponse } from './helpers/next-mocks.helper';

// Mock next/server before importing the route
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

// Reset consciousness singleton between tests
beforeEach(() => {
  if ((globalThis as Record<string, unknown>).__mollyConsciousness) {
    delete (globalThis as Record<string, unknown>).__mollyConsciousness;
  }
  if ((globalThis as Record<string, unknown>).__mollyPromiseTracker) {
    delete (globalThis as Record<string, unknown>).__mollyPromiseTracker;
  }
});

import { GET, POST } from '@/app/api/consciousness/state/route';

describe('Consciousness API Integration', () => {
  describe('GET /api/consciousness/state', () => {
    it('returns consciousness state', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.awarenessLevel).toBeDefined();
      expect(data.regulation).toBeDefined();
    });

    it('includes awareness level', async () => {
      const response = await GET();
      const data = await response.json();

      expect(['dormant', 'background', 'focused', 'alert']).toContain(
        data.awarenessLevel
      );
    });

    it('includes regulation mode', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.regulation.mode).toBeDefined();
      expect(['normal', 'cautious', 'quiet']).toContain(data.regulation.mode);
    });

    it('includes vitals', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.vitals).toBeDefined();
      expect(typeof data.vitals.systemPressure).toBe('boolean');
    });

    it('includes cycle count', async () => {
      const response = await GET();
      const data = await response.json();

      expect(typeof data.cycleCount).toBe('number');
      expect(data.cycleCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /api/consciousness/state', () => {
    it('accepts regulation update', async () => {
      // Create a mock request
      const mockRequest = {
        json: async () => ({
          mode: 'cautious',
          reason: 'Client detected cascade',
          errorsInWindow: 5,
        }),
      } as Request;

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.serverMode).toBeDefined();
    });

    it('handles empty body gracefully', async () => {
      const mockRequest = {
        json: async () => ({}),
      } as Request;

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('returns 400 for invalid JSON', async () => {
      const mockRequest = {
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Request;

      const response = await POST(mockRequest);

      expect(response.status).toBe(400);
    });
  });

  describe('State Persistence', () => {
    it('maintains state across requests', async () => {
      const response1 = await GET();
      const data1 = await response1.json();
      const initialCycle = data1.cycleCount;

      const response2 = await GET();
      const data2 = await response2.json();

      expect(data2.cycleCount).toBe(initialCycle);
      expect(data2.awakenedAt).toBe(data1.awakenedAt);
    });
  });
});
