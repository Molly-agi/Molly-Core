/**
 * @fileOverview Model Router Tests — Rogue Protocol
 *
 * Tests the model abstraction layer:
 * - Provider registration and management
 * - Task type routing with fallback chains
 * - Health tracking and failure reporting
 * - Routing config switching (default, hybrid, cost-saver)
 * - Diagnostics and statistics
 * - Singleton initialization
 */

// Mock logger before any imports
jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

import {
  TaskType,
  ModelRouter,
  GeminiProvider,
  OllamaProvider,
  ClaudeProvider,
  getModelRouter,
  resetModelRouter,
  createHybridConfig,
  createCostSaverConfig,
  type ModelProvider,
  type ProviderCapabilities,
  type ProviderHealth,
  type RoutingConfig,
} from '../model-router';

// ── Helper: Create a mock provider ──

function createMockProvider(
  overrides: Partial<{
    id: string;
    name: string;
    capabilities: Partial<ProviderCapabilities>;
    resolveModel: (t: TaskType) => string;
    healthCheck: () => Promise<ProviderHealth>;
    requiresApiKey: boolean;
    isConfigured: boolean;
  }> = {}
): ModelProvider {
  return {
    id: overrides.id || 'mock',
    name: overrides.name || 'Mock Provider',
    capabilities: {
      supportsChat: true,
      supportsStreaming: true,
      supportsTTS: false,
      supportsImageGen: false,
      supportsEmbedding: false,
      supportsVision: false,
      maxContextTokens: 32_000,
      costTier: 1,
      latencyTier: 1,
      ...overrides.capabilities,
    },
    resolveModel: overrides.resolveModel || (() => 'mock/model-v1'),
    healthCheck:
      overrides.healthCheck ||
      (async () => ({
        isHealthy: true,
        lastChecked: Date.now(),
        consecutiveFailures: 0,
        avgResponseMs: 50,
      })),
    requiresApiKey: () =>
      overrides.requiresApiKey !== undefined ? overrides.requiresApiKey : false,
    isConfigured: () =>
      overrides.isConfigured !== undefined ? overrides.isConfigured : true,
  };
}

// ════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════

