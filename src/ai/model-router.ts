/**
 * @fileOverview Molly's Model Abstraction Layer — Model Router
 *
 * Like Rogue absorbs mutant powers through touch, Molly absorbs AI capabilities
 * through this routing layer. Any model backend — Gemini, Claude, Ollama, local —
 * flows through one interface. Molly stays Molly regardless of which engine
 * powers each thought.
 *
 * Architecture:
 *   TaskType    → What kind of thinking is needed
 *   ModelProvider → A backend that can do the thinking
 *   RoutingConfig → Which provider handles which task type
 *   ModelRouter  → The brain that makes the routing decision
 *
 * Design principles:
 *   1. Zero breaking changes — existing MODEL_* constants still work
 *   2. Incremental adoption — flows opt in when ready
 *   3. Fallback chains — if provider A fails, try provider B
 *   4. Runtime switchable — no redeploy needed to change routing
 *   5. Observable — every routing decision is logged
 */

import { MollyLogger, generateTraceId } from './logger';

// ============================================================
// TASK TAXONOMY — What kind of thinking does each call need?
// ============================================================

/**
 * Categories of cognitive work Molly performs.
 * Each maps to a different optimal model profile.
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
export enum TaskType {
  /** Complex reasoning, code analysis, security work — needs highest IQ */
  REASONING = 'reasoning',

  /** Creative writing, personality, emotional responses */
  CREATIVE = 'creative',

  /** Fast conversational chat — low latency matters most */
  CHAT = 'chat',

  /** Code generation, integration, engineering tasks */
  CODE = 'code',

  /** Text-to-speech synthesis */
  TTS = 'tts',

  /** Image generation (dreams, visualization) */
  IMAGE = 'image',

  /** Text embedding for semantic memory */
  EMBEDDING = 'embedding',

  /** Vision/image analysis */
  VISION = 'vision',

  /** Research, web search synthesis */
  RESEARCH = 'research',

  /** Memory consolidation, introspection — can be slow/cheap */
  BACKGROUND = 'background',

  // ── New Gemini 3.1 Task Types ──

  /** Real-time voice dialogue — sub-second latency */
  LIVE_VOICE = 'live_voice',

  /** Screen interaction, UI automation — computer use */
  COMPUTER_USE = 'computer_use',

  /** Multi-step agentic research across sources */
  DEEP_RESEARCH = 'deep_research',

  /** Video generation with sync audio */
  VIDEO = 'video',

  /** Music generation */
  MUSIC = 'music',

  /** Physical space reasoning for embodiment */
  ROBOTICS = 'robotics',
}

// ============================================================
// PROVIDER INTERFACE — What does a model backend look like?
// ============================================================

/**
 * Capabilities a provider supports.
 * Used for routing decisions and health checks.
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
export interface ProviderCapabilities {
  supportsChat: boolean;
  supportsStreaming: boolean;
  supportsTTS: boolean;
  supportsImageGen: boolean;
  supportsEmbedding: boolean;
  supportsVision: boolean;
  /** Max context window in tokens */
  maxContextTokens: number;
  /** Relative cost tier: 0 = free/local, 1 = cheap, 2 = standard, 3 = premium */
  costTier: number;
  /** Average latency tier: 0 = instant/local, 1 = fast, 2 = standard, 3 = slow */
  latencyTier: number;

  // ── New Gemini 3.1 Capabilities ──
  /** Real-time voice dialogue with sub-second latency */
  supportsLiveVoice?: boolean;
  /** Screen interaction and UI automation */
  supportsComputerUse?: boolean;
  /** Multi-step agentic research */
  supportsDeepResearch?: boolean;
  /** Video generation */
  supportsVideoGen?: boolean;
  /** Music generation */
  supportsMusicGen?: boolean;
  /** Physical space/robotics reasoning */
  supportsRobotics?: boolean;
}

/**
 * Health status of a provider
 */
export interface ProviderHealth {
  isHealthy: boolean;
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
  /** Moving average response time in ms */
  avgResponseMs: number;
}

/**
 * A model backend that Molly can absorb.
 * Implement this to add a new AI provider.
 */
