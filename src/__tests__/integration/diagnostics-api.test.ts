/**
 * @fileOverview Integration Tests for Diagnostics APIs
 *
 * Tests diagnostic endpoints including:
 * - Circuit breaker status and reset
 * - Runtime snapshots
 * - System diagnostics
 */

import { MockNextResponse, MockNextRequest } from './helpers/next-mocks.helper';

// Mock next/server before importing the routes
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
  NextRequest: MockNextRequest,
}));

// Mock genkit-dependent modules to avoid ESM import issues
jest.mock('@/ai/genkit', () => ({}));
jest.mock('@/ai/genkit-core', () => ({}));
jest.mock('@/ai/tools/system', () => ({
  systemTools: [],
}));
jest.mock('@/ai/tools/runtime-snapshot', () => ({
  captureRuntimeSnapshot: jest.fn().mockResolvedValue({
    timestamp: new Date().toISOString(),
    memory: { heapUsed: 100, heapTotal: 200 },
    uptime: 1000,
  }),
}));

// Mock circuit breaker
const mockGetStatus = jest.fn().mockReturnValue({
  global: { state: 'CLOSED', failures: 0 },
});
const mockReset = jest.fn();

jest.mock('@/ai/tools/circuit-breaker', () => ({
  getCircuitBreaker: () => ({
    getStatus: mockGetStatus,
    reset: mockReset,
  }),
}));

// Store original env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  // Set development mode for auth bypass
  process.env.NODE_ENV = 'development';
  delete process.env.MOLLY_INTERNAL_SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

import {
  GET as getCircuitBreaker,
  POST as resetCircuitBreaker,
} from '@/app/api/diagnostics/circuit-breaker/route';

describe('Diagnostics API Integration', () => {
  describe('GET /api/diagnostics/circuit-breaker', () => {
    it('returns circuit breaker status', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker'
      );
      const response = await getCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('includes global breaker state', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker'
      );
      const response = await getCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(data.status.global).toBeDefined();
      expect(data.status.global.state).toBeDefined();
    });
  });

  describe('POST /api/diagnostics/circuit-breaker', () => {
    it('rejects requests when secret is configured but not provided', async () => {
      // Set a secret to require auth
      process.env.MOLLY_INTERNAL_SECRET = 'test-secret';

      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker',
        {
          method: 'POST',
        }
      );
      const response = await resetCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(401);
    });

    it('allows reset in development mode without secret', async () => {
      // Ensure no secret is set (development mode allows all)
      delete process.env.MOLLY_INTERNAL_SECRET;
      process.env.NODE_ENV = 'development';

      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker',
        {
          method: 'POST',
        }
      );
      const response = await resetCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.before).toBeDefined();
      expect(data.after).toBeDefined();
    });

    it('resets breakers with valid secret', async () => {
      process.env.MOLLY_INTERNAL_SECRET = 'test-secret';

      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker',
        {
          method: 'POST',
          headers: {
            'x-molly-internal': 'test-secret',
          },
        }
      );
      const response = await resetCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker State', () => {
    it('starts in closed state', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/diagnostics/circuit-breaker'
      );
      const response = await getCircuitBreaker(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(data.status.global.state).toBe('CLOSED');
    });
  });
});
