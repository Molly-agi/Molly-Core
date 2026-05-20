/**
 * @fileOverview Integration Tests for Scheduler API
 *
 * Tests the autonomous scheduler API end-to-end.
 * Verifies job creation, management, and execution history.
 */

import { MockNextResponse, MockNextRequest } from './helpers/next-mocks.helper';

// Mock next/server before importing the route
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
  NextRequest: MockNextRequest,
}));

// Reset scheduler singleton between tests
beforeEach(() => {
  if ((globalThis as Record<string, unknown>).__mollyAutonomousScheduler) {
    const scheduler = (globalThis as Record<string, unknown>)
      .__mollyAutonomousScheduler as {
      getJobs: () => { id: string }[];
      removeJob: (id: string) => void;
    };
    const jobs = scheduler.getJobs();
    for (const job of jobs) {
      scheduler.removeJob(job.id);
    }
  }
});

import { GET, POST, DELETE, PATCH } from '@/app/api/scheduler/route';

describe('Scheduler API Integration', () => {
  describe('GET /api/scheduler', () => {
    it('returns jobs list', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler');
      const response = await GET(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(data.summary).toBeDefined();
    });

    it('returns history when requested', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/scheduler?view=history'
      );
      const response = await GET(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data.history)).toBe(true);
    });
  });

  describe('POST /api/scheduler', () => {
    it('creates a cron job', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Cron Job',
          description: 'Runs every minute',
          schedule: 'cron:* * * * *',
          action: { type: 'log' },
        }),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.created).toBe(true);
      expect(data.job.name).toBe('Test Cron Job');
      expect(data.job.id).toBeDefined();
    });

    it('creates an interval job', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Interval Job',
          schedule: 'interval:60000',
          action: { type: 'log' },
        }),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(data.created).toBe(true);
      expect(data.job.schedule).toBe('interval:60000');
    });

    it('rejects missing required fields', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Incomplete Job',
        }),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('rejects invalid schedule format', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Schedule',
          schedule: 'invalid',
          action: { type: 'log' },
        }),
      });

      const response = await POST(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid schedule format');
    });
  });

  describe('DELETE /api/scheduler', () => {
    it('removes a job', async () => {
      // First create a job
      const createRequest = new MockNextRequest(
        'http://localhost/api/scheduler',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'To Be Deleted',
            schedule: 'interval:60000',
            action: { type: 'log' },
          }),
        }
      );
      const createResponse = await POST(
        createRequest as unknown as import('next/server').NextRequest
      );
      const createData = await createResponse.json();
      const jobId = createData.job.id;

      // Delete the job
      const deleteRequest = new MockNextRequest(
        `http://localhost/api/scheduler?id=${jobId}`,
        { method: 'DELETE' }
      );
      const deleteResponse = await DELETE(
        deleteRequest as unknown as import('next/server').NextRequest
      );
      const deleteData = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(deleteData.removed).toBe(true);
    });

    it('returns false for non-existent job', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/scheduler?id=nonexistent',
        { method: 'DELETE' }
      );
      const response = await DELETE(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(data.removed).toBe(false);
    });

    it('rejects missing id', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'DELETE',
      });
      const response = await DELETE(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required parameter');
    });
  });

  describe('PATCH /api/scheduler', () => {
    it('disables a job', async () => {
      // Create a job
      const createRequest = new MockNextRequest(
        'http://localhost/api/scheduler',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'To Be Disabled',
            schedule: 'interval:60000',
            action: { type: 'log' },
          }),
        }
      );
      const createResponse = await POST(
        createRequest as unknown as import('next/server').NextRequest
      );
      const createData = await createResponse.json();
      const jobId = createData.job.id;

      // Disable the job
      const patchRequest = new MockNextRequest(
        'http://localhost/api/scheduler',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: jobId, enabled: false }),
        }
      );
      const patchResponse = await PATCH(
        patchRequest as unknown as import('next/server').NextRequest
      );
      const patchData = await patchResponse.json();

      expect(patchResponse.status).toBe(200);
      expect(patchData.updated).toBe(true);
    });

    it('rejects missing fields', async () => {
      const request = new MockNextRequest('http://localhost/api/scheduler', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'some-id' }),
      });
      const response = await PATCH(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });
  });
});