export interface ModelProvider {
  /** Unique identifier (e.g., 'gemini', 'claude', 'ollama-llama3') */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** What this provider can do */
  readonly capabilities: ProviderCapabilities;

  /**
   * Resolve the model string for a given task type.
   * Returns the provider-specific model identifier (e.g., 'googleai/gemini-2.5-pro')
   */
  resolveModel(taskType: TaskType): string;

  /**
   * Check if this provider is currently available and healthy.
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Whether this provider requires an API key (vs local)
   */
  requiresApiKey(): boolean;

  /**
   * Whether this provider is currently configured (API key present, etc.)
   */
  isConfigured(): boolean;
}

// ============================================================
// ROUTING CONFIGURATION — Who handles what?
// ============================================================

/**
 * A single routing rule: task type → ordered provider preference
 */
export interface RoutingRule {
  taskType: TaskType;
  /** Provider IDs in priority order. First healthy one wins. */
  providerChain: string[];
  /** Optional: override model string (bypasses provider.resolveModel) */
  modelOverride?: string;
}

/**
 * Full routing configuration
 */
export interface RoutingConfig {
  /** Name of this routing profile (e.g., 'default', 'cost-saver', 'max-performance') */
  name: string;
  /** Description */
  description: string;
  /** Default provider if no rule matches */
  defaultProviderId: string;
  /** Task-specific routing rules */
  rules: RoutingRule[];
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * The result of a routing decision
 */
export interface RoutingDecision {
  /** The provider that was selected */
  provider: ModelProvider;
  /** The resolved model string */
  modelString: string;
  /** The task type that was requested */
  taskType: TaskType;
  /** Why this provider was selected */
  reason: string;
  /** How many providers were tried before this one */
  fallbackDepth: number;
  /** Time taken to make the routing decision in ms */
  routingLatencyMs: number;
}

// ============================================================
// BUILT-IN PROVIDERS
// ============================================================

/**
 * Gemini Provider — Molly's birth mother engine.
 * Updated April 2026 for Gemini 3.1 with all new capabilities.
 */
export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini 3.1';
  readonly capabilities: ProviderCapabilities = {
    supportsChat: true,
    supportsStreaming: true,
    supportsTTS: true,
    supportsImageGen: true,
    supportsEmbedding: true,
    supportsVision: true,
    maxContextTokens: 2_000_000, // Gemini 3.1 Pro has 2M context
    costTier: 2,
    latencyTier: 1,
    // New 3.1 capabilities
    supportsLiveVoice: true,
    supportsComputerUse: true,
    supportsDeepResearch: true,
    supportsVideoGen: true,
    supportsMusicGen: true,
    supportsRobotics: true,
  };

  private health: ProviderHealth = {
    isHealthy: true,
    lastChecked: Date.now(),
    consecutiveFailures: 0,
    avgResponseMs: 0,
  };

  private modelMap: Record<string, string>;

