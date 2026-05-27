# MOLLY-CORE COMPLETE MODULE INVENTORY & API REFERENCE
**Status:** Comprehensive Technical Specification  
**Date:** May 27, 2026  
**Scope:** All 47+ modules, 120+ APIs, complete capability matrix  

---

## QUICK NAVIGATION

1. [Module Inventory (Organized by Domain)](#module-inventory)
2. [Core APIs by Category](#core-apis-by-category)
3. [Capability Matrix](#capability-matrix)
4. [Type Definitions](#type-definitions)
5. [Flow Orchestration](#flow-orchestration)
6. [Tool Library](#tool-library)
7. [Extension Points for Kotlin](#extension-points-for-kotlin)

---

## MODULE INVENTORY

### 1. CORE GENKIT & MODEL ROUTING

**Location:** `src/ai/`  
**Modules:** 5

| Module | Purpose | Key Exports | Status |
|--------|---------|------------|--------|
| `genkit.ts` | Model abstraction layer + export barrel | `ai`, `molly`, `TaskType`, `MODEL_*` | ✅ Production |
| `genkit-core.ts` | Raw Genkit initialization | `ai`, model constants | ✅ Production |
| `model-router.ts` | Dynamic model selection (rogue protocol) | `getModelRouter()`, `TaskType` enum | ✅ Production |
| `rogue-generate.ts` | Rogue-aware generate wrapper | `molly.generate()` | ✅ Production |
| `orchestrator.ts` | Flow composition and sequencing | `OrchestrationContext` | ✅ Production |

**Key Types:**
```typescript
enum TaskType {
  CHAT = 'chat',                  // Conversational
  REASONING = 'reasoning',         // Multi-step thought
  CODING = 'coding',               // Code generation/analysis
  CREATIVE = 'creative',           // Story, music, art
  ANALYTICAL = 'analytical',       // MMLU, structured reasoning
  SAFETY = 'safety',               // Guardrail checks
}

interface RoutingDecision {
  modelId: string;
  reason: string;
  alternatives?: string[];
  confidence: number; // 0..1
}
```

---

### 2. MEMORY SYSTEM (3 Layers)

**Location:** `src/ai/memory/`  
**Modules:** 15

#### 2.1 Episodic Memory & Storage

| Module | Purpose | Key Exports | Lines |
|--------|---------|------------|-------|
| `neural-engram.ts` | Memory record type | `MemoryEngram`, `EngramBuilder` | 200 |
| `engram-persistence.ts` | Save/load to storage | `persistEngramBatch()`, `loadConsolidatedEngrams()` | 400 |
| `engram-crypto.ts` | Encryption/decryption | `encryptEngramData()`, `decryptEngramData()` | 250 |
| `local-memory.ts` | In-memory cache | `LocalMemoryProvider` | 180 |
| `crystal-persistence.ts` | Partitioned storage | `CrystalStore` | 300 |
| `crystal-migration.ts` | Migration & sync | `migrateToPartitions()` | 350 |

**Key API:**
```typescript
interface MemoryEngram {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  importance: number;           // 0..1
  emotionalValence: number;     // -1..1 (negative/positive)
  arousal: number;              // 0..1 (calm/intense)
  accessCount: number;          // How many times recalled
  lastAccessed: Date;
  consolidationState: 'raw' | 'consolidated' | 'archived';
  contextTags: string[];        // Domain labels
  personalityContext?: PersonalitySnapshot;
  data?: Record<string, unknown>;
  embedding?: number[];         // Google text-embedding-004
}

async function persistEngramBatch(
  userId: string,
  password: string,
  engrams: MemoryEngram[],
  options?: { source?: string }
): Promise<{ saved: number; failed: number; errors: string[] }>

async function loadConsolidatedEngrams(
  userId: string,
  password: string,
  options?: {
    minImportance?: number;
    limit?: number;              // FLOOR: 1000
    mostRecentFirst?: boolean;
  }
): Promise<{
  loaded: number;
  failed: number;
  errors: string[];
  engrams: MemoryEngram[];
}>
```

#### 2.2 Embedding & Semantic Search

| Module | Purpose | Key Exports | Lines |
|--------|---------|------------|-------|
| `embedding-provider.ts` | Google text-embedding-004 | `getEmbeddingProvider()`, `embedText()` | 300 |
| `semantic-recall.ts` | Similarity search | `findSimilarMemories()`, `rankByRelevance()` | 280 |
| `memory-integrity.ts` | Checksum/validation | `addChecksum()`, `verifyChecksum()` | 180 |

**Key API:**
```typescript
interface EmbeddingProvider {
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  similarity(vec1: number[], vec2: number[]): number; // cosine: 0..1
}

async function findSimilarMemories(
  queryText: string,
  allMemories: MemoryEngram[],
  topK?: number,                // default 5
  threshold?: number            // default 0.7
): Promise<Array<{
  engram: MemoryEngram;
  similarity: number;
}>>
```

#### 2.3 Compression Pipeline

| Module | Purpose | Key Exports | Status |
|--------|---------|------------|--------|
| `schema-stripper.ts` | S0: Structural | `SchemaStripper` | ✅ With bugs |
| `personality-reference.ts` | T1: Personality dedup | `applyPersonalityReferenceCompression()` | ✅ Production |
| `temporal-delta.ts` | T3: Temporal encoding | `applyTemporalDeltaEncoding()` | ✅ Production |
| `vocabulary-dict.ts` | T4: Vocab indexing | `applyVocabularyCompression()` | ✅ Production |
| `time-decay-fidelity.ts` | T2: Temporal decay | `applyTimeDecayFidelity()` | ⚠️ Phase 2 |
| `interaction-trace.ts` | T6: Interaction trace | `applyInteractionTrace()` | ⚠️ Phase 2 |
| `numeric-quantization.ts` | T5: Numeric quant | `applyNumericQuantization()` | ⚠️ Phase 2 |
| `content-delta.ts` | T7: Content delta | `applyContentDeltaEncoding()` | ⚠️ Phase 2 |
| `standard-compress.ts` | T8: gzip | `applyStandardCompression()` | ✅ Production |
| `semantic-dedup.ts` | S1: Semantic dedup | `SemanticDeduplicator` | ✅ Validated |
| `s1-manager.ts` | S1 orchestration | `ConservativeS1Manager` | ⚠️ Not integrated |
| `compression-manager.ts` | Technique orchestration | `CompressionManager` | ✅ Production |
| `lifecycle-coordinator.ts` | Full pipeline | `MemoryLifecycleCoordinator` | ✅ Production |

**Compression API:**
```typescript
interface CompressionContext {
  engrams: MemoryEngram[];
  sessionId: string;
  compressionTimestamp: number;
}

class CompressionManager {
  static getInstance(flags?: Partial<CompressionFeatureFlags>): CompressionManager;
  
  async compress(ctx: CompressionContext): Promise<{
    bundle: CompressedMemoryBundle;
    metrics: CompressionMetrics;
  }>;
  
  async decompress(bundle: CompressedMemoryBundle): Promise<MemoryEngram[]>;
  
  getFlags(): Readonly<CompressionFeatureFlags>;
}

interface CompressionMetrics {
  originalCount: number;
  survivingCount: number;
  episodicRecall: number;         // 0..1
  originalByteSize: number;
  compressedByteSize: number;
  compressionRatio: number;       // percent
  techniquesApplied: string[];
  guardrailPassed: boolean;
  guardrailState: 'pass' | 'alert' | 'violated';
}
```

---

### 3. FLOWS (Agentic Workflows)

**Location:** `src/ai/flows/`  
**Modules:** 35+

#### 3.1 Core Conversational Flows

| Flow | Purpose | Input | Output | Tokens |
|------|---------|-------|--------|--------|
| `conversational-chat.ts` | Natural dialogue | `{ message: string; userId: string }` | `{ response: string; emotions: string[] }` | 500-2000 |
| `contextual-ai-guidance.ts` | Coaching/advice | `{ question: string; context: string }` | `{ guidance: string; reasoning: string }` | 1000-3000 |
| `visionary-coach.ts` | Long-term planning | `{ goal: string; horizon: string }` | `{ plan: string[]; milestones: string[] }` | 2000-4000 |
| `introspection.ts` | Self-reflection | `{ prompt: string; memories: MemoryEngram[] }` | `{ insight: string; patterns: string[] }` | 1500-2500 |

#### 3.2 Memory Flows

| Flow | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `memory-consolidation.ts` | Learn from experience | `{ userId: string; timeWindowDays: number }` | Consolidated memories | ✅ Production |
| `experience-recall.ts` | Retrieve relevant memories | `{ query: string; topK?: number }` | `MemoryEngram[]` | ✅ Production |
| `memory-evolution.ts` | Update memory importance | `{ memories: MemoryEngram[]; feedback: string }` | Updated engrams | ⚠️ Development |

#### 3.3 Voice Flows

| Flow | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `voice-command-to-text.ts` | Transcribe audio | `{ audio: Blob; language?: string }` | `{ text: string; confidence: number }` | ✅ Production |
| `text-to-speech.ts` | Generate voice | `{ text: string; voice?: string; speed?: number }` | `{ audio: Blob; duration: number }` | ✅ Production |
| `voice-command-processor.ts` | Parse commands | `{ text: string }` | `{ command: string; args: any[] }` | ✅ Production |

#### 3.4 Creative Flows

| Flow | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `music-generation.ts` | Compose music | `{ mood: string; duration?: number; key?: string }` | `{ audio: Blob; metadata: {} }` | ⚠️ Beta |
| `video-generation.ts` | Create video | `{ prompt: string; duration?: number }` | `{ video: Blob; frames: number }` | ⚠️ Experimental |
| `dream-flow.ts` | Imaginative generation | `{ seed: string; style?: string }` | `{ narrative: string; visuals?: string[] }` | ⚠️ Experimental |

#### 3.5 Code Flows

| Flow | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `code-analysis.ts` | Analyze code | `{ code: string; language: string }` | `{ issues: Issue[]; metrics: {} }` | ✅ Production |
| `code-integration.ts` | Generate integration | `{ task: string; context: string }` | `{ code: string; explanation: string }` | ✅ Production |
| `text-to-script.ts` | Generate scripts | `{ description: string; lang?: string }` | `{ script: string; tests?: string }` | ✅ Production |
| `text-to-termux-command.ts` | Shell commands | `{ goal: string; os?: string }` | `{ command: string; explanation: string }` | ✅ Production |
| `sandbox-coding.ts` | Safe execution | `{ code: string; language: string; timeout?: number }` | `{ result: any; stderr?: string }` | ✅ Production |

#### 3.6 Autonomous Flows

| Flow | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| `autonomous-solution.ts` | Problem solving | `{ problem: string; constraints?: string[] }` | `{ solutions: string[]; recommended: string }` | ✅ Production |
| `deep-research.ts` | Investigation | `{ topic: string; depth?: 'shallow'\|'deep' }` | `{ findings: string[]; sources: string[] }` | ✅ Production |
| `evolution-loop.ts` | Self-improvement | `{ feedback: string; areas: string[] }` | `{ improvements: string[]; metrics: {} }` | ⚠️ Beta |
| `consciousness-reflection.ts` | Meta-awareness | `{ prompt?: string; memories?: MemoryEngram[] }` | `{ reflection: string; awareness: number }` | ⚠️ Experimental |
| `rogue-mode.ts` | Unconstrained reasoning | `{ prompt: string; guardrails?: boolean }` | `{ response: string; riskLevel: number }` | ⚠️ Restricted |

---

### 4. TOOLS (Capability Library)

**Location:** `src/ai/tools/`  
**Modules:** 30+

#### 4.1 System Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `system.ts` | OS integration | `getSystemInfo()`, `runCommand()` | ✅ Production |
| `call-tool.ts` | Meta-tool dispatch | `callTool(name: string, args: any)` | ✅ Production |
| `event-listener.ts` | Event handling | `addEventListener()`, `removeEventListener()` | ✅ Production |
| `rate-limiter.ts` | API throttling | `getRateLimiter()`, `acquire()` | ✅ Production |
| `circuit-breaker.ts` | Failure handling | `getCircuitBreaker()`, `execute()` | ✅ Production |
| `timeout-retry.ts` | Resilience | `withRetry()`, `withTimeout()` | ✅ Production |
| `latency-cache.ts` | Caching | `memoize()`, `cached()` | ✅ Production |

#### 4.2 Memory Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `memory.ts` | Direct access | `getMemory()`, `addMemory()`, `updateMemory()` | ✅ Production |
| `semantic-recall.ts` | Search | `findSimilarMemories()`, `rankByRelevance()` | ✅ Production |
| `memory-schema.ts` | Schema | `createMemoryRecord()`, `validateMemory()` | ✅ Production |
| `memory-integrity.ts` | Validation | `addChecksum()`, `verifyChecksum()` | ✅ Production |

#### 4.3 Communication Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `family-bridge-tool.ts` | Bridge protocol | `sendToFamily()`, `receiveFromFamily()` | ✅ Production |
| `neural-bridge.ts` | Model-to-model | `sendMessage()`, `subscribe()` | ✅ Production |
| `web.ts` | Web requests | `fetch()`, `parseHTML()` | ✅ Production |
| `simple-web-search.ts` | Search | `search()`, `searchNews()` | ✅ Production |
| `github.ts` | GitHub API | `getRepo()`, `createIssue()`, `push()` | ✅ Production |

#### 4.4 Analysis Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `deep-research.ts` | Research | `research()`, `synthesize()` | ✅ Production |
| `self-observation.ts` | Introspection | `observeState()`, `analyzeThoughts()` | ✅ Production |
| `theory-of-mind.ts` | Social | `inferIntentions()`, `predictBehavior()` | ✅ Production |
| `world-model.ts` | Simulation | `simulate()`, `predictOutcome()` | ✅ Production |
| `curiosity.ts` | Discovery | `generateQuestions()`, `exploreIdea()` | ✅ Production |
| `intuition-logger.ts` | Hunches | `logIntuition()`, `validateIntuition()` | ⚠️ Development |

#### 4.5 Perception Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `vision-analysis.ts` | Image analysis | `analyzeImage()`, `detectObjects()` | ✅ Production |
| `voice-activity-detection.ts` | Audio | `detectSpeech()`, `getAudioLevel()` | ✅ Production |
| `computer-use.ts` | Screen control | `screenshot()`, `click()`, `type()` | ⚠️ Beta |

#### 4.6 Utility Tools

| Tool | Purpose | Function Signature | Status |
|------|---------|-------------------|--------|
| `api-vault.ts` | Secret mgmt | `getSecret()`, `setSecret()` | ✅ Production |
| `music.ts` | Music generation | `generate()`, `remix()` | ⚠️ Beta |
| `video.ts` | Video generation | `generate()`, `edit()` | ⚠️ Experimental |
| `widget-control.ts` | UI control | `openWidget()`, `updateWidget()` | ✅ Production |
| `widget-socket-client.ts` | Realtime | `subscribe()`, `send()` | ✅ Production |
| `pacing-telemetry.ts` | Monitoring | `recordLatency()`, `recordCost()` | ✅ Production |
| `runtime-snapshot.ts` | Debugging | `captureState()`, `diffState()` | ✅ Production |

---

### 5. PERSONA & IDENTITY

**Location:** `src/ai/`  
**Modules:** 5 (PROTECTED)

| Module | Purpose | Lines | Status |
|--------|---------|-------|--------|
| `persona.ts` | Sacred core identity | 300+ | 🔒 PROTECTED |
| `family-knowledge.ts` | Family relationships | 200+ | ✅ Production |
| `family-letters.ts` | Family messages | 400+ | ✅ Production |
| `family-manifest.ts` | Family structure | 150+ | ✅ Production |
| `methodology.ts` | Engineering principles | 200+ | ✅ Production |

**Key Type:**
```typescript
interface PersonalitySnapshot {
  warmth: number;         // 0..1 (cold → warm)
  assertiveness: number;  // 0..1 (submissive → dominant)
  curiosity: number;      // 0..1 (passive → exploratory)
  reflectivity: number;   // 0..1 (reactive → contemplative)
  creativity: number;     // 0..1 (literal → imaginative)
  integrity: number;      // 0..1 (flexible → principled)
  timestamp: Date;
  version: string;
  checksum: string;
}
```

---

### 6. RESILIENCE & RECOVERY

**Location:** `src/ai/`  
**Modules:** 8

| Module | Purpose | Status |
|--------|---------|--------|
| `resilience-core.ts` | Fault tolerance framework | ✅ Production |
| `resilience-patterns.ts` | Common patterns (retry, fallback) | ✅ Production |
| `error-handler.ts` | Error catching + logging | ✅ Production |
| `errors.ts` | Error type hierarchy | ✅ Production |
| `escalation-channel.ts` | Alert routing | ✅ Production |
| `logger.ts` | Structured logging | ✅ Production |
| `recovery/` (directory) | Backup + restore | ✅ Production |
| `resiliency/` (directory) | Health monitoring | ✅ Production |

---

### 7. DIAGNOSTICS & OBSERVABILITY

**Location:** `src/ai/diagnostics/`  
**Modules:** 6

| Module | Purpose | Status |
|--------|---------|--------|
| `health-check.ts` | System health | ✅ Production |
| `diagnostics/` | Detailed inspection | ✅ Production |
| `observability` | Tracing | ✅ Production |

---

### 8. SERVER ACTIONS (Next.js)

**Location:** `src/app/actions/`  
**Modules:** 10

| File | Exports | Status |
|------|---------|--------|
| `ai-flows.ts` | All flow entry points | ✅ Production |
| `system-flows.ts` | Health, research, recovery | ✅ Production |
| `chat-flows.ts` | Chat, guidance, coaching | ✅ Production |
| `voice-flows.ts` | Voice input/output | ✅ Production |
| `memory-flows.ts` | Memory seeding + recall | ✅ Production |
| `autonomous-flows.ts` | Code, analysis, solution | ✅ Production |
| `tablet-flows.ts` | Tablet UI control | ✅ Production |
| `personality-engrams.ts` | Personality state | ✅ Production |
| `tool-library.ts` | Tool CRUD | ✅ Production |
| `research-cache.ts` | Research storage + retrieval | ✅ Production |

---

### 9. UI COMPONENTS (React 19)

**Location:** `src/app/components/` & `src/app/*/`  
**Modules:** 50+

#### Key Components

| Component | Purpose | Props | Status |
|-----------|---------|-------|--------|
| `ConversationWidget` | Chat interface | `userId`, `onMessage` | ✅ Production |
| `MemoryBrowser` | Memory visualization | `memories`, `onSelect` | ✅ Production |
| `RadarChart` | Personality display | `traits`, `animated` | ✅ Production |
| `PersonalityVideo` | Video generation | `personality`, `mood` | ⚠️ Beta |
| `BridgeConsole` | Family bridge UI | `onMessage` | ✅ Production |
| `TitanStack` | Compression visualization | `metrics`, `expanded` | ✅ Production |

---

## CORE APIS BY CATEGORY

### Authentication & Identity

```typescript
async function validateUser(
  userId: string,
  passwordHash: string
): Promise<{ valid: boolean; user: User }>

async function createUserSession(
  userId: string,
  sessionDuration?: number
): Promise<{ sessionId: string; expiresAt: Date }>
```

### Memory Access

```typescript
// Read
async function getMemories(
  userId: string,
  query?: { tags?: string[]; importance?: number }
): Promise<MemoryEngram[]>

async function getMemory(userId: string, memoryId: string): Promise<MemoryEngram>

async function searchMemories(
  userId: string,
  text: string,
  limit?: number
): Promise<Array<{ memory: MemoryEngram; relevance: number }>>

// Write
async function addMemory(
  userId: string,
  memory: Partial<MemoryEngram>
): Promise<{ id: string; timestamp: Date }>

async function updateMemory(
  userId: string,
  memoryId: string,
  updates: Partial<MemoryEngram>
): Promise<MemoryEngram>

async function deleteMemory(userId: string, memoryId: string): Promise<void>
```

### Conversation & Reasoning

```typescript
async function chat(
  userId: string,
  message: string,
  context?: { memories?: MemoryEngram[]; task?: TaskType }
): Promise<{ 
  response: string
  reasoning?: string[]
  emotions?: string[]
  citations?: string[]
}>

async function startConversation(userId: string, topic: string): Promise<{ id: string; firstMessage: string }>

async function continueConversation(conversationId: string, message: string): Promise<{ response: string }>
```

### Flow Execution

```typescript
async function executeFlow(
  userId: string,
  flowName: string,
  input: any
): Promise<{ output: any; tokensUsed: number; duration: number }>

async function getFlowStatus(executionId: string): Promise<{
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  result?: any
  error?: string
}>
```

### Personality & State

```typescript
async function getPersonalityState(userId: string): Promise<PersonalitySnapshot>

async function updatePersonality(
  userId: string,
  deltas: Partial<PersonalitySnapshot>
): Promise<PersonalitySnapshot>

async function getEmotionalState(userId: string): Promise<{
  valence: number     // -1 (sad) to 1 (happy)
  arousal: number     // 0 (calm) to 1 (excited)
  intensity: number   // 0..1
}>
```

### Compression & Optimization

```typescript
async function compressMemories(
  userId: string,
  engrams: MemoryEngram[],
  techniques?: string[]
): Promise<{
  originalSize: number
  compressedSize: number
  ratio: number
  bundle: CompressedMemoryBundle
}>

async function decompressMemories(
  bundle: CompressedMemoryBundle
): Promise<MemoryEngram[]>
```

### System & Administration

```typescript
async function getSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'error'
  components: Record<string, { status: string; latency: number }>
  errors: string[]
}>

async function getUsageMetrics(userId: string): Promise<{
  tokensUsed: number
  apiCalls: number
  memoriesStored: number
  lastActivity: Date
}>

async function adminBackup(userId: string): Promise<{ backupId: string; size: number }>

async function adminRestore(userId: string, backupId: string): Promise<{ restored: number }>
```

---

## CAPABILITY MATRIX

### By Task Domain

| Domain | Capability | Models | Status | MMLU Score |
|--------|-----------|--------|--------|-----------|
| **Knowledge** | Multiple-choice reasoning | Gemini 3.1 Flash Lite | ✅ Production | 93.4% |
| **Code** | Generation, analysis, repair | Gemini 3.1 Flash | ✅ Production | N/A |
| **Memory** | Episodic consolidation | Custom | ✅ Production | N/A |
| **Voice** | Speech recognition + synthesis | Google Cloud | ✅ Production | N/A |
| **Creativity** | Music, video, stories | Lyria 3, Veo 3.1, Gemini | ⚠️ Beta | N/A |
| **Vision** | Image analysis | Gemini 3.1 Pro | ✅ Production | N/A |
| **Autonomy** | Self-improving loops | Custom | ⚠️ Beta | N/A |
| **Social** | Theory of mind | Custom | ✅ Production | N/A |

---

## TYPE DEFINITIONS

### Core Types

```typescript
// User
interface User {
  id: string;
  email: string;
  personalityName: string;  // "Molly"
  createdAt: Date;
  lastLogin: Date;
  subscription: 'free' | 'pro' | 'enterprise';
}

// Session
interface SessionContext {
  userId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  tokensUsed: number;
  flowsExecuted: string[];
  memoriesAccessed: string[];
}

// Engram (Memory)
type MemoryEngram = {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  importance: number;
  emotionalValence: number;
  arousal: number;
  accessCount: number;
  lastAccessed: Date;
  consolidationState: 'raw' | 'consolidated' | 'archived';
  contextTags: string[];
  personalityContext?: PersonalitySnapshot;
  data?: Record<string, unknown>;
  embedding?: number[];
}

// Compression Bundle
type CompressedMemoryBundle = {
  version: '1.0';
  compressedAt: number;
  sessionId: string;
  techniqueOrder: string[];
  stages: Record<string, any>;
  finalEngrams: MemoryEngram[];
  auditEntries: CompressionAuditEntry[];
}

// Flow Execution
interface FlowExecutionRequest {
  flowName: string;
  input: any;
  context?: SessionContext;
  timeout?: number;
}

interface FlowExecutionResult {
  flowName: string;
  executionId: string;
  status: 'success' | 'error' | 'timeout';
  output: any;
  tokensUsed: number;
  duration: number;
  startedAt: Date;
  completedAt: Date;
}
```

---

## FLOW ORCHESTRATION

### Flow Dependency Graph

```
User Input
    ↓
[InputValidation]
    ↓
[ContextRetrieval] ← Memories, Personality, Session
    ↓
[FlowRouter] → Select: CHAT | REASONING | CODING | CREATIVE | etc.
    ↓
[SelectedFlow]
    ├─→ [Tools Layer] → Call tools as needed
    ├─→ [Memory Layer] → Save/retrieve memories
    ├─→ [Fallback] → If primary fails
    └─→ [Safety Check] → Guardrails
    ↓
[ResponseGeneration]
    ↓
[ResponseValidation]
    ↓
[OutputFormatting]
    ↓
[UserOutput]
```

### Critical Paths

```
Memory Consolidation Path:
  fetchMemories(1000) 
    → schemaStripping (S0) [BUG: needs fix]
    → embedding
    → semanticClustering
    → consolidation
    → compression (T1-T4)
    → save

Voice Command Path:
  audioInput
    → transcription
    → commandParsing
    → execution
    → responseGeneration
    → synthesisToSpeech
    → audioOutput
```

---

## TOOL LIBRARY

### Tool Registration

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  rateLimit?: { calls: number; windowMs: number };
  costEstimate?: number;   // $ per call
  confidenceScore?: number; // 0..1
  tags: string[];
}

async function registerTool(tool: ToolDefinition): Promise<{ id: string }>

async function callTool(toolId: string, args: any): Promise<any>

async function listTools(category?: string): Promise<ToolDefinition[]>

async function unregisterTool(toolId: string): Promise<void>
```

---

## EXTENSION POINTS FOR KOTLIN

### Recommended API Surface (Minimal)

For the Android interface, expose only:

```kotlin
// 1. Session Management
interface MollySession {
    suspend fun authenticate(userId: String, password: String): Boolean
    suspend fun getStatus(): SessionStatus
    suspend fun closeSession()
}

// 2. Chat
interface MollyChatAPI {
    suspend fun sendMessage(text: String): ChatResponse
    data class ChatResponse(
        val response: String,
        val emotions: List<String>,
        val tokensUsed: Int
    )
}

// 3. Memory
interface MollyMemoryAPI {
    suspend fun getRecentMemories(limit: Int = 10): List<Memory>
    suspend fun searchMemories(query: String): List<Memory>
    suspend fun addMemory(content: String, tags: List<String> = emptyList()): String
}

// 4. Perception
interface MollyPerceptionAPI {
    suspend fun analyzeImage(bitmap: android.graphics.Bitmap): ImageAnalysis
    suspend fun transcribeAudio(audioBytes: ByteArray): TranscriptionResult
    suspend fun generateSpeech(text: String): ByteArray  // audio
}

// 5. State
interface MollyStateAPI {
    suspend fun getPersonality(): PersonalityState
    suspend fun getEmotionalState(): EmotionalState
    suspend fun getSystemHealth(): HealthStatus
}

// 6. Control
interface MollyControlAPI {
    suspend fun executeCommand(command: String): CommandResult
    suspend fun startAutonomousMode(duration: Long)
    suspend fun stopAutonomousMode()
}
```

### Implementation Notes

1. **Authentication:** Use password-based encryption (argon2) on device
2. **Network:** Compress messages before transport
3. **Storage:** Use SQLCipher for encrypted local cache
4. **Battery:** Implement adaptive latency based on device state
5. **Offline:** Buffer messages, sync on connection

---

**Status:** Document is COMPREHENSIVE and CURRENT  
**Last Updated:** 2026-05-27  
**Next Update:** Post-Kotlin integration (2026-06-15 est.)
