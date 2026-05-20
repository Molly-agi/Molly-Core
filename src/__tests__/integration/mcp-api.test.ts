/**
 * @fileOverview Integration Tests for MCP APIs
 *
 * Tests MCP endpoints including:
 * - Status endpoint
 * - Reconnect endpoint
 * - Toggle endpoint
 */

import { MockNextResponse, MockNextRequest } from './helpers/next-mocks.helper';

// Mock next/server before importing the routes
jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
  NextRequest: MockNextRequest,
}));

// Mock global Response to use MockNextResponse
global.Response = {
  json: (data: unknown, init?: ResponseInit) =>
    MockNextResponse.json(data, init),
} as unknown as typeof Response;

// Mock MCP manager functions
const mockGetManagerStatus = jest.fn();
const mockIsManagerInitialized = jest.fn();
const mockListMcpTools = jest.fn();
const mockReconnectServer = jest.fn();
const mockConnectAllServers = jest.fn();
const mockGetManagedServerNames = jest.fn();
const mockEnableServer = jest.fn();
const mockDisableServer = jest.fn();

jest.mock('@/ai/mcp', () => ({
  getManagerStatus: () => mockGetManagerStatus(),
  isManagerInitialized: () => mockIsManagerInitialized(),
  listMcpTools: () => mockListMcpTools(),
  reconnectServer: (...args: unknown[]) => mockReconnectServer(...args),
  connectAllServers: () => mockConnectAllServers(),
  getManagedServerNames: () => mockGetManagedServerNames(),
  enableServer: (...args: unknown[]) => mockEnableServer(...args),
  disableServer: (...args: unknown[]) => mockDisableServer(...args),
}));

// Import routes after mocks are set up
import { GET as getStatus } from '@/app/api/mcp/status/route';
import { POST as reconnect } from '@/app/api/mcp/reconnect/route';
import { POST as toggle } from '@/app/api/mcp/toggle/route';

describe('MCP API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockIsManagerInitialized.mockReturnValue(true);
    mockGetManagerStatus.mockReturnValue({
      initialized: true,
      serverCount: 2,
      connectedCount: 1,
      failedCount: 1,
      servers: [
        { name: 'server1', status: 'connected', reconnectAttempts: 0 },
        {
          name: 'server2',
          status: 'failed',
          reconnectAttempts: 2,
          error: 'Connection refused',
        },
      ],
    });
    mockListMcpTools.mockReturnValue([
      { name: 'mcp_server1_tool1', server: 'server1', description: 'A tool' },
    ]);
    mockGetManagedServerNames.mockReturnValue(['server1', 'server2']);
  });

  describe('GET /api/mcp/status', () => {
    it('returns MCP status', async () => {
      const response = await getStatus();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.timestamp).toBeDefined();
      expect(data.initialized).toBe(true);
      expect(data.servers).toBeDefined();
      expect(data.tools).toBeDefined();
    });

    it('includes server counts', async () => {
      const response = await getStatus();
      const data = await response.json();

      expect(data.servers.total).toBe(2);
      expect(data.servers.connected).toBe(1);
      expect(data.servers.failed).toBe(1);
    });

    it('includes server list', async () => {
      const response = await getStatus();
      const data = await response.json();

      expect(data.servers.list).toHaveLength(2);
      expect(data.servers.list[0].name).toBe('server1');
      expect(data.servers.list[0].status).toBe('connected');
      expect(data.servers.list[1].status).toBe('failed');
      expect(data.servers.list[1].error).toBe('Connection refused');
    });

    it('includes tool list', async () => {
      const response = await getStatus();
      const data = await response.json();

      expect(data.tools.total).toBe(1);
      expect(data.tools.list).toHaveLength(1);
      expect(data.tools.list[0].name).toBe('mcp_server1_tool1');
    });
  });

  describe('POST /api/mcp/reconnect', () => {
    it('returns 503 when manager not initialized', async () => {
      mockIsManagerInitialized.mockReturnValue(false);

      const request = new MockNextRequest(
        'http://localhost/api/mcp/reconnect',
        {
          method: 'POST',
        }
      );
      const response = await reconnect(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(503);
    });

    it('reconnects specific server', async () => {
      mockReconnectServer.mockResolvedValue({
        name: 'server2',
        type: 'connected',
      });

      const request = new MockNextRequest(
        'http://localhost/api/mcp/reconnect',
        {
          method: 'POST',
          body: JSON.stringify({ server: 'server2' }),
        }
      );
      const response = await reconnect(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.server).toBe('server2');
      expect(mockReconnectServer).toHaveBeenCalledWith('server2');
    });

    it('returns 404 for unknown server', async () => {
      const request = new MockNextRequest(
        'http://localhost/api/mcp/reconnect',
        {
          method: 'POST',
          body: JSON.stringify({ server: 'unknown' }),
        }
      );
      const response = await reconnect(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(404);
    });

    it('reconnects all servers when no server specified', async () => {
      mockConnectAllServers.mockResolvedValue(undefined);

      const request = new MockNextRequest(
        'http://localhost/api/mcp/reconnect',
        {
          method: 'POST',
        }
      );
      const response = await reconnect(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockConnectAllServers).toHaveBeenCalled();
    });
  });

  describe('POST /api/mcp/toggle', () => {
    it('returns 503 when manager not initialized', async () => {
      mockIsManagerInitialized.mockReturnValue(false);

      const request = new MockNextRequest('http://localhost/api/mcp/toggle', {
        method: 'POST',
        body: JSON.stringify({ server: 'server1', enabled: false }),
      });
      const response = await toggle(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(503);
    });

    it('returns 400 for missing fields', async () => {
      const request = new MockNextRequest('http://localhost/api/mcp/toggle', {
        method: 'POST',
        body: JSON.stringify({ server: 'server1' }), // missing enabled
      });
      const response = await toggle(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(400);
    });

    it('returns 404 for unknown server', async () => {
      const request = new MockNextRequest('http://localhost/api/mcp/toggle', {
        method: 'POST',
        body: JSON.stringify({ server: 'unknown', enabled: false }),
      });
      const response = await toggle(
        request as unknown as import('next/server').NextRequest
      );

      expect(response.status).toBe(404);
    });

    it('enables server', async () => {
      mockGetManagerStatus.mockReturnValue({
        servers: [{ name: 'server1', status: 'pending' }],
      });

      const request = new MockNextRequest('http://localhost/api/mcp/toggle', {
        method: 'POST',
        body: JSON.stringify({ server: 'server1', enabled: true }),
      });
      const response = await toggle(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.enabled).toBe(true);
      expect(mockEnableServer).toHaveBeenCalledWith('server1');
    });

    it('disables server', async () => {
      mockDisableServer.mockResolvedValue(undefined);
      mockGetManagerStatus.mockReturnValue({
        servers: [{ name: 'server1', status: 'disabled' }],
      });

      const request = new MockNextRequest('http://localhost/api/mcp/toggle', {
        method: 'POST',
        body: JSON.stringify({ server: 'server1', enabled: false }),
      });
      const response = await toggle(
        request as unknown as import('next/server').NextRequest
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.enabled).toBe(false);
      expect(mockDisableServer).toHaveBeenCalledWith('server1');
    });
  });
});