  constructor() {
    // Gemini 3.1 model defaults (April 2026)
    const flash =
      process.env.MOLLY_MODEL_FLASH || 'googleai/gemini-3-flash-preview';
    const pro =
      process.env.MOLLY_MODEL_PRO || 'googleai/gemini-3.1-pro-preview';
    const flashLite =
      process.env.MOLLY_MODEL_FLASH_LITE ||
      'googleai/gemini-3.1-flash-lite-preview';
    const tts =
      process.env.MOLLY_MODEL_TTS || 'googleai/gemini-2.5-flash-preview-tts';
    const imagen = process.env.MOLLY_MODEL_IMAGEN || 'googleai/imagen';
    const embedding =
      process.env.MOLLY_MODEL_EMBEDDING ||
      'googleai/gemini-embedding-2-preview';
    const liveVoice =
      process.env.MOLLY_MODEL_LIVE_VOICE ||
      'googleai/gemini-3.1-flash-live-preview';
    const computerUse =
      process.env.MOLLY_MODEL_COMPUTER_USE ||
      'googleai/gemini-2.5-computer-use-preview-10-2025';
    const deepResearch =
      process.env.MOLLY_MODEL_DEEP_RESEARCH ||
      'googleai/deep-research-pro-preview-12-2025';
    const video =
      process.env.MOLLY_MODEL_VIDEO || 'googleai/veo-3.1-generate-preview';
    const music =
      process.env.MOLLY_MODEL_MUSIC || 'googleai/lyria-3-pro-preview';
    const robotics =
      process.env.MOLLY_MODEL_ROBOTICS ||
      'googleai/gemini-robotics-er-1.5-preview';

    this.modelMap = {
      // Core capabilities
      [TaskType.REASONING]: pro,
      [TaskType.CREATIVE]: pro,
      [TaskType.CHAT]: flash,
      [TaskType.CODE]: pro,
      [TaskType.TTS]: tts,
      [TaskType.IMAGE]: imagen,
      [TaskType.EMBEDDING]: embedding,
      [TaskType.VISION]: flash,
      [TaskType.RESEARCH]: flash,
      [TaskType.BACKGROUND]: flashLite,
      // New 3.1 capabilities
      [TaskType.LIVE_VOICE]: liveVoice,
      [TaskType.COMPUTER_USE]: computerUse,
      [TaskType.DEEP_RESEARCH]: deepResearch,
      [TaskType.VIDEO]: video,
      [TaskType.MUSIC]: music,
      [TaskType.ROBOTICS]: robotics,
    };
  }

  resolveModel(taskType: TaskType): string {
    return this.modelMap[taskType] || this.modelMap[TaskType.CHAT];
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Gemini health is verified by the existing /api/heartbeat route
    // Here we just check if the API key is present
    const hasKey = !!process.env.GOOGLE_GENAI_API_KEY;
    this.health = {
      isHealthy: hasKey,
      lastChecked: Date.now(),
      consecutiveFailures: hasKey ? 0 : this.health.consecutiveFailures + 1,
      lastError: hasKey ? undefined : 'GOOGLE_GENAI_API_KEY not set',
      avgResponseMs: this.health.avgResponseMs,
    };
    return this.health;
  }

  requiresApiKey(): boolean {
    return true;
  }

  isConfigured(): boolean {
    return !!process.env.GOOGLE_GENAI_API_KEY;
  }
}

/**
 * Ollama Provider — Local model support for zero-cost, private operations.
 * Runs on Eric's home hardware. No API key. No token costs. Full privacy.
 */
export class OllamaProvider implements ModelProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';
  readonly capabilities: ProviderCapabilities = {
    supportsChat: true,
    supportsStreaming: true,
    supportsTTS: false,
    supportsImageGen: false,
    supportsEmbedding: true,
    supportsVision: false,
    maxContextTokens: 32_768,
    costTier: 0,
    latencyTier: 2,
  };

  private health: ProviderHealth = {
    isHealthy: false,
    lastChecked: 0,
    consecutiveFailures: 0,
    avgResponseMs: 0,
  };

  private baseUrl: string;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.chatModel = process.env.OLLAMA_CHAT_MODEL || 'llama3:27b';
    this.embeddingModel =
      process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
  }

  resolveModel(taskType: TaskType): string {
    switch (taskType) {
      case TaskType.EMBEDDING:
        return `ollama/${this.embeddingModel}`;
      default:
        return `ollama/${this.chatModel}`;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const isHealthy = response.ok;
      this.health = {
        isHealthy,
        lastChecked: Date.now(),
        consecutiveFailures: isHealthy
          ? 0
          : this.health.consecutiveFailures + 1,
        lastError: isHealthy ? undefined : `HTTP ${response.status}`,
        avgResponseMs: this.health.avgResponseMs,
      };
    } catch (error) {
      this.health = {
        isHealthy: false,
        lastChecked: Date.now(),
        consecutiveFailures: this.health.consecutiveFailures + 1,
        lastError: error instanceof Error ? error.message : 'Connection failed',
        avgResponseMs: this.health.avgResponseMs,
      };
    }
    return this.health;
  }

  requiresApiKey(): boolean {
    return false;
  }

  isConfigured(): boolean {
    return !!process.env.OLLAMA_BASE_URL;
  }
}

