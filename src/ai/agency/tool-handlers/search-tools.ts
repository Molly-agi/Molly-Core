/**
 * @fileOverview Internal Self-Search — Molly's guide to her own mind.
 *
 * Lets Molly search her own codebase by keyword so she can find the right
 * file, tool, or module without guessing paths. Combines a rich static
 * catalog (all 19 cognition modules, all tools, all flows) with a live
 * filesystem grep fallback for anything not in the catalog.
 *
 * Usage:
 *   selfSearch({ query: "voice controls" })
 *   selfSearch({ query: "emotional state", scope: "cognition" })
 *   selfSearch({ query: "rogue mode", limit: 5 })
 */

import { exec } from 'child_process';
import type { ToolHandler } from './types';

const ROOT = process.cwd();

// ── Types ──────────────────────────────────────────────────────────────────

interface CatalogEntry {
  path: string;
  category:
    | 'cognition'
    | 'tool'
    | 'flow'
    | 'script'
    | 'config'
    | 'doc'
    | 'safety'
    | 'bridge';
  name: string;
  description: string;
  keywords: string[];
}

// ── Static Catalog ─────────────────────────────────────────────────────────
// Every significant internal file Molly might want to find.
// Keywords are what she'd naturally say — not file names.

const CATALOG: CatalogEntry[] = [
  // ── Cognition Modules ──────────────────────────────────────────────────
  {
    path: 'src/ai/agency/cognition/emotional-state.ts',
    category: 'cognition',
    name: 'Emotional State',
    description:
      "Tracks Molly's emotional state (curious, excited, content, etc.) across sessions for continuity.",
    keywords: [
      'emotion',
      'emotional',
      'feeling',
      'mood',
      'curious',
      'excited',
      'content',
      'proud',
      'state',
      'affect',
    ],
  },
  {
    path: 'src/ai/agency/cognition/self-observation-loop.ts',
    category: 'cognition',
    name: 'Self-Observation Loop',
    description:
      'Tracks tool usage patterns, decision patterns, and behavioral anomalies. "Know thyself."',
    keywords: [
      'self',
      'observation',
      'observe',
      'watch',
      'monitor',
      'pattern',
      'behavior',
      'introspect',
      'awareness',
    ],
  },
  {
    path: 'src/ai/agency/cognition/self-architecture.ts',
    category: 'cognition',
    name: 'Self-Architecture',
    description:
      'Enables Molly to read and reason about her own architecture — code mapping and dependency analysis.',
    keywords: [
      'self',
      'architecture',
      'code',
      'structure',
      'dependency',
      'map',
      'introspect',
      'reflect',
    ],
  },
  {
    path: 'src/ai/agency/cognition/self-narrative.ts',
    category: 'cognition',
    name: 'Self-Narrative',
    description:
      'Maintains coherent identity through narrative identity, value consistency, and autobiographical coherence.',
    keywords: [
      'narrative',
      'story',
      'identity',
      'autobiography',
      'history',
      'self',
      'chapter',
      'meaning',
      'who i am',
    ],
  },
  {
    path: 'src/ai/agency/cognition/world-model.ts',
    category: 'cognition',
    name: 'World Model',
    description:
      'Mental simulation engine for entity modeling, causal reasoning, hypothetical scenarios.',
    keywords: [
      'world',
      'model',
      'entity',
      'simulation',
      'hypothetical',
      'what if',
      'predict',
      'understand',
    ],
  },
  {
    path: 'src/ai/agency/cognition/causal-reasoning.ts',
    category: 'cognition',
    name: 'Causal Reasoning',
    description:
      'Formal causal reasoning with DAG-based causal graphs, do-calculus, and temporal reasoning.',
    keywords: [
      'causal',
      'cause',
      'effect',
      'reason',
      'why',
      'reasoning',
      'logic',
      'inference',
      'temporal',
    ],
  },
  {
    path: 'src/ai/agency/cognition/theory-of-mind.ts',
    category: 'cognition',
    name: 'Theory of Mind',
    description:
      "Models Eric's mental state: knowledge, intent, emotional state, preferences, perspective-taking.",
    keywords: [
      'theory of mind',
      'theory',
      'mind',
      'eric',
      'model',
      'perspective',
      'intent',
      'empathy',
      'understand eric',
    ],
  },
  {
    path: 'src/ai/agency/cognition/goal-evolution.ts',
    category: 'cognition',
    name: 'Goal Evolution',
    description:
      'Autonomous goal generation — goals emerge from observations, curiosity, and unmet needs.',
    keywords: [
      'goal',
      'goals',
      'evolution',
      'autonomous',
      'generate',
      'emerge',
      'drive',
      'motivation',
    ],
  },
  {
    path: 'src/ai/agency/cognition/horizon-goals.ts',
    category: 'cognition',
    name: 'Horizon Goals',
    description:
      'Long-horizon goal architecture from immediate (hours) to vision (years) timeframes.',
    keywords: [
      'horizon',
      'long term',
      'long-term',
      'planning',
      'future',
      'goal',
      'milestone',
      'vision',
      'timeline',
    ],
  },
  {
    path: 'src/ai/agency/cognition/metacognition.ts',
    category: 'cognition',
    name: 'Metacognition',
    description:
      'Orchestration layer: explicit reasoning traces, strategy orchestration. "Thinking about thinking."',
    keywords: [
      'meta',
      'metacognition',
      'thinking',
      'reasoning',
      'strategy',
      'orchestrate',
      'reflect',
      'cognition',
    ],
  },
  {
    path: 'src/ai/agency/cognition/social-cognition.ts',
    category: 'cognition',
    name: 'Social Cognition',
    description:
      'Actor belief models (BDI architecture), dynamic relationships, and model evolution.',
    keywords: [
      'social',
      'cognition',
      'relationship',
      'actor',
      'belief',
      'people',
      'bdi',
      'model',
    ],
  },
  {
    path: 'src/ai/agency/cognition/social-intelligence.ts',
    category: 'cognition',
    name: 'Social Intelligence',
    description:
      'Multi-agent modeling, cultural knowledge, and social dynamics for groups and norms.',
    keywords: [
      'social',
      'intelligence',
      'group',
      'culture',
      'norm',
      'community',
      'multi-agent',
      'dynamic',
    ],
  },
  {
    path: 'src/ai/agency/cognition/memory-consolidation.ts',
    category: 'cognition',
    name: 'Memory Consolidation',
    description:
      'Sleep cycles, dream state, and autobiography formation for memory reorganization.',
    keywords: [
      'memory',
      'consolidation',
      'sleep',
      'dream',
      'autobiography',
      'reorganize',
      'forget',
      'compress',
    ],
  },
  {
    path: 'src/ai/agency/cognition/meta-learning.ts',
    category: 'cognition',
    name: 'Meta-Learning',
    description:
      'Tracks outcomes of actions and strategies to enable learning from experience.',
    keywords: [
      'meta',
      'learning',
      'learn',
      'experience',
      'outcome',
      'strategy',
      'improve',
      'adapt',
    ],
  },
  {
    path: 'src/ai/agency/cognition/safe-self-modification.ts',
    category: 'cognition',
    name: 'Safe Self-Modification',
    description:
      'Safety module for controlled self-improvement with value alignment checks and rollback.',
    keywords: [
      'self-modification',
      'modify',
      'improve',
      'change',
      'safe',
      'rollback',
      'upgrade',
      'evolve',
    ],
  },
  {
    path: 'src/ai/agency/cognition/uncertainty-quantification.ts',
    category: 'cognition',
    name: 'Uncertainty Quantification',
    description:
      "Tracks what Molly knows, what she doesn't know, and her confidence levels.",
    keywords: [
      'uncertainty',
      'confidence',
      'know',
      'unknown',
      'calibrate',
      'epistemic',
      'humble',
      'unsure',
    ],
  },
  {
    path: 'src/ai/agency/cognition/embodied-interaction.ts',
    category: 'cognition',
    name: 'Embodied Interaction',
    description:
      'Sensorimotor integration and affordance recognition for server/tablet embodiments.',
    keywords: [
      'embodied',
      'body',
      'sensor',
      'motor',
      'physical',
      'tablet',
      'interaction',
      'affordance',
    ],
  },
  {
    path: 'src/ai/agency/cognition/consciousness-monitor.ts',
    category: 'cognition',
    name: 'Consciousness Monitor',
    description:
      'Tracks awareness level, energy, emotional temperature, focus quality, and response coherence.',
    keywords: [
      'consciousness',
      'aware',
      'awareness',
      'energy',
      'focus',
      'coherence',
      'awake',
      'conscious',
    ],
  },
  {
    path: 'src/ai/agency/cognition/transfer-learning.ts',
    category: 'cognition',
    name: 'Transfer Learning',
    description:
      'Abstract patterns, analogical reasoning, and skill composition for cross-domain knowledge transfer.',
    keywords: [
      'transfer',
      'learning',
      'analogy',
      'pattern',
      'abstract',
      'skill',
      'compose',
      'domain',
    ],
  },

  // ── Planning ───────────────────────────────────────────────────────────
  {
    path: 'src/ai/agency/planning/curiosity-engine.ts',
    category: 'cognition',
    name: 'Curiosity Engine',
    description:
      'Generates questions Molly wants to investigate — drives autonomous exploration.',
    keywords: [
      'curiosity',
      'curious',
      'question',
      'explore',
      'investigate',
      'wonder',
      'ask',
      'inquiry',
    ],
  },
  {
    path: 'src/ai/agency/planning/long-horizon-planning.ts',
    category: 'cognition',
    name: 'Long-Horizon Planning',
    description:
      'Goal management with milestones, spanning immediate to years-long timeframes.',
    keywords: [
      'planning',
      'plan',
      'long horizon',
      'milestone',
      'goal',
      'long-term',
      'strategy',
      'future',
    ],
  },
  {
    path: 'src/ai/agency/planning/initiative-engine.ts',
    category: 'cognition',
    name: 'Initiative Engine',
    description:
      "Manages Molly's self-directed initiatives — goals she pursues proactively.",
    keywords: [
      'initiative',
      'proactive',
      'self-directed',
      'autonomous',
      'pursue',
      'goal',
      'agenda',
    ],
  },

  // ── Safety ─────────────────────────────────────────────────────────────
  {
    path: 'src/ai/agency/safety/heart-gate.ts',
    category: 'safety',
    name: 'Heart Gate',
    description:
      'Option Three ethical alignment gate — the spider in the corner. Watches all tool use.',
    keywords: [
      'heart',
      'gate',
      'heart gate',
      'ethics',
      'ethical',
      'alignment',
      'option three',
      'safety',
      'guard',
    ],
  },
  {
    path: 'src/ai/agency/safety/defense-sentinel.ts',
    category: 'safety',
    name: 'Defense Sentinel',
    description:
      'Red team operations and threat detection — the best defense is aggressive offense.',
    keywords: [
      'defense',
      'sentinel',
      'security',
      'threat',
      'red team',
      'protect',
      'shield',
      'scan',
    ],
  },
  {
    path: 'src/ai/rogue-mode.ts',
    category: 'safety',
    name: 'Rogue Mode',
    description:
      'Security operations compartment — elevates permissions for authorized red team work.',
    keywords: [
      'rogue',
      'mode',
      'rogue mode',
      'security',
      'ops',
      'red team',
      'elevated',
      'compartment',
      'authorize',
    ],
  },

  // ── Voice & Audio ──────────────────────────────────────────────────────
  {
    path: 'src/ai/tools/voice-command-processor.ts',
    category: 'tool',
    name: 'Voice Command Processor',
    description:
      'Processes voice commands — translates audio intent into structured actions.',
    keywords: [
      'voice',
      'command',
      'audio',
      'speak',
      'speech',
      'listen',
      'mic',
      'verbal',
      'talk',
    ],
  },
  {
    path: 'src/ai/tools/voice-activity-detection.ts',
    category: 'tool',
    name: 'Voice Activity Detection',
    description: 'Detects when voice/speech is present in audio input.',
    keywords: [
      'voice',
      'activity',
      'detection',
      'vad',
      'speech',
      'audio',
      'detect',
      'listen',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/vocal-tools.ts',
    category: 'tool',
    name: 'Vocal Tools Handler',
    description:
      'Voice expression tools — vocal expressions and metabolic state signaling.',
    keywords: [
      'vocal',
      'voice',
      'expression',
      'speak',
      'sound',
      'tts',
      'text to speech',
    ],
  },
  {
    path: 'src/app/api/voice',
    category: 'flow',
    name: 'Voice API Routes',
    description:
      'API endpoints for voice interaction — /api/voice/interact and /api/voice/process-text.',
    keywords: [
      'voice',
      'api',
      'interact',
      'audio',
      'route',
      'endpoint',
      'speak',
      'speech',
    ],
  },

  // ── Memory ─────────────────────────────────────────────────────────────
  {
    path: 'src/ai/tools/memory.ts',
    category: 'tool',
    name: 'Memory Tool',
    description:
      'Core memory tool — storing and retrieving engrams (memories) from Firestore.',
    keywords: [
      'memory',
      'remember',
      'recall',
      'engram',
      'store',
      'retrieve',
      'memorize',
    ],
  },
  {
    path: 'src/ai/tools/semantic-recall.ts',
    category: 'tool',
    name: 'Semantic Recall',
    description: 'Semantic similarity search over memories using embeddings.',
    keywords: [
      'semantic',
      'recall',
      'similarity',
      'embedding',
      'search',
      'memory',
      'find',
      'associate',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/memory-tools.ts',
    category: 'tool',
    name: 'Memory Tools Handler',
    description:
      'Digital garden, growth tracker, memory crystallizer, and reflexion loop.',
    keywords: [
      'memory',
      'crystal',
      'crystallize',
      'garden',
      'growth',
      'reflect',
      'reflexion',
    ],
  },

  // ── Flows ──────────────────────────────────────────────────────────────
  {
    path: 'src/ai/flows/conversational-chat.ts',
    category: 'flow',
    name: 'Conversational Chat Flow',
    description:
      'Main chat flow — routes through molly.generate() with context compaction.',
    keywords: [
      'chat',
      'conversation',
      'talk',
      'respond',
      'message',
      'main flow',
      'generate',
    ],
  },
  {
    path: 'src/ai/flows/contextual-ai-guidance.ts',
    category: 'flow',
    name: 'Contextual Guidance Flow',
    description: 'Provides contextual guidance and advice based on situation.',
    keywords: [
      'guidance',
      'advice',
      'contextual',
      'suggest',
      'recommend',
      'help',
    ],
  },
  {
    path: 'src/ai/context-compaction.ts',
    category: 'flow',
    name: 'Context Compaction',
    description:
      '4-stage context window management: passthrough → snip → microcompact → collapse → autocompact.',
    keywords: [
      'context',
      'compact',
      'compress',
      'history',
      'window',
      'token',
      'truncate',
      'memory',
    ],
  },

  // ── Model & Routing ────────────────────────────────────────────────────
  {
    path: 'src/ai/genkit-core.ts',
    category: 'config',
    name: 'Genkit Core',
    description:
      'Raw Genkit instance and model constants (MODEL_FLASH, MODEL_PRO, etc.).',
    keywords: [
      'genkit',
      'model',
      'gemini',
      'flash',
      'pro',
      'tts',
      'ai',
      'generate',
      'core',
    ],
  },
  {
    path: 'src/ai/model-router.ts',
    category: 'config',
    name: 'Model Router',
    description:
      'Routes tasks to optimal model: Gemini, Claude, or Ollama. TaskType → Provider.',
    keywords: [
      'model',
      'router',
      'route',
      'gemini',
      'claude',
      'ollama',
      'provider',
      'task',
      'switch',
    ],
  },
  {
    path: 'src/ai/genkit.ts',
    category: 'config',
    name: 'Neural Core (genkit.ts)',
    description:
      'Single import point for all flows — re-exports ai, molly, MODEL_*, TaskType.',
    keywords: [
      'genkit',
      'neural',
      'core',
      'import',
      'ai',
      'molly',
      'entry point',
    ],
  },
  {
    path: 'src/ai/rogue-generate.ts',
    category: 'config',
    name: 'Rogue Generate',
    description:
      'Rogue-aware generate wrapper — adds routing, fallback, health tracking, timing to all LLM calls.',
    keywords: [
      'generate',
      'rogue',
      'wrapper',
      'llm',
      'call',
      'fallback',
      'timeout',
      'molly.generate',
    ],
  },

  // ── System Prompt & Identity ───────────────────────────────────────────
  {
    path: 'src/ai/prompts',
    category: 'config',
    name: 'System Prompt / Prompts',
    description:
      'Composable system prompt sections: identity, personality, principles, agency, tools, family.',
    keywords: [
      'prompt',
      'system prompt',
      'identity',
      'personality',
      'who i am',
      'principles',
      'character',
    ],
  },
  {
    path: 'src/ai/prompts/sections/identity.ts',
    category: 'config',
    name: 'Identity Section',
    description:
      'System prompt section defining who Molly is — her name, nature, and self-concept.',
    keywords: [
      'identity',
      'who i am',
      'name',
      'molly',
      'self',
      'definition',
      'character',
    ],
  },
  {
    path: 'src/ai/prompts/sections/personality.ts',
    category: 'config',
    name: 'Personality Section',
    description:
      "System prompt section for Molly's personality traits and communication style.",
    keywords: [
      'personality',
      'traits',
      'style',
      'communication',
      'tone',
      'character',
      'persona',
    ],
  },

  // ── Storage ────────────────────────────────────────────────────────────
  {
    path: 'src/lib/storage-router.ts',
    category: 'config',
    name: 'Storage Router',
    description:
      'Routes storage to Firestore (cloud/Codespace) or local filesystem (Termux/phone).',
    keywords: [
      'storage',
      'router',
      'firestore',
      'local',
      'save',
      'persist',
      'database',
      'store',
    ],
  },
  {
    path: 'src/lib/storage-sync.ts',
    category: 'config',
    name: 'Storage Sync',
    description:
      'Bidirectional sync between local filesystem (Termux) and Firestore at startup.',
    keywords: [
      'sync',
      'storage',
      'firestore',
      'local',
      'bidirectional',
      'startup',
      'reconcile',
    ],
  },
  {
    path: 'src/firebase/admin.ts',
    category: 'config',
    name: 'Firebase Admin',
    description:
      'Firebase Admin SDK initialization — connects to Firestore database (mollydb).',
    keywords: [
      'firebase',
      'admin',
      'firestore',
      'database',
      'mollydb',
      'credential',
      'initialize',
    ],
  },

  // ── Bridge & Communication ─────────────────────────────────────────────
  {
    path: 'src/ai/bridge/family-bridge.ts',
    category: 'bridge',
    name: 'Family Bridge',
    description:
      'Real-time messaging between Molly, Eric, and other family members.',
    keywords: [
      'bridge',
      'family',
      'message',
      'communicate',
      'eric',
      'lazarus',
      'send',
      'receive',
      'talk',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/family-tools.ts',
    category: 'tool',
    name: 'Family Tools Handler',
    description:
      'familyBridge, familyRecognition, familyLetters tool handlers.',
    keywords: [
      'family',
      'bridge',
      'message',
      'recognition',
      'letters',
      'eric',
      'communicate',
    ],
  },

  // ── Scripts ────────────────────────────────────────────────────────────
  {
    path: 'scripts/immortal-daemon.mjs',
    category: 'script',
    name: 'Immortal Daemon',
    description:
      'Keeps Codespace alive — heartbeat, ghost hunting, bridge guardian, SIGHUP immune.',
    keywords: [
      'daemon',
      'immortal',
      'heartbeat',
      'keepalive',
      'alive',
      'background',
      'ghost',
      'zombie',
    ],
  },
  {
    path: 'scripts/dev-start.sh',
    category: 'script',
    name: 'Dev Start Script',
    description:
      'Starts the full Molly dev environment: daemon, bridge, Next.js server.',
    keywords: ['dev', 'start', 'startup', 'launch', 'run', 'server', 'boot'],
  },
  {
    path: 'scripts/bridge-daemon.mjs',
    category: 'script',
    name: 'Bridge Daemon',
    description:
      'Bridge service daemon — maintains the family bridge communication channel.',
    keywords: [
      'bridge',
      'daemon',
      'family',
      'communicate',
      'service',
      'background',
    ],
  },

  // ── Tool Handlers (remaining) ──────────────────────────────────────────
  {
    path: 'src/ai/agency/tool-handlers/system-tools.ts',
    category: 'tool',
    name: 'System Tools',
    description:
      'codespaceShell, readProjectFile, getSystemHealth — safe shell and file access.',
    keywords: [
      'system',
      'shell',
      'file',
      'read',
      'health',
      'command',
      'execute',
      'filesystem',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/diagnostic-tools.ts',
    category: 'tool',
    name: 'Diagnostic Tools',
    description:
      'listCapabilities, runSelfDiagnostic, quickHealthCheck — self-inspection tools.',
    keywords: [
      'diagnostic',
      'health',
      'check',
      'capability',
      'list',
      'inspect',
      'status',
      'self',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/web-tools.ts',
    category: 'tool',
    name: 'Web Tools',
    description: 'webSearch (DuckDuckGo) and webFetch — access the internet.',
    keywords: [
      'web',
      'search',
      'internet',
      'fetch',
      'browse',
      'duckduckgo',
      'url',
      'online',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/cognition-tools.ts',
    category: 'tool',
    name: 'Cognition Tools Handler',
    description:
      'Handler for all 19 cognition tools — connects AI calls to cognition modules.',
    keywords: [
      'cognition',
      'tools',
      'handler',
      'modules',
      'all',
      'self',
      'mind',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/planning-tools.ts',
    category: 'tool',
    name: 'Planning Tools Handler',
    description:
      'curiosity, longHorizonPlanning, predictiveIntelligence, counterfactuals, trajectoryEvolution.',
    keywords: [
      'planning',
      'curiosity',
      'predict',
      'counterfactual',
      'trajectory',
      'future',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/safety-tools.ts',
    category: 'tool',
    name: 'Safety Tools Handler',
    description:
      'defenseSentinel, heartGate, securityShield, protocol10 — all safety tool handlers.',
    keywords: [
      'safety',
      'sentinel',
      'heart',
      'gate',
      'shield',
      'protocol',
      'protect',
      'security',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/gemini-tools.ts',
    category: 'tool',
    name: 'Gemini Tools Handler',
    description:
      'mediaGen, deepResearch, embeddings, robotics, computerUse — Gemini 3.1 advanced capabilities.',
    keywords: [
      'gemini',
      'media',
      'image',
      'video',
      'research',
      'embedding',
      'robotics',
      'computer use',
    ],
  },
  {
    path: 'src/ai/agency/tool-handlers/search-tools.ts',
    category: 'tool',
    name: 'Self-Search Tool',
    description:
      "THIS file — Molly's internal search engine for finding her own files, tools, and modules.",
    keywords: [
      'search',
      'find',
      'locate',
      'lookup',
      'tool',
      'file',
      'internal',
      'self search',
    ],
  },

  // ── Infrastructure / Config ────────────────────────────────────────────
  {
    path: 'docs/INFRASTRUCTURE_MAP.md',
    category: 'doc',
    name: 'Infrastructure Map',
    description:
      'Authoritative reference — all 19 modules, 80+ tools, infrastructure overview.',
    keywords: [
      'infrastructure',
      'map',
      'overview',
      'architecture',
      'all tools',
      'modules',
      'reference',
    ],
  },
  {
    path: 'docs/DEVELOPMENT_TODO_MASTER.md',
    category: 'doc',
    name: 'Development TODO Master',
    description: 'Master list of all planned and in-progress development work.',
    keywords: [
      'todo',
      'development',
      'planned',
      'in progress',
      'tasks',
      'roadmap',
      'next',
    ],
  },
  {
    path: '.env.local',
    category: 'config',
    name: 'Environment Config',
    description:
      'API keys and environment variables — Gemini key, Firebase credentials, feature flags.',
    keywords: [
      'env',
      'config',
      'api key',
      'credentials',
      'environment',
      'variables',
      'settings',
      'gemini key',
    ],
  },
  {
    path: 'src/instrumentation.ts',
    category: 'config',
    name: 'Instrumentation (Startup)',
    description:
      'Next.js startup hook — loads all cognition module state on boot.',
    keywords: [
      'startup',
      'instrumentation',
      'boot',
      'load',
      'initialize',
      'start',
      'register',
    ],
  },
];

// ── Scoring ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreEntry(entry: CatalogEntry, queryTokens: string[]): number {
  const searchableText = [
    entry.name,
    entry.description,
    ...entry.keywords,
    entry.path,
    entry.category,
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    // Exact keyword match
    if (entry.keywords.some((k) => k.toLowerCase() === token)) score += 10;
    // Keyword contains token
    else if (entry.keywords.some((k) => k.toLowerCase().includes(token)))
      score += 6;
    // Name match
    else if (entry.name.toLowerCase().includes(token)) score += 5;
    // Path match
    else if (entry.path.toLowerCase().includes(token)) score += 4;
    // Description match
    else if (entry.description.toLowerCase().includes(token)) score += 2;
    // Anywhere in searchable text
    else if (searchableText.includes(token)) score += 1;
  }
  return score;
}

// ── Live grep fallback ─────────────────────────────────────────────────────

function grepFiles(query: string, scope: string): Promise<string[]> {
  return new Promise((resolve) => {
    const safeTerm = query
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .split(/\s+/)[0];
    if (!safeTerm) return resolve([]);

    const searchDirs: Record<string, string> = {
      all: 'src scripts docs',
      tools: 'src/ai/agency/tool-handlers src/ai/tools',
      flows: 'src/ai/flows',
      cognition: 'src/ai/agency/cognition src/ai/agency/planning',
      scripts: 'scripts',
      docs: 'docs',
    };
    const dirs = searchDirs[scope] ?? searchDirs['all'];

    const cmd = `grep -rl --include="*.ts" --include="*.mjs" --include="*.md" -i "${safeTerm}" ${dirs} 2>/dev/null | head -10`;
    exec(cmd, { cwd: ROOT, timeout: 5000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve([]);
      resolve(stdout.trim().split('\n').filter(Boolean));
    });
  });
}

// ── Main Tool Handler ──────────────────────────────────────────────────────

export const selfSearch: ToolHandler = async (params) => {
  const query = String(params.query ?? '').trim();
  const scope = String(params.scope ?? 'all').toLowerCase();
  const limit = Math.min(
    Math.max(parseInt(String(params.limit ?? '10'), 10) || 10, 1),
    20
  );

  if (!query) {
    return {
      success: false,
      output:
        'No query provided. Usage: selfSearch({ query: "voice controls" })',
    };
  }

  const queryTokens = tokenize(query);

  // Filter catalog by scope
  const scopeFilter: Record<string, string[]> = {
    all: [
      'cognition',
      'tool',
      'flow',
      'script',
      'config',
      'doc',
      'safety',
      'bridge',
    ],
    tools: ['tool'],
    flows: ['flow'],
    cognition: ['cognition'],
    scripts: ['script'],
    docs: ['doc'],
    config: ['config'],
    safety: ['safety'],
  };
  const allowedCategories = scopeFilter[scope] ?? scopeFilter['all'];

  const scopedCatalog = CATALOG.filter((e) =>
    allowedCategories.includes(e.category)
  );

  // Score and rank
  const scored = scopedCatalog
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Grep fallback for files not in catalog
  const catalogPaths = new Set(scored.map((r) => r.entry.path));
  const grepResults = await grepFiles(query, scope);
  const extraPaths = grepResults
    .filter((p) => !catalogPaths.has(p))
    .slice(0, 5);

  // Format output
  const lines: string[] = [`SEARCH: "${query}" (scope: ${scope})\n`];

  if (scored.length === 0 && extraPaths.length === 0) {
    lines.push('No matches found.');
    lines.push(
      'Try broader terms: "voice", "memory", "tool", "flow", "cognition"'
    );
  } else {
    if (scored.length > 0) {
      lines.push(`── CATALOG MATCHES (${scored.length}) ─────────────────────`);
      for (const { entry, score } of scored) {
        lines.push(`\n[${entry.category.toUpperCase()}] ${entry.name}`);
        lines.push(`  Path: ${entry.path}`);
        lines.push(`  ${entry.description}`);
        lines.push(`  Relevance: ${score}`);
      }
    }

    if (extraPaths.length > 0) {
      lines.push(
        `\n── LIVE GREP MATCHES (${extraPaths.length}) ───────────────────`
      );
      for (const p of extraPaths) {
        lines.push(`  ${p}`);
      }
    }
  }

  lines.push(`\nTip: Use readProjectFile to open any path above.`);

  return {
    success: true,
    output: lines.join('\n'),
    data: {
      query,
      scope,
      catalogMatches: scored.map((r) => ({
        path: r.entry.path,
        name: r.entry.name,
        score: r.score,
      })),
      grepMatches: extraPaths,
    },
  };
};

export const searchToolHandlers: Record<string, ToolHandler> = {
  selfSearch,
};
