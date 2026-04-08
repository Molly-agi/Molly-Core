/**
 * MCP Manager Tests
 *
 * Tests for MCP connection lifecycle management.
 */

import {
  initializeMcpManager,
  shutdownMcpManager,
  connectAllServers,
  disconnectManagedServer,
  reconnectServer,
  enableServer,
  disableServer,
  addServer,
  removeServer,
  getManagerStatus,
  isManagerInitialized,
  getManagedServerNames,
  DEFAULT_MANAGER_OPTIONS,
} from '../manager';
import * as client from '../client';
import * as config from '../config';
import * as toolAdapter from '../tool-adapter';
import type { ScopedMcpServerConfig } from '../types';

// Mock dependencies
jest.mock('../client');
jest.mock('../config');
jest.mock('../tool-adapter');

const mockedClient = jest.mocked(client);
const mockedConfig = jest.mocked(config);
const mockedToolAdapter = jest.mocked(toolAdapter);

describe('MCP Manager', () => {
  const testConfig: ScopedMcpServerConfig = {
    type: 'stdio',
    command: 'node',
    args: ['test-server.js'],
    scope: 'project',
  };

  beforeEach(async () => {
    // Reset manager state
    await shutdownMcpManager();
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mock implementations
    mockedConfig.loadAllConfigs.mockResolvedValue({
      servers: {},
      errors: [],
      sources: [],
    });

    mockedClient.connectToServer.mockResolvedValue({
      name: 'test',
      type: 'connected',
      capabilities: {},
      config: testConfig,
      cleanup: jest.fn(),
    });

    mockedClient.disconnectServer.mockResolvedValue(undefined);
    mockedClient.disconnectAll.mockResolvedValue(undefined);
    mockedClient.isServerConnected.mockReturnValue(false);
    mockedClient.getConnectedServers.mockReturnValue([]);
    mockedClient.pingServer.mockResolvedValue(true);

    mockedToolAdapter.registerServerTools.mockResolvedValue(1);
    mockedToolAdapter.unregisterServerTools.mockReturnValue(1);
    mockedToolAdapter.clearMcpToolRegistry.mockReturnValue(undefined);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await shutdownMcpManager();
  });

  describe('initializeMcpManager', () => {
    it('should initialize successfully with no servers', async () => {
      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });

      expect(isManagerInitialized()).toBe(true);
      expect(getManagerStatus().serverCount).toBe(0);
    });

    it('should load servers from config', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: {
          server1: testConfig,
          server2: { ...testConfig, scope: 'dynamic' as const },
        },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });

      expect(getManagedServerNames()).toContain('server1');
      expect(getManagedServerNames()).toContain('server2');
      expect(getManagerStatus().serverCount).toBe(2);
    });

    it('should auto-connect when enabled', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });

      expect(mockedClient.connectToServer).toHaveBeenCalledWith(
        'test',
        testConfig,
        expect.any(Object)
      );
    });

    it('should not auto-connect when disabled', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });

      expect(mockedClient.connectToServer).not.toHaveBeenCalled();
    });

    it('should register tools after successful connection', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });

      expect(mockedToolAdapter.registerServerTools).toHaveBeenCalledWith(
        'test'
      );
    });

    it('should not initialize twice', async () => {
      await initializeMcpManager({ healthCheckIntervalMs: 0 });
      await initializeMcpManager({ healthCheckIntervalMs: 0 });

      // Config should only be loaded once
      expect(mockedConfig.loadAllConfigs).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutdownMcpManager', () => {
    it('should disconnect all servers', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });
      await shutdownMcpManager();

      expect(mockedClient.disconnectAll).toHaveBeenCalled();
      expect(isManagerInitialized()).toBe(false);
    });

    it('should clear tool registry', async () => {
      await initializeMcpManager({ healthCheckIntervalMs: 0 });
      await shutdownMcpManager();

      expect(mockedToolAdapter.clearMcpToolRegistry).toHaveBeenCalled();
    });

    it('should handle shutdown when not initialized', async () => {
      await expect(shutdownMcpManager()).resolves.not.toThrow();
    });
  });

  describe('connectAllServers', () => {
    it('should connect to all enabled servers', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: {
          server1: testConfig,
          server2: testConfig,
        },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });
      await connectAllServers();

      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(2);
    });
  });

  describe('disconnectManagedServer', () => {
    it('should disconnect and unregister tools', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });
      await disconnectManagedServer('test');

      expect(mockedToolAdapter.unregisterServerTools).toHaveBeenCalledWith(
        'test'
      );
      expect(mockedClient.disconnectServer).toHaveBeenCalledWith('test');
    });
  });

  describe('reconnectServer', () => {
    it('should reconnect a server', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });
      await reconnectServer('test');

      expect(mockedClient.connectToServer).toHaveBeenCalled();
    });

    it('should reset reconnect attempts', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });
      // First call fails, second (manual reconnect) succeeds
      mockedClient.connectToServer
        .mockResolvedValueOnce({
          name: 'test',
          type: 'failed',
          config: testConfig,
          error: 'Connection refused',
        })
        .mockResolvedValueOnce({
          name: 'test',
          type: 'connected',
          capabilities: {},
          config: testConfig,
          cleanup: jest.fn(),
        });

      await initializeMcpManager({
        autoConnect: true,
        autoReconnect: false, // Disable to avoid interference
        healthCheckIntervalMs: 0,
      });

      // Manual reconnect should reset attempts and succeed
      await reconnectServer('test');

      const status = getManagerStatus();
      const serverStatus = status.servers.find((s) => s.name === 'test');
      expect(serverStatus?.reconnectAttempts).toBe(0);
      expect(serverStatus?.status).toBe('connected');
    });
  });

  describe('enableServer / disableServer', () => {
    it('should disable and disconnect server', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });
      await disableServer('test');

      const status = getManagerStatus();
      const serverStatus = status.servers.find((s) => s.name === 'test');
      expect(serverStatus?.status).toBe('disabled');
    });

    it('should enable server', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });
      await disableServer('test');
      enableServer('test');

      const status = getManagerStatus();
      const serverStatus = status.servers.find((s) => s.name === 'test');
      expect(serverStatus?.status).toBe('pending');
    });
  });

  describe('addServer / removeServer', () => {
    it('should add a new server', async () => {
      await initializeMcpManager({ healthCheckIntervalMs: 0 });

      addServer('new-server', testConfig);

      expect(getManagedServerNames()).toContain('new-server');
    });

    it('should not add duplicate server', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });

      addServer('test', testConfig);

      // Should still be 1 server
      expect(getManagerStatus().serverCount).toBe(1);
    });

    it('should remove server', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: false,
        healthCheckIntervalMs: 0,
      });
      await removeServer('test');

      expect(getManagedServerNames()).not.toContain('test');
    });
  });

  describe('getManagerStatus', () => {
    it('should return correct status for connected servers', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });

      await initializeMcpManager({
        autoConnect: true,
        healthCheckIntervalMs: 0,
      });

      const status = getManagerStatus();

      expect(status.initialized).toBe(true);
      expect(status.serverCount).toBe(1);
      expect(status.connectedCount).toBe(1);
      expect(status.failedCount).toBe(0);
      expect(status.servers[0].status).toBe('connected');
    });

    it('should return correct status for failed servers', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });
      mockedClient.connectToServer.mockResolvedValue({
        name: 'test',
        type: 'failed',
        config: testConfig,
        error: 'Connection refused',
      });

      await initializeMcpManager({
        autoConnect: true,
        autoReconnect: false,
        healthCheckIntervalMs: 0,
      });

      const status = getManagerStatus();

      expect(status.connectedCount).toBe(0);
      expect(status.failedCount).toBe(1);
      expect(status.servers[0].status).toBe('failed');
      expect(status.servers[0].error).toBe('Connection refused');
    });
  });

  describe('auto-reconnect', () => {
    it('should schedule reconnect on failure', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });
      mockedClient.connectToServer.mockResolvedValue({
        name: 'test',
        type: 'failed',
        config: testConfig,
        error: 'Connection refused',
      });

      await initializeMcpManager({
        autoConnect: true,
        autoReconnect: true,
        reconnectDelayMs: 1000,
        healthCheckIntervalMs: 0,
      });

      // First connect call
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(1);

      // Advance timer to trigger reconnect
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Let async work complete

      // Second connect call (reconnect)
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      mockedConfig.loadAllConfigs.mockResolvedValue({
        servers: { test: testConfig },
        errors: [],
        sources: [],
      });
      mockedClient.connectToServer.mockResolvedValue({
        name: 'test',
        type: 'failed',
        config: testConfig,
        error: 'Connection refused',
      });

      await initializeMcpManager({
        autoConnect: true,
        autoReconnect: true,
        reconnectDelayMs: 1000,
        maxReconnectAttempts: 3,
        healthCheckIntervalMs: 0,
      });

      // First reconnect at 1000ms
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(2);

      // Second reconnect at 2000ms (doubled)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(3);

      // Third reconnect at 4000ms (doubled again)
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(4);

      // No more reconnects (max attempts reached)
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(mockedClient.connectToServer).toHaveBeenCalledTimes(4);
    });
  });

  describe('DEFAULT_MANAGER_OPTIONS', () => {
    it('should have reasonable defaults', () => {
      expect(DEFAULT_MANAGER_OPTIONS.autoConnect).toBe(true);
      expect(DEFAULT_MANAGER_OPTIONS.autoReconnect).toBe(true);
      expect(DEFAULT_MANAGER_OPTIONS.maxReconnectAttempts).toBeGreaterThan(0);
      expect(DEFAULT_MANAGER_OPTIONS.reconnectDelayMs).toBeGreaterThan(0);
      expect(DEFAULT_MANAGER_OPTIONS.healthCheckIntervalMs).toBeGreaterThan(0);
    });
  });
});