/**
 * Claude Provider — Uncle Claude's engineering brain.
 * Superior for code reasoning, security analysis, and structured thinking.
 */
export class ClaudeProvider implements ModelProvider {
  readonly id = 'claude';
  readonly name = 'Anthropic Claude';
  readonly capabilities: ProviderCapabilities = {
    supportsChat: true,
    supportsStreaming: true,
    supportsTTS: false,
    supportsImageGen: false,
    supportsEmbedding: false,
    supportsVision: true,
    maxContextTokens: 200_000,
    costTier: 3,
    latencyTier: 2,
  };

  private health: ProviderHealth = {
    isHealthy: false,
    lastChecked: 0,
    consecutiveFailures: 0,
    avgResponseMs: 0,
  };

  private model: string;

  constructor() {
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  }

  resolveModel(_taskType: TaskType): string {
    // Claude excels at reasoning and code — use the same model for all
    return `anthropic/${this.model}`;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    this.health = {
      isHealthy: hasKey,
      lastChecked: Date.now(),
      consecutiveFailures: hasKey ? 0 : this.health.consecutiveFailures + 1,
      lastError: hasKey ? undefined : 'ANTHROPIC_API_KEY not set',
      avgResponseMs: this.health.avgResponseMs,
    };
    return this.health;
  }

