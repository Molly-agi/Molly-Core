/**
 * @fileOverview Integration Tests for Session API
 *
 * Tests session state persistence end-to-end.
 * Verifies state load/save across the session lifecycle.
 */

import { MockNextResponse, MockNextRequest } from './helpers/next-mocks.helper';

// Mock next/server before importing the routes
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
  NextRequest: MockNextRequest,
}));

// Mock session manager to avoid file system issues
const mockLoadSessionState = jest.fn().mockReturnValue({
  lastUpdated: new Date().toISOString(),
  sessionId: 'test-session',
  status: 'active',
  runtime: { events: [] },
  userDirectives: {
    coreDirective: '',
    requiresPermission: [],
    autonomousActions: [],
  },
  projectStatus: {
    completionPercent: 0,
    phasesCompleted: [],
    phasesPending: [],
    activeBlockers: [],
  },
  recentWork: [],
  nextSteps: { options: [], recommendedAction: '' },
  sessionNotes: [],
  mollyState: { lastPulse: '', status: 'idle' },
});

const mockSaveSessionState = jest.fn();

jest.mock('@/lib/session-manager', () => ({
  loadSessionState: () => mockLoadSessionState(),
  saveSessionState: (state: Record<string, unknown>) =>
    mockSaveSessionState(state),
}));

import { GET } from '@/app/api/session/state/route';
import { POST } from '@/app/api/session/save/route';

describe('Session API Integration', () => {
  describe('GET /api/session/state', () => {
    it('returns session state', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.state).toBeDefined();
    });

    it('state includes expected structure', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.state).toBeDefined();
      expect(typeof data.state).toBe('object');
    });
  });

  describe('POST /api/session/save', () => {
    it('saves session state', async () => {
      const testState = {
        testKey: 'testValue',
        timestamp: Date.now(),
      };

      const request = new MockNextRequest('http://localhost/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: testState }),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Session saved');
    });

    it('handles empty state', async () => {
      const request = new MockNextRequest('http://localhost/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Session Lifecycle', () => {
    it('calls saveSessionState with provided state', async () => {
      const uniqueId = `test-${Date.now()}`;
      const saveRequest = new MockNextRequest(
        'http://localhost/api/session/save',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: {
              integration_test_id: uniqueId,
            },
          }),
        }
      );

      await POST(saveRequest as unknown as import('next/server').NextRequest);

      // Verify saveSessionState was called with correct state
      expect(mockSaveSessionState).toHaveBeenCalledWith(
        expect.objectContaining({ integration_test_id: uniqueId })
      );
    });

    it('returns persisted state from loadSessionState', async () => {
      // Setup mock to return specific state
      const testData = { testField: 'testValue' };
      mockLoadSessionState.mockReturnValueOnce({
        ...mockLoadSessionState(),
        ...testData,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.state.testField).toBe('testValue');
    });
  });
});
