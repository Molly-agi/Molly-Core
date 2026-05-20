/**
 * MCP Config Tests
 *
 * Tests for MCP configuration loading, env var expansion, and validation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  expandEnvVars,
  expandConfigEnvVars,
  loadConfigFile,
  loadProjectConfig,
  loadAllConfigs,
  getServerConfig,
  isValidServerName,
  createEmptyConfig,
  serializeConfig,
  MCP_CONFIG_FILENAME,
} from '../config';
import type { McpServerConfig } from '../types';

describe('MCP Config', () => {
  describe('expandEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should expand ${VAR} syntax', () => {
      process.env.MY_VAR = 'my-value';
      const result = expandEnvVars('prefix-${MY_VAR}-suffix');

      expect(result.expanded).toBe('prefix-my-value-suffix');
      expect(result.missingVars).toHaveLength(0);
    });

    it('should expand $VAR syntax', () => {
      process.env.TOKEN = 'secret123';
      const result = expandEnvVars('Bearer $TOKEN');

      expect(result.expanded).toBe('Bearer secret123');
      expect(result.missingVars).toHaveLength(0);
    });

    it('should track missing variables', () => {
      delete process.env.UNDEFINED_VAR;
      const result = expandEnvVars('value-${UNDEFINED_VAR}');

      expect(result.expanded).toBe('value-${UNDEFINED_VAR}');
      expect(result.missingVars).toContain('UNDEFINED_VAR');
    });

    it('should handle multiple variables', () => {
      process.env.VAR1 = 'one';
      process.env.VAR2 = 'two';
      const result = expandEnvVars('${VAR1}-$VAR2');

      expect(result.expanded).toBe('one-two');
      expect(result.missingVars).toHaveLength(0);
    });

    it('should deduplicate missing variables', () => {
      delete process.env.MISSING;
      const result = expandEnvVars('${MISSING}-${MISSING}');

      expect(result.missingVars).toEqual(['MISSING']);
    });

    it('should preserve strings without variables', () => {
      const result = expandEnvVars('no variables here');

      expect(result.expanded).toBe('no variables here');
      expect(result.missingVars).toHaveLength(0);
    });
  });

  describe('expandConfigEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should expand env vars in stdio config', () => {
      process.env.MY_CMD = 'custom-command';
      process.env.MY_ARG = 'custom-arg';

      const config: McpServerConfig = {
        command: '$MY_CMD',
        args: ['--flag', '${MY_ARG}'],
      };

      const result = expandConfigEnvVars(config);

      expect(result.expanded).toEqual({
        command: 'custom-command',
        args: ['--flag', 'custom-arg'],
      });
      expect(result.missingVars).toHaveLength(0);
    });

    it('should expand env vars in SSE config', () => {
      process.env.API_URL = 'https://api.example.com';
      process.env.API_TOKEN = 'secret';

      const config: McpServerConfig = {
        type: 'sse',
        url: '${API_URL}/mcp',
        headers: {
          Authorization: 'Bearer ${API_TOKEN}',
        },
      };

      const result = expandConfigEnvVars(config);

      expect(result.expanded).toEqual({
        type: 'sse',
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Bearer secret',
        },
      });
    });

    it('should collect missing vars from config', () => {
      delete process.env.MISSING_CMD;
      delete process.env.MISSING_ARG;

      const config: McpServerConfig = {
        command: '${MISSING_CMD}',
        args: ['${MISSING_ARG}'],
      };

      const result = expandConfigEnvVars(config);

      expect(result.missingVars).toContain('MISSING_CMD');
      expect(result.missingVars).toContain('MISSING_ARG');
    });
  });

  describe('loadConfigFile', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should return null for non-existent file', async () => {
      const result = await loadConfigFile(
        path.join(tempDir, 'nonexistent.json'),
        'project'
      );

      expect(result.config).toBeNull();
      expect(result.errors).toHaveLength(0);
    });

    it('should load valid config file', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            test: {
              command: 'test-cmd',
              args: ['--flag'],
            },
          },
        })
      );

      const result = await loadConfigFile(configPath, 'project');

      expect(result.config).not.toBeNull();
      expect(result.config?.mcpServers.test.command).toBe('test-cmd');
      expect(result.errors).toHaveLength(0);
    });

    it('should report JSON parse errors', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(configPath, '{ invalid json }');

      const result = await loadConfigFile(configPath, 'project');

      expect(result.config).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('error');
    });

    it('should report schema validation errors', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            test: {
              // Missing required 'command' field
              args: ['--flag'],
            },
          },
        })
      );

      const result = await loadConfigFile(configPath, 'project');

      expect(result.config).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about missing env vars', async () => {
      delete process.env.UNDEFINED_TOKEN;
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            test: {
              command: 'cmd',
              args: [],
              env: {
                TOKEN: '${UNDEFINED_TOKEN}',
              },
            },
          },
        })
      );

      const result = await loadConfigFile(configPath, 'project');

      expect(result.config).not.toBeNull();
      expect(result.errors.some((e) => e.severity === 'warning')).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('UNDEFINED_TOKEN'))
      ).toBe(true);
    });
  });

  describe('loadProjectConfig', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-project-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should return empty result if no config files found', async () => {
      const result = await loadProjectConfig(tempDir);

      expect(Object.keys(result.servers)).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
    });

    it('should load config from directory', async () => {
      const configPath = path.join(tempDir, MCP_CONFIG_FILENAME);
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            myserver: {
              command: 'my-command',
              args: [],
            },
          },
        })
      );

      const result = await loadProjectConfig(tempDir);

      expect(result.servers.myserver).toBeDefined();
      expect(result.servers.myserver.command).toBe('my-command');
      expect(result.servers.myserver.scope).toBe('project');
      expect(result.sources).toContain(configPath);
    });

    it('should merge configs from parent directories', async () => {
      // Create parent dir with config
      const parentConfig = path.join(tempDir, MCP_CONFIG_FILENAME);
      await fs.writeFile(
        parentConfig,
        JSON.stringify({
          mcpServers: {
            parent: { command: 'parent-cmd', args: [] },
            override: { command: 'parent-override', args: [] },
          },
        })
      );

      // Create child dir with config
      const childDir = path.join(tempDir, 'child');
      await fs.mkdir(childDir);
      const childConfig = path.join(childDir, MCP_CONFIG_FILENAME);
      await fs.writeFile(
        childConfig,
        JSON.stringify({
          mcpServers: {
            child: { command: 'child-cmd', args: [] },
            override: { command: 'child-override', args: [] },
          },
        })
      );

      const result = await loadProjectConfig(childDir);

      // Parent server should be present
      expect(result.servers.parent).toBeDefined();
      expect(result.servers.parent.command).toBe('parent-cmd');

      // Child server should be present
      expect(result.servers.child).toBeDefined();
      expect(result.servers.child.command).toBe('child-cmd');

      // Child should override parent
      expect(result.servers.override.command).toBe('child-override');

      // Both sources should be listed
      expect(result.sources).toContain(parentConfig);
      expect(result.sources).toContain(childConfig);
    });
  });

  describe('loadAllConfigs', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-all-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should include dynamic configs', async () => {
      const dynamicServers = {
        dynamic: {
          command: 'dynamic-cmd',
          args: [],
        },
      };

      const result = await loadAllConfigs(dynamicServers, tempDir);

      expect(result.servers.dynamic).toBeDefined();
      expect(result.servers.dynamic.scope).toBe('dynamic');
    });

    it('should give dynamic configs precedence', async () => {
      // Create project config
      const configPath = path.join(tempDir, MCP_CONFIG_FILENAME);
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            myserver: { command: 'project-cmd', args: [] },
          },
        })
      );

      // Dynamic config with same name
      const dynamicServers = {
        myserver: {
          command: 'dynamic-cmd',
          args: [],
        },
      };

      const result = await loadAllConfigs(dynamicServers, tempDir);

      // Dynamic should win
      expect(result.servers.myserver.command).toBe('dynamic-cmd');
      expect(result.servers.myserver.scope).toBe('dynamic');
    });
  });

  describe('getServerConfig', () => {
    it('should return server config by name', async () => {
      const configs = {
        servers: {
          test: {
            command: 'test',
            args: [],
            scope: 'project' as const,
          },
        },
        errors: [],
        sources: [],
      };

      const server = getServerConfig('test', configs);

      expect(server).toBeDefined();
      expect(server?.command).toBe('test');
    });

    it('should return undefined for unknown server', async () => {
      const configs = {
        servers: {},
        errors: [],
        sources: [],
      };

      const server = getServerConfig('unknown', configs);

      expect(server).toBeUndefined();
    });
  });

  describe('isValidServerName', () => {
    it('should accept valid names', () => {
      expect(isValidServerName('my-server')).toBe(true);
      expect(isValidServerName('my_server')).toBe(true);
      expect(isValidServerName('MyServer123')).toBe(true);
      expect(isValidServerName('server')).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(isValidServerName('')).toBe(false);
      expect(isValidServerName('has spaces')).toBe(false);
      expect(isValidServerName('special@char')).toBe(false);
      expect(isValidServerName('path/slash')).toBe(false);
    });
  });

  describe('createEmptyConfig / serializeConfig', () => {
    it('should create valid empty config', () => {
      const config = createEmptyConfig();

      expect(config.mcpServers).toEqual({});
    });

    it('should serialize config to JSON', () => {
      const config = {
        mcpServers: {
          test: { command: 'cmd', args: ['--flag'] },
        },
      };

      const json = serializeConfig(config);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(config);
    });
  });
});