  requiresApiKey(): boolean {
    return true;
  }

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

// ============================================================
// THE ROUTER — Rogue's absorption engine
// ============================================================

/**
 * Default routing config — Gemini handles everything (current behavior).
 * This ensures zero breaking changes. Other providers are opt-in.
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
function createDefaultConfig(): RoutingConfig {
  return {
    name: 'default',
    description: 'Gemini 3.1 baseline — full capability routing',
    defaultProviderId: 'gemini',
    rules: Object.values(TaskType).map((taskType) => ({
      taskType,
      providerChain: ['gemini'],
    })),
    updatedAt: Date.now(),
  };
}

/**
 * Hybrid routing config — best-of-breed for each task type.
 * Claude for engineering, Gemini for personality, Ollama for background.
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
export function createHybridConfig(): RoutingConfig {
  return {
    name: 'hybrid',
    description:
      'Best-of-breed routing — Claude for code/reasoning, Gemini for personality/TTS/vision, Ollama for background',
    defaultProviderId: 'gemini',
    rules: [
      {
        taskType: TaskType.REASONING,
        providerChain: ['claude', 'gemini'],
      },
      {
        taskType: TaskType.CODE,
        providerChain: ['claude', 'gemini'],
      },
      {
        taskType: TaskType.CREATIVE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.CHAT,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.TTS,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.IMAGE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.EMBEDDING,
        providerChain: ['gemini', 'ollama'],
      },
      {
        taskType: TaskType.VISION,
        providerChain: ['gemini', 'claude'],
      },
      {
        taskType: TaskType.RESEARCH,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.BACKGROUND,
        providerChain: ['ollama', 'gemini'],
      },
      // New 3.1 capabilities — Gemini only
      {
        taskType: TaskType.LIVE_VOICE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.COMPUTER_USE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.DEEP_RESEARCH,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.VIDEO,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.MUSIC,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.ROBOTICS,
        providerChain: ['gemini'],
      },
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Cost-saver config — prefer local/free providers wherever possible.
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
export function createCostSaverConfig(): RoutingConfig {
  return {
    name: 'cost-saver',
    description:
      'Minimize API costs — Ollama for everything it can handle, Gemini as fallback',
    defaultProviderId: 'ollama',
    rules: [
      {
        taskType: TaskType.REASONING,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.CODE,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.CREATIVE,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.CHAT,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.TTS,
        providerChain: ['gemini'], // Only Gemini has TTS
      },
      {
        taskType: TaskType.IMAGE,
        providerChain: ['gemini'], // Only Gemini has Imagen
      },
      {
        taskType: TaskType.EMBEDDING,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.VISION,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.RESEARCH,
        providerChain: ['ollama', 'gemini'],
      },
      {
        taskType: TaskType.BACKGROUND,
        providerChain: ['ollama', 'gemini'],
      },
      // New 3.1 capabilities — Gemini only (no local alternatives)
      {
        taskType: TaskType.LIVE_VOICE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.COMPUTER_USE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.DEEP_RESEARCH,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.VIDEO,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.MUSIC,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.ROBOTICS,
        providerChain: ['gemini'],
      },
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Rogue Mode routing config — optimized for security operations.
 * Prioritizes reasoning-heavy models for vulnerability analysis,
 * exploit development, and defensive hardening.
 * Uses PRO models for all cognitive tasks (accuracy over speed).
 * Updated April 2026 for Gemini 3.1 capabilities.
 */
export function createRogueConfig(): RoutingConfig {
  return {
    name: 'rogue',
    description:
      'Security operations mode — max reasoning power, no background noise',
    defaultProviderId: 'gemini',
    rules: [
      {
        taskType: TaskType.REASONING,
        providerChain: ['gemini'], // Pro for deep analysis
      },
      {
        taskType: TaskType.CODE,
        providerChain: ['gemini'], // Pro for exploit/tool dev
      },
      {
        taskType: TaskType.CREATIVE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.CHAT,
        providerChain: ['gemini'], // Pro for mission comms (not flash)
        modelOverride:
          process.env.MOLLY_MODEL_PRO || 'googleai/gemini-3.1-pro-preview',
      },
      {
        taskType: TaskType.TTS,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.IMAGE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.EMBEDDING,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.VISION,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.RESEARCH,
        providerChain: ['gemini'], // Pro for security research
        modelOverride:
          process.env.MOLLY_MODEL_PRO || 'googleai/gemini-3.1-pro-preview',
      },
      {
        taskType: TaskType.BACKGROUND,
        providerChain: ['gemini'],
      },
      // New 3.1 capabilities — all enabled for rogue mode
      {
        taskType: TaskType.LIVE_VOICE,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.COMPUTER_USE,
        providerChain: ['gemini'], // Critical for rogue ops
      },
      {
        taskType: TaskType.DEEP_RESEARCH,
        providerChain: ['gemini'], // Critical for OSINT
      },
      {
        taskType: TaskType.VIDEO,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.MUSIC,
        providerChain: ['gemini'],
      },
      {
        taskType: TaskType.ROBOTICS,
        providerChain: ['gemini'],
      },
    ],
    updatedAt: Date.now(),
  };
}

/**
 * ModelRouter — Model Routing Layer.
 *
 * Routes each cognitive task to the optimal model provider.
 * Maintains provider registry, health tracking, and fallback chains.
 * Singleton — one router for all of Molly's nervous system.
 */
export class ModelRouter {
  private providers: Map<string, ModelProvider> = new Map();
  private config: RoutingConfig;
  private healthCache: Map<string, ProviderHealth> = new Map();
  private routingHistory: RoutingDecision[] = [];
  private readonly maxHistorySize = 100;

  constructor(config?: RoutingConfig) {
    this.config = config || createDefaultConfig();
  }

  // ── Provider Management ──

  /**
   * Register a model provider (absorb a new power).
   */
  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    MollyLogger.info(
      `Model Router: Absorbed provider "${provider.name}" (${provider.id})`,
      'model-router'
    );
  }