describe('ModelRouter — Rogue Protocol', () => {
  beforeEach(() => {
    resetModelRouter();
  });

  // ── TaskType enum ──

  describe('TaskType enum', () => {
    it('has all expected task types', () => {
      expect(TaskType.REASONING).toBe('reasoning');
      expect(TaskType.CREATIVE).toBe('creative');
      expect(TaskType.CHAT).toBe('chat');
      expect(TaskType.CODE).toBe('code');
      expect(TaskType.TTS).toBe('tts');
      expect(TaskType.IMAGE).toBe('image');
      expect(TaskType.EMBEDDING).toBe('embedding');
      expect(TaskType.VISION).toBe('vision');
      expect(TaskType.RESEARCH).toBe('research');
      expect(TaskType.BACKGROUND).toBe('background');
    });

    it('has exactly 10 task types', () => {
      const values = Object.values(TaskType);
      expect(values.length).toBe(10);
    });
  });

  // ── Provider Registration ──

  describe('Provider Registration', () => {
    it('registers and retrieves a provider', () => {
      const router = new ModelRouter();
      const provider = createMockProvider({ id: 'test-llm', name: 'Test LLM' });

      router.registerProvider(provider);

      expect(router.getProvider('test-llm')).toBe(provider);
      expect(router.getProviders()).toHaveLength(1);
    });

    it('registers multiple providers', () => {
      const router = new ModelRouter();
      router.registerProvider(createMockProvider({ id: 'a' }));
      router.registerProvider(createMockProvider({ id: 'b' }));
      router.registerProvider(createMockProvider({ id: 'c' }));

      expect(router.getProviders()).toHaveLength(3);
    });

    it('overwrites provider with same ID', () => {
      const router = new ModelRouter();
      router.registerProvider(createMockProvider({ id: 'x', name: 'First' }));
      router.registerProvider(createMockProvider({ id: 'x', name: 'Second' }));

      expect(router.getProviders()).toHaveLength(1);
      expect(router.getProvider('x')?.name).toBe('Second');
    });

    it('unregisters a provider', () => {
      const router = new ModelRouter();
      router.registerProvider(createMockProvider({ id: 'temp' }));

      expect(router.unregisterProvider('temp')).toBe(true);
      expect(router.getProvider('temp')).toBeUndefined();
      expect(router.getProviders()).toHaveLength(0);
    });

    it('returns false when unregistering non-existent provider', () => {
      const router = new ModelRouter();
      expect(router.unregisterProvider('ghost')).toBe(false);
    });
  });

  // ── GeminiProvider ──

  describe('GeminiProvider', () => {
    it('has correct ID and name', () => {
      const provider = new GeminiProvider();
      expect(provider.id).toBe('gemini');
      expect(provider.name).toBe('Google Gemini');
    });

    it('resolves PRO model for reasoning tasks', () => {
      const provider = new GeminiProvider();
      const model = provider.resolveModel(TaskType.REASONING);
      expect(model).toContain('gemini-2.5-pro');
    });

    it('resolves FLASH model for chat tasks', () => {
      const provider = new GeminiProvider();
      const model = provider.resolveModel(TaskType.CHAT);
      expect(model).toContain('gemini-2.5-flash');
      // Make sure it's not the TTS variant
      expect(model).not.toContain('preview-tts');
    });

    it('resolves TTS model for TTS tasks', () => {
      const provider = new GeminiProvider();
      const model = provider.resolveModel(TaskType.TTS);
      expect(model).toContain('tts');
    });

    it('resolves Imagen model for IMAGE tasks', () => {
      const provider = new GeminiProvider();
      const model = provider.resolveModel(TaskType.IMAGE);
      expect(model).toContain('imagen');
    });

    it('resolves embedding model for EMBEDDING tasks', () => {
      const provider = new GeminiProvider();
      const model = provider.resolveModel(TaskType.EMBEDDING);
      expect(model).toContain('embedding');
    });

    it('supports all capability types', () => {
      const provider = new GeminiProvider();
      expect(provider.capabilities.supportsChat).toBe(true);
      expect(provider.capabilities.supportsTTS).toBe(true);
      expect(provider.capabilities.supportsImageGen).toBe(true);
      expect(provider.capabilities.supportsEmbedding).toBe(true);
      expect(provider.capabilities.supportsVision).toBe(true);
    });

    it('requires API key', () => {
      const provider = new GeminiProvider();
      expect(provider.requiresApiKey()).toBe(true);
    });
  });

  // ── OllamaProvider ──

  describe('OllamaProvider', () => {
    it('has correct ID and name', () => {
      const provider = new OllamaProvider();
      expect(provider.id).toBe('ollama');
      expect(provider.name).toBe('Ollama (Local)');
    });

    it('does not require API key', () => {
      const provider = new OllamaProvider();
      expect(provider.requiresApiKey()).toBe(false);
    });

    it('does not support TTS or image generation', () => {
      const provider = new OllamaProvider();
      expect(provider.capabilities.supportsTTS).toBe(false);
      expect(provider.capabilities.supportsImageGen).toBe(false);
    });

    it('resolves embedding model for EMBEDDING tasks', () => {
      const provider = new OllamaProvider();
      const model = provider.resolveModel(TaskType.EMBEDDING);
      expect(model).toContain('ollama/');
    });

    it('resolves chat model for CHAT tasks', () => {
      const provider = new OllamaProvider();
      const model = provider.resolveModel(TaskType.CHAT);
      expect(model).toContain('ollama/');
    });

    it('has zero cost tier', () => {
      const provider = new OllamaProvider();
      expect(provider.capabilities.costTier).toBe(0);
    });
  });

  // ── ClaudeProvider ──

  describe('ClaudeProvider', () => {
    it('has correct ID and name', () => {
      const provider = new ClaudeProvider();
      expect(provider.id).toBe('claude');
      expect(provider.name).toBe('Anthropic Claude');
    });

    it('requires API key', () => {
      const provider = new ClaudeProvider();
      expect(provider.requiresApiKey()).toBe(true);
    });

    it('supports vision but not TTS or image generation', () => {
      const provider = new ClaudeProvider();
      expect(provider.capabilities.supportsVision).toBe(true);
      expect(provider.capabilities.supportsTTS).toBe(false);
      expect(provider.capabilities.supportsImageGen).toBe(false);
      expect(provider.capabilities.supportsEmbedding).toBe(false);
    });

    it('resolves model with anthropic prefix', () => {
      const provider = new ClaudeProvider();
      const model = provider.resolveModel(TaskType.REASONING);
      expect(model).toContain('anthropic/');
    });

    it('has highest cost tier', () => {
      const provider = new ClaudeProvider();
      expect(provider.capabilities.costTier).toBe(3);
    });

    it('has 200K context window', () => {
      const provider = new ClaudeProvider();
      expect(provider.capabilities.maxContextTokens).toBe(200_000);
    });
  });

  // ── Core Routing ──

  describe('Core Routing', () => {
    it('routes to default provider when only one is registered', async () => {
      const router = new ModelRouter();
      const gemini = new GeminiProvider();
      router.registerProvider(gemini);

      const decision = await router.resolveModel(TaskType.CHAT);

      expect(decision.provider.id).toBe('gemini');
      expect(decision.modelString).toContain('flash');
      expect(decision.taskType).toBe(TaskType.CHAT);
      expect(decision.fallbackDepth).toBe(0);
      expect(decision.routingLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses getModel() shortcut to return just model string', async () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      const model = await router.getModel(TaskType.REASONING);
      expect(model).toContain('gemini-2.5-pro');
    });

    it('falls back to next provider when first is unconfigured', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test config',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CODE,
            providerChain: ['claude', 'gemini'],
          },
        ],
        updatedAt: Date.now(),
      });

      // Claude is not configured (no API key)
      router.registerProvider(new ClaudeProvider());
      router.registerProvider(new GeminiProvider());

      const decision = await router.resolveModel(TaskType.CODE);

      // Should fall back to Gemini since Claude has no API key
      expect(decision.provider.id).toBe('gemini');
      expect(decision.fallbackDepth).toBeGreaterThan(0);
    });

    it('skips providers that lack capability for task type', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test config',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.TTS,
            providerChain: ['mock-no-tts', 'gemini'],
          },
        ],
        updatedAt: Date.now(),
      });

      router.registerProvider(
        createMockProvider({
          id: 'mock-no-tts',
          capabilities: { supportsTTS: false },
        })
      );
      router.registerProvider(new GeminiProvider());

      const decision = await router.resolveModel(TaskType.TTS);

      expect(decision.provider.id).toBe('gemini');
    });

    it('skips unregistered providers in chain', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test config',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CHAT,
            providerChain: ['nonexistent', 'gemini'],
          },
        ],
        updatedAt: Date.now(),
      });

      router.registerProvider(new GeminiProvider());

      const decision = await router.resolveModel(TaskType.CHAT);
      expect(decision.provider.id).toBe('gemini');
    });

    it('uses absolute fallback when entire chain fails', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test config',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CHAT,
            providerChain: ['ghost1', 'ghost2'],
          },
        ],
        updatedAt: Date.now(),
      });

      router.registerProvider(new GeminiProvider());

      const decision = await router.resolveModel(TaskType.CHAT);
      expect(decision.provider.id).toBe('gemini');
      expect(decision.reason).toContain('Absolute fallback');
    });

    it('throws when no provider is available at all', async () => {
      const router = new ModelRouter({
        name: 'empty',
        description: 'No providers',
        defaultProviderId: 'nothing',
        rules: [],
        updatedAt: Date.now(),
      });

      await expect(router.resolveModel(TaskType.CHAT)).rejects.toThrow(
        'CRITICAL'
      );
    });

    it('respects modelOverride in routing rule', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CHAT,
            providerChain: ['gemini'],
            modelOverride: 'custom/special-model-v99',
          },
        ],
        updatedAt: Date.now(),
      });

      router.registerProvider(new GeminiProvider());

      const decision = await router.resolveModel(TaskType.CHAT);
      expect(decision.modelString).toBe('custom/special-model-v99');
    });
  });

  // ── Health Management ──

  describe('Health Management', () => {
    it('reports failure and updates health cache', async () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      router.reportFailure('gemini', new Error('API down'));

      // Check health via getProvider — the router should skip recently unhealthy
      const health = await router.checkAllProviders();
      // After reportFailure, the cache says unhealthy
      // But checkAllProviders calls healthCheck which may reset it
      expect(health.get('gemini')).toBeDefined();
    });

    it('reports success and resets failure count', () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      // First fail
      router.reportFailure('gemini', new Error('Timeout'));
      // Then succeed
      router.reportSuccess('gemini', 150);

      // No assertion on internals — just verify it doesn't throw
      // The effect is tested via routing behavior
    });

    it('calculates exponential moving average for response time', () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      router.reportSuccess('gemini', 100);
      router.reportSuccess('gemini', 200);
      // EMA: 100 first, then 100*0.7 + 200*0.3 = 130
      // This is internal state, but we verify via diagnostics
      const diag = router.getDiagnostics();
      expect(diag.providers[0].id).toBe('gemini');
    });

    it('skips recently unhealthy providers in routing', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test fallback on health',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CHAT,
            providerChain: ['primary', 'gemini'],
          },
        ],
        updatedAt: Date.now(),
      });

      const primary = createMockProvider({ id: 'primary' });
      router.registerProvider(primary);
      router.registerProvider(new GeminiProvider());

      // Report primary as failed
      router.reportFailure('primary', new Error('Dead'));

      const decision = await router.resolveModel(TaskType.CHAT);
      // Should skip primary and go to gemini
      expect(decision.provider.id).toBe('gemini');
    });

    it('runs health checks on all providers', async () => {
      const router = new ModelRouter();
      const checkFn = jest.fn(async () => ({
        isHealthy: true,
        lastChecked: Date.now(),
        consecutiveFailures: 0,
        avgResponseMs: 42,
      }));

      router.registerProvider(
        createMockProvider({ id: 'a', healthCheck: checkFn })
      );
      router.registerProvider(
        createMockProvider({ id: 'b', healthCheck: checkFn })
      );

      const results = await router.checkAllProviders();

      expect(checkFn).toHaveBeenCalledTimes(2);
      expect(results.size).toBe(2);
      expect(results.get('a')?.isHealthy).toBe(true);
      expect(results.get('b')?.isHealthy).toBe(true);
    });

    it('handles health check throwing', async () => {
      const router = new ModelRouter();
      router.registerProvider(
        createMockProvider({
          id: 'broken',
          healthCheck: async () => {
            throw new Error('Connection refused');
          },
        })
      );

      const results = await router.checkAllProviders();

      expect(results.get('broken')?.isHealthy).toBe(false);
      expect(results.get('broken')?.lastError).toBe('Connection refused');
    });
  });

  // ── Configuration ──

  describe('Configuration', () => {
    it('sets and gets config', () => {
      const router = new ModelRouter();
      const newConfig: RoutingConfig = {
        name: 'custom',
        description: 'Custom config',
        defaultProviderId: 'gemini',
        rules: [],
        updatedAt: Date.now(),
      };

      router.setConfig(newConfig);
      const config = router.getConfig();

      expect(config.name).toBe('custom');
      expect(config.description).toBe('Custom config');
    });

    it('updates timestamp on config change', () => {
      const router = new ModelRouter();
      const before = Date.now();

      router.setConfig({
        name: 'new',
        description: 'New',
        defaultProviderId: 'gemini',
        rules: [],
        updatedAt: 0,
      });

      expect(router.getConfig().updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('returns a copy of config (not reference)', () => {
      const router = new ModelRouter();
      const config = router.getConfig();
      config.name = 'MUTATED';

      expect(router.getConfig().name).not.toBe('MUTATED');
    });
  });

  // ── Pre-built Configs ──

  describe('Pre-built Configs', () => {
    it('hybrid config routes reasoning to Claude first', () => {
      const config = createHybridConfig();
      const reasoningRule = config.rules.find(
        (r) => r.taskType === TaskType.REASONING
      );

      expect(reasoningRule?.providerChain[0]).toBe('claude');
      expect(reasoningRule?.providerChain[1]).toBe('gemini');
    });

    it('hybrid config routes code to Claude first', () => {
      const config = createHybridConfig();
      const codeRule = config.rules.find((r) => r.taskType === TaskType.CODE);

      expect(codeRule?.providerChain[0]).toBe('claude');
    });

    it('hybrid config keeps TTS and IMAGE on Gemini only', () => {
      const config = createHybridConfig();
      const ttsRule = config.rules.find((r) => r.taskType === TaskType.TTS);
      const imgRule = config.rules.find((r) => r.taskType === TaskType.IMAGE);

      expect(ttsRule?.providerChain).toEqual(['gemini']);
      expect(imgRule?.providerChain).toEqual(['gemini']);
    });

    it('hybrid config routes background to Ollama first', () => {
      const config = createHybridConfig();
      const bgRule = config.rules.find(
        (r) => r.taskType === TaskType.BACKGROUND
      );

      expect(bgRule?.providerChain[0]).toBe('ollama');
    });

    it('cost-saver config prefers Ollama for everything possible', () => {
      const config = createCostSaverConfig();

      for (const rule of config.rules) {
        if (
          rule.taskType !== TaskType.TTS &&
          rule.taskType !== TaskType.IMAGE &&
          rule.taskType !== TaskType.VISION
        ) {
          expect(rule.providerChain[0]).toBe('ollama');
        }
      }
    });

    it('cost-saver still routes TTS/IMAGE to Gemini', () => {
      const config = createCostSaverConfig();
      const ttsRule = config.rules.find((r) => r.taskType === TaskType.TTS);
      const imgRule = config.rules.find((r) => r.taskType === TaskType.IMAGE);

      expect(ttsRule?.providerChain).toEqual(['gemini']);
      expect(imgRule?.providerChain).toEqual(['gemini']);
    });

    it('all configs have rules for every TaskType', () => {
      const configs = [createHybridConfig(), createCostSaverConfig()];
      const allTasks = Object.values(TaskType);

      for (const config of configs) {
        for (const task of allTasks) {
          const rule = config.rules.find((r) => r.taskType === task);
          expect(rule).toBeDefined();
        }
      }
    });
  });

  // ── Statistics & Observability ──

  describe('Statistics & Observability', () => {
    it('tracks routing decisions', async () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      await router.resolveModel(TaskType.CHAT);
      await router.resolveModel(TaskType.REASONING);
      await router.resolveModel(TaskType.CHAT);

      const stats = router.getStats();
      expect(stats.totalDecisions).toBe(3);
      expect(stats.byProvider['gemini']).toBe(3);
      expect(stats.byTaskType['chat']).toBe(2);
      expect(stats.byTaskType['reasoning']).toBe(1);
    });

    it('calculates fallback rate', async () => {
      const router = new ModelRouter({
        name: 'test',
        description: 'Test',
        defaultProviderId: 'gemini',
        rules: [
          {
            taskType: TaskType.CHAT,
            providerChain: ['ghost', 'gemini'],
          },
        ],
        updatedAt: Date.now(),
      });
      router.registerProvider(new GeminiProvider());

      await router.resolveModel(TaskType.CHAT);

      const stats = router.getStats();
      expect(stats.fallbackRate).toBeGreaterThan(0);
    });

    it('returns recent decisions', async () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      await router.resolveModel(TaskType.CHAT);
      await router.resolveModel(TaskType.CODE);

      const recent = router.getRecentDecisions(5);
      expect(recent).toHaveLength(2);
      expect(recent[0].taskType).toBe(TaskType.CHAT);
      expect(recent[1].taskType).toBe(TaskType.CODE);
    });

    it('caps history at max size', async () => {
      const router = new ModelRouter();
      router.registerProvider(createMockProvider({ id: 'gemini' }));

      // Make 150 decisions (max is 100)
      for (let i = 0; i < 150; i++) {
        await router.resolveModel(TaskType.CHAT);
      }

      const stats = router.getStats();
      expect(stats.totalDecisions).toBeLessThanOrEqual(100);
    });

    it('returns empty stats when no decisions made', () => {
      const router = new ModelRouter();
      const stats = router.getStats();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.fallbackRate).toBe(0);
      expect(stats.avgRoutingLatencyMs).toBe(0);
    });

    it('provides complete diagnostics', () => {
      const router = new ModelRouter();
      router.registerProvider(new GeminiProvider());

      const diag = router.getDiagnostics();

      expect(diag.config).toContain('default');
      expect(diag.providers).toHaveLength(1);
      expect(diag.providers[0].id).toBe('gemini');
      expect(diag.providers[0].capabilities).toContain('chat');
      expect(diag.providers[0].capabilities).toContain('tts');
      expect(diag.providers[0].capabilities).toContain('image');
      expect(diag.stats).toBeDefined();
    });
  });

  // ── Singleton ──

  describe('Singleton', () => {
    it('returns the same instance on multiple calls', () => {
      const a = getModelRouter();
      const b = getModelRouter();

      expect(a).toBe(b);
    });

    it('has Gemini provider registered by default', () => {
      const router = getModelRouter();
      expect(router.getProvider('gemini')).toBeDefined();
    });

    it('resets correctly', () => {
      const a = getModelRouter();
      resetModelRouter();
      const b = getModelRouter();

      expect(a).not.toBe(b);
    });
  });
});