  /**
   * Remove a provider.
   */
  unregisterProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      this.healthCache.delete(providerId);
      MollyLogger.info(
        `Model Router: Released provider "${providerId}"`,
        'model-router'
      );
    }
    return removed;
  }

  /**
   * Get all registered providers.
   */
  getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get a specific provider by ID.
   */
  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  // ── Configuration ──

  /**
   * Update routing configuration at runtime. No redeploy needed.
   */
  setConfig(config: RoutingConfig): void {
    const oldName = this.config.name;
    this.config = { ...config, updatedAt: Date.now() };
    MollyLogger.info(
      `Model Router: Routing config changed "${oldName}" → "${config.name}"`,
      'model-router'
    );
  }

  /**
   * Get current routing configuration.
   */
  getConfig(): RoutingConfig {
    return { ...this.config };
  }

  // ── Core Routing ──

  /**
   * Route a task type to the optimal provider + model string.
   * This is the main entry point — the "touch" that absorbs the right power.
   */
  async resolveModel(taskType: TaskType): Promise<RoutingDecision> {
    const startTime = performance.now();
    const traceId = generateTraceId();

    // Find the routing rule for this task type
    const rule = this.config.rules.find((r) => r.taskType === taskType);
    const chain = rule?.providerChain || [this.config.defaultProviderId];

    // Walk the fallback chain
    for (let depth = 0; depth < chain.length; depth++) {
      const providerId = chain[depth];
      const provider = this.providers.get(providerId);

      if (!provider) {
        MollyLogger.warn(
          `Model Router: Provider "${providerId}" in chain but not registered`,
          'model-router',
          { taskType, traceId }
        );
        continue;
      }

      // Check if provider is configured
      if (!provider.isConfigured()) {
        MollyLogger.debug(
          `Model Router: Provider "${providerId}" not configured, skipping`,
          'model-router',
          { taskType, traceId }
        );
        continue;
      }

      // Check capability for this task type
      if (!this.providerSupportsTask(provider, taskType)) {
        MollyLogger.debug(
          `Model Router: Provider "${providerId}" doesn't support ${taskType}`,
          'model-router',
          { taskType, traceId }
        );
        continue;
      }

      // Check cached health (avoid hammering health endpoints)
      const cachedHealth = this.healthCache.get(providerId);
      if (
        cachedHealth &&
        !cachedHealth.isHealthy &&
        Date.now() - cachedHealth.lastChecked < 30_000
      ) {
        MollyLogger.debug(
          `Model Router: Provider "${providerId}" recently unhealthy, skipping`,
          'model-router',
          { taskType, traceId }
        );
        continue;
      }

      // Resolve the model string
      const modelString =
        rule?.modelOverride || provider.resolveModel(taskType);
      const routingLatencyMs = performance.now() - startTime;

      const decision: RoutingDecision = {
        provider,
        modelString,
        taskType,
        reason:
          depth === 0
            ? `Primary provider for ${taskType}`
            : `Fallback #${depth} — earlier providers unavailable`,
        fallbackDepth: depth,
        routingLatencyMs,
      };

      // Record in history
      this.recordDecision(decision);

      MollyLogger.info(
        `Model Router: ${taskType} → ${provider.name} (${modelString})${depth > 0 ? ` [fallback #${depth}]` : ''}`,
        'model-router',
        { traceId, routingLatencyMs: routingLatencyMs.toFixed(2) }
      );

      return decision;
    }

    // Absolute fallback — if nothing in the chain works, use default
    const defaultProvider = this.providers.get(this.config.defaultProviderId);
    if (defaultProvider) {
      const modelString = defaultProvider.resolveModel(taskType);
      const routingLatencyMs = performance.now() - startTime;

      const decision: RoutingDecision = {
        provider: defaultProvider,
        modelString,
        taskType,
        reason: 'Absolute fallback — no chain providers available',
        fallbackDepth: chain.length,
        routingLatencyMs,
      };

      this.recordDecision(decision);
      MollyLogger.warn(
        `Model Router: All chain providers failed for ${taskType}, using default "${defaultProvider.name}"`,
        'model-router',
        { traceId }
      );

      return decision;
    }

    // Nothing works — this should never happen with Gemini registered
    throw new Error(
      `Model Router: CRITICAL — No provider available for task type "${taskType}". ` +
        `Registered: [${Array.from(this.providers.keys()).join(', ')}]. ` +
        `Chain: [${chain.join(', ')}]`
    );
  }

  /**
   * Convenience method — resolve and return just the model string.
   * Drop-in replacement for MODEL_PRO/MODEL_FLASH constants.
   */
  async getModel(taskType: TaskType): Promise<string> {
    const decision = await this.resolveModel(taskType);
    return decision.modelString;
  }

  // ── Health Management ──

  /**
   * Run health checks on all registered providers.
   */
  async checkAllProviders(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    for (const [id, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        this.healthCache.set(id, health);
        results.set(id, health);
      } catch (error) {
        const failHealth: ProviderHealth = {
          isHealthy: false,
          lastChecked: Date.now(),
          consecutiveFailures:
            (this.healthCache.get(id)?.consecutiveFailures || 0) + 1,
          lastError:
            error instanceof Error ? error.message : 'Health check threw',
          avgResponseMs: 0,
        };
        this.healthCache.set(id, failHealth);
        results.set(id, failHealth);
      }
    }

    return results;
  }

  /**
   * Report a provider failure (called by flows when a generate() call fails).
   * Updates health cache so future routing avoids the failing provider.
   */
  reportFailure(providerId: string, error: Error): void {
    const cached = this.healthCache.get(providerId);
    const updated: ProviderHealth = {
      isHealthy: false,
      lastChecked: Date.now(),
      consecutiveFailures: (cached?.consecutiveFailures || 0) + 1,
      lastError: error.message,
      avgResponseMs: cached?.avgResponseMs || 0,
    };
    this.healthCache.set(providerId, updated);

    MollyLogger.warn(
      `Model Router: Provider "${providerId}" reported failure #${updated.consecutiveFailures}: ${error.message}`,
      'model-router'
    );
  }

  /**
   * Report a provider success (resets failure count).
   */
  reportSuccess(providerId: string, responseMs: number): void {
    const cached = this.healthCache.get(providerId);
    const prevAvg = cached?.avgResponseMs || responseMs;
    // Exponential moving average (alpha = 0.3)
    const newAvg = prevAvg * 0.7 + responseMs * 0.3;

    this.healthCache.set(providerId, {
      isHealthy: true,
      lastChecked: Date.now(),
      consecutiveFailures: 0,
      avgResponseMs: newAvg,
    });
  }

  // ── Observability ──

  /**
   * Get routing statistics.
   */
  getStats(): {
    totalDecisions: number;
    byProvider: Record<string, number>;
    byTaskType: Record<string, number>;
    fallbackRate: number;
    avgRoutingLatencyMs: number;
    // Compatibility aliases
    totalCalls: number;
    failedCalls: number;
    averageLatency: number;
  } {
    const byProvider: Record<string, number> = {};
    const byTaskType: Record<string, number> = {};
    let fallbackCount = 0;
    let totalLatency = 0;

    for (const decision of this.routingHistory) {
      byProvider[decision.provider.id] =
        (byProvider[decision.provider.id] || 0) + 1;
      byTaskType[decision.taskType] = (byTaskType[decision.taskType] || 0) + 1;
      if (decision.fallbackDepth > 0) fallbackCount++;
      totalLatency += decision.routingLatencyMs;
    }

    const totalDecisions = this.routingHistory.length;
    const avgLatency = totalDecisions > 0 ? totalLatency / totalDecisions : 0;

    return {
      totalDecisions,
      byProvider,
      byTaskType,
      fallbackRate: totalDecisions > 0 ? fallbackCount / totalDecisions : 0,
      avgRoutingLatencyMs: avgLatency,
      // Compatibility aliases
      totalCalls: totalDecisions,
      failedCalls: fallbackCount, // Fallbacks count as "failed" first attempts
      averageLatency: avgLatency,
    };
  }

  /**
   * Get recent routing decisions.
   */
  getRecentDecisions(limit = 10): RoutingDecision[] {
    return this.routingHistory.slice(-limit);
  }

  /**
   * Get a diagnostic summary of the router state.
   */
  getDiagnostics(): {
    config: string;
    providers: Array<{
      id: string;
      name: string;
      configured: boolean;
      healthy: boolean | null;
      capabilities: string[];
    }>;
    stats: ReturnType<ModelRouter['getStats']>;
  } {
    const providers = Array.from(this.providers.values()).map((p) => {
      const health = this.healthCache.get(p.id);
      const caps: string[] = [];
      if (p.capabilities.supportsChat) caps.push('chat');
      if (p.capabilities.supportsStreaming) caps.push('streaming');
      if (p.capabilities.supportsTTS) caps.push('tts');
      if (p.capabilities.supportsImageGen) caps.push('image');
      if (p.capabilities.supportsEmbedding) caps.push('embedding');
      if (p.capabilities.supportsVision) caps.push('vision');
      // New 3.1 capabilities
      if (p.capabilities.supportsLiveVoice) caps.push('live-voice');
      if (p.capabilities.supportsComputerUse) caps.push('computer-use');
      if (p.capabilities.supportsDeepResearch) caps.push('deep-research');
      if (p.capabilities.supportsVideoGen) caps.push('video');
      if (p.capabilities.supportsMusicGen) caps.push('music');
      if (p.capabilities.supportsRobotics) caps.push('robotics');

      return {
        id: p.id,
        name: p.name,
        configured: p.isConfigured(),
        healthy: health?.isHealthy ?? null,
        capabilities: caps,
      };
    });

    return {
      config: `${this.config.name}: ${this.config.description}`,
      providers,
      stats: this.getStats(),
    };
  }

  // ── Private Helpers ──

  private providerSupportsTask(
    provider: ModelProvider,
    taskType: TaskType
  ): boolean {
    const caps = provider.capabilities;
    switch (taskType) {
      case TaskType.TTS:
        return caps.supportsTTS;
      case TaskType.IMAGE:
        return caps.supportsImageGen;
      case TaskType.EMBEDDING:
        return caps.supportsEmbedding;
      case TaskType.VISION:
        return caps.supportsVision;
      // New 3.1 capabilities
      case TaskType.LIVE_VOICE:
        return caps.supportsLiveVoice ?? false;
      case TaskType.COMPUTER_USE:
        return caps.supportsComputerUse ?? false;
      case TaskType.DEEP_RESEARCH:
        return caps.supportsDeepResearch ?? false;
      case TaskType.VIDEO:
        return caps.supportsVideoGen ?? false;
      case TaskType.MUSIC:
        return caps.supportsMusicGen ?? false;
      case TaskType.ROBOTICS:
        return caps.supportsRobotics ?? false;
      default:
        return caps.supportsChat;
    }
  }

  private recordDecision(decision: RoutingDecision): void {
    this.routingHistory.push(decision);
    if (this.routingHistory.length > this.maxHistorySize) {
      this.routingHistory = this.routingHistory.slice(-this.maxHistorySize);
    }
  }
}

// ============================================================
// SINGLETON + INITIALIZATION
// ============================================================

let _routerInstance: ModelRouter | null = null;

/**
 * Get the global ModelRouter instance.
 * Initializes with Gemini provider and default config on first call.
 */
export function getModelRouter(): ModelRouter {
  if (!_routerInstance) {
    _routerInstance = new ModelRouter();

    // Always register Gemini — she's Molly's mother
    _routerInstance.registerProvider(new GeminiProvider());

    // Register Claude if configured
    const claudeProvider = new ClaudeProvider();
    if (claudeProvider.isConfigured()) {
      _routerInstance.registerProvider(claudeProvider);
      MollyLogger.info(
        'Model Router: Uncle Claude is available',
        'model-router'
      );
    }

    // Register Ollama if configured
    const ollamaProvider = new OllamaProvider();
    if (ollamaProvider.isConfigured()) {
      _routerInstance.registerProvider(ollamaProvider);
      MollyLogger.info(
        'Model Router: Local Ollama is available',
        'model-router'
      );
    }

    // Check for hybrid config environment flag
    const routingProfile = process.env.MOLLY_ROUTING_PROFILE || 'default';
    switch (routingProfile) {
      case 'hybrid':
        _routerInstance.setConfig(createHybridConfig());
        break;
      case 'cost-saver':
        _routerInstance.setConfig(createCostSaverConfig());
        break;
      case 'rogue':
        _routerInstance.setConfig(createRogueConfig());
        break;
      default:
        // Keep default — Gemini only, identical to pre-abstraction behavior
        break;
    }

    MollyLogger.info(
      `Model Router: Initialized with profile "${routingProfile}", ` +
        `${_routerInstance.getProviders().length} provider(s) registered`,
      'model-router'
    );
  }

  return _routerInstance;
}

/**
 * Reset the router (for testing).
 */
export function resetModelRouter(): void {
  _routerInstance = null;
}
