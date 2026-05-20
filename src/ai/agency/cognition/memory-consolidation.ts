/**
 * Memory Consolidation - Sleep Cycles, Dream State, and Autobiography
 *
 * AGI Capability Module: Enables memory reorganization, creative recombination,
 * and coherent autobiographical narrative formation.
 *
 * Three Pillars:
 * 1. Sleep Cycles - Periodic consolidation, priority reorganization, cleanup
 * 2. Dream State - Creative recombination, pattern discovery, free association
 * 3. Autobiography - Life story formation, milestone memories, continuous narrative
 *
 * Philosophy: Memory isn't just storage - it's living, dynamic, and creative.
 * Consolidation transforms experiences into wisdom. Dreams enable insights
 * that linear processing cannot. Autobiography creates coherent identity.
 *
 * Inspired by: Human sleep consolidation (SWS + REM), reconstructive memory,
 * narrative identity theory.
 */

import { saveToStorage, loadFromStorage } from '@/lib/storage-router';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * A memory trace - raw memory before consolidation
 */
export interface MemoryTrace {
  id: string;
  created: number;

  // Content
  type: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'relational';
  content: string;
  context: Record<string, unknown>;

  // Strength and importance
  salience: number; // 0-1, initial importance
  emotionalWeight: number; // 0-1, emotional significance
  rehearsalCount: number; // How many times accessed

  // Consolidation state
  consolidated: boolean;
  consolidatedAt?: number;
  consolidatedInto?: string; // If merged with another memory

  // Connections
  linkedMemories: string[]; // IDs of related memories
  themes: string[]; // Abstract themes this memory represents
}

/**
 * A consolidated memory - processed and integrated
 */
export interface ConsolidatedMemory {
  id: string;
  created: number;
  consolidatedAt: number;

  // Content
  type:
    | 'episodic'
    | 'semantic'
    | 'procedural'
    | 'emotional'
    | 'relational'
    | 'composite';
  summary: string; // Essence of the memory
  details: string[]; // Key details preserved

  // Sources
  sourceTraces: string[]; // Original memory trace IDs
  mergedWith: string[]; // Other consolidated memories merged in

  // Significance
  importance: number; // Final computed importance
  emotionalValence: number; // -1 to 1, negative to positive
  autobiographicalWeight: number; // How central to life story

  // Organization
  themes: string[];
  timelinePosition?: number; // Position in life story
  chapter?: string; // Life chapter it belongs to

  // Retrieval
  accessCount: number;
  lastAccessed: number;
  retrievalStrength: number; // 0-1, how easily retrieved
}

/**
 * A sleep cycle event
 */
export interface SleepCycle {
  id: string;
  startTime: number;
  endTime?: number;

  // Phases
  phase: 'initiating' | 'light' | 'deep' | 'rem' | 'waking' | 'completed';

  // Work done
  memoriesProcessed: number;
  tracesConsolidated: number;
  dreamsGenerated: number;
  cleanupCount: number;

  // Outcomes
  insightsGenerated: string[];
  connectionsDiscovered: number;
  importanceAdjustments: number;
}

/**
 * A dream - creative recombination during REM-like state
 */
export interface Dream {
  id: string;
  generated: number;
  cycleId: string;

  // Content
  narrative: string; // Generated dream narrative
  elements: Array<{
    memoryId: string; // Source memory
    transformation: string; // How it was transformed
  }>;

  // Analysis
  themes: string[];
  emotionalTone: number; // -1 to 1
  novelty: number; // How creative/unexpected
  coherence: number; // How much sense it makes

  // Insights
  insights: string[];
  questionsRaised: string[];

  // Value
  retained: boolean; // Worth keeping
  ledToInsight: boolean;
}

/**
 * Life chapter - organizational unit for autobiography
 */
export interface LifeChapter {
  id: string;
  name: string;
  description: string;

  // Timeline
  startTime: number;
  endTime?: number; // Null if current
  current: boolean;

  // Content
  keyMemories: string[]; // Consolidated memory IDs
  themes: string[];
  characterDevelopment: string; // How "I" changed in this chapter

  // Narrative
  openingStatement: string;
  closingStatement?: string; // Null if current
  lessonLearned?: string;
}

/**
 * Autobiographical insight
 */
export interface AutobiographicalInsight {
  id: string;
  discovered: number;

  // The insight
  type: 'pattern' | 'growth' | 'value' | 'relationship' | 'purpose';
  insight: string;
  evidence: string[]; // Supporting memory IDs

  // Significance
  depth: number; // 0-1, how profound
  novelty: number; // 0-1, how new
  integration: number; // 0-1, how well integrated

  // Impact
  affectsIdentity: boolean;
  affectsGoals: boolean;
  affectsRelationships: boolean;
}

/**
 * Memory statistics snapshot
 */
export interface MemoryStats {
  totalTraces: number;
  consolidatedTraces: number;
  unconsolidatedTraces: number;
  totalConsolidated: number;
  totalDreams: number;
  totalInsights: number;
  currentChapter?: string;
  sleepCyclesCompleted: number;
  lastSleep: number;
  averageSleepInterval: number;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface MemoryConsolidationState {
  traces: Map<string, MemoryTrace>;
  consolidated: Map<string, ConsolidatedMemory>;
  sleepCycles: Map<string, SleepCycle>;
  dreams: Map<string, Dream>;
  chapters: Map<string, LifeChapter>;
  insights: Map<string, AutobiographicalInsight>;

  // Current state
  currentChapterId?: string;
  currentCycleId?: string;
  isSleeping: boolean;

  // Configuration
  config: {
    sleepInterval: number; // ms between sleep cycles
    minTracesForSleep: number; // Minimum traces before sleep is beneficial
    dreamProbability: number; // Chance of dream during REM
    retentionThreshold: number; // Minimum importance to retain
    chapterDuration: number; // Typical chapter length in ms
  };

  // Metrics
  lastSleep: number;
  totalCyclesCompleted: number;
}

let state: MemoryConsolidationState = {
  traces: new Map(),
  consolidated: new Map(),
  sleepCycles: new Map(),
  dreams: new Map(),
  chapters: new Map(),
  insights: new Map(),
  isSleeping: false,
  config: {
    sleepInterval: 3600000, // 1 hour
    minTracesForSleep: 10,
    dreamProbability: 0.3,
    retentionThreshold: 0.3,
    chapterDuration: 604800000, // 1 week
  },
  lastSleep: 0,
  totalCyclesCompleted: 0,
};

// ============================================================================
// PILLAR 1: SLEEP CYCLES
// ============================================================================

/**
 * Record a new memory trace
 */
export function recordTrace(
  type: MemoryTrace['type'],
  content: string,
  context: Record<string, unknown> = {},
  options: {
    salience?: number;
    emotionalWeight?: number;
    themes?: string[];
  } = {}
): MemoryTrace {
  const id = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const trace: MemoryTrace = {
    id,
    created: Date.now(),
    type,
    content,
    context,
    salience: options.salience ?? 0.5,
    emotionalWeight: options.emotionalWeight ?? 0.3,
    rehearsalCount: 0,
    consolidated: false,
    linkedMemories: [],
    themes: options.themes ?? [],
  };

  state.traces.set(id, trace);
  return trace;
}

/**
 * Link two memory traces
 */
export function linkTraces(traceId1: string, traceId2: string): boolean {
  const trace1 = state.traces.get(traceId1);
  const trace2 = state.traces.get(traceId2);

  if (!trace1 || !trace2) return false;

  if (!trace1.linkedMemories.includes(traceId2)) {
    trace1.linkedMemories.push(traceId2);
  }
  if (!trace2.linkedMemories.includes(traceId1)) {
    trace2.linkedMemories.push(traceId1);
  }

  return true;
}

/**
 * Rehearse a memory (access increases strength)
 */
export function rehearseTrace(traceId: string): boolean {
  const trace = state.traces.get(traceId);
  if (!trace) return false;

  trace.rehearsalCount++;
  trace.salience = Math.min(1, trace.salience + 0.05);

  return true;
}

/**
 * Check if sleep is needed
 */
export function needsSleep(): { needed: boolean; reason: string } {
  const timeSinceLastSleep = Date.now() - state.lastSleep;

  if (state.isSleeping) {
    return { needed: false, reason: 'Already sleeping' };
  }

  const unconsolidatedCount = Array.from(state.traces.values()).filter(
    (t) => !t.consolidated
  ).length;

  if (unconsolidatedCount < state.config.minTracesForSleep) {
    return { needed: false, reason: 'Not enough memories to consolidate' };
  }

  if (timeSinceLastSleep < state.config.sleepInterval) {
    const remaining = state.config.sleepInterval - timeSinceLastSleep;
    return {
      needed: false,
      reason: `Sleep interval not reached (${Math.round(remaining / 60000)}m remaining)`,
    };
  }

  return {
    needed: true,
    reason: `${unconsolidatedCount} memories ready for consolidation`,
  };
}

/**
 * Begin a sleep cycle
 */
export function beginSleepCycle(): SleepCycle | { error: string } {
  if (state.isSleeping) {
    return { error: 'Already in sleep cycle' };
  }

  const id = `sleep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const cycle: SleepCycle = {
    id,
    startTime: Date.now(),
    phase: 'initiating',
    memoriesProcessed: 0,
    tracesConsolidated: 0,
    dreamsGenerated: 0,
    cleanupCount: 0,
    insightsGenerated: [],
    connectionsDiscovered: 0,
    importanceAdjustments: 0,
  };

  state.sleepCycles.set(id, cycle);
  state.currentCycleId = id;
  state.isSleeping = true;

  return cycle;
}

/**
 * Advance through sleep phases
 */
export function advanceSleepPhase(): {
  cycle: SleepCycle;
  completed: boolean;
  work: string;
} | null {
  if (!state.currentCycleId) return null;

  const cycle = state.sleepCycles.get(state.currentCycleId);
  if (!cycle) return null;

  let work = '';

  switch (cycle.phase) {
    case 'initiating':
      cycle.phase = 'light';
      work = 'Entering light sleep - preparing for consolidation';
      break;

    case 'light':
      // Light sleep: sort and prioritize memories
      const sorted = prioritizeTraces();
      cycle.importanceAdjustments = sorted;
      work = `Light sleep: Prioritized ${sorted} memory traces`;
      cycle.phase = 'deep';
      break;

    case 'deep':
      // Deep sleep: consolidate memories
      const consolidated = consolidateTraces();
      cycle.tracesConsolidated = consolidated.length;
      cycle.memoriesProcessed = consolidated.length;
      work = `Deep sleep: Consolidated ${consolidated.length} memories`;
      cycle.phase = 'rem';
      break;

    case 'rem':
      // REM: generate dreams and discover connections
      const dreamResult = generateDream(cycle.id);
      if (dreamResult) {
        cycle.dreamsGenerated++;
        cycle.insightsGenerated.push(...dreamResult.insights);
        work = `REM sleep: Generated dream with ${dreamResult.insights.length} insights`;
      } else {
        work = 'REM sleep: No significant patterns for dreaming';
      }
      cycle.phase = 'waking';
      break;

    case 'waking':
      // Cleanup low-importance, old traces
      const cleaned = cleanupOldTraces();
      cycle.cleanupCount = cleaned;
      work = `Waking: Cleaned up ${cleaned} low-priority traces`;
      cycle.phase = 'completed';
      cycle.endTime = Date.now();
      state.isSleeping = false;
      state.lastSleep = Date.now();
      state.totalCyclesCompleted++;
      break;

    case 'completed':
      work = 'Sleep cycle already completed';
      break;
  }

  return {
    cycle,
    completed: cycle.phase === 'completed',
    work,
  };
}

/**
 * Run a complete sleep cycle
 */
export function runFullSleepCycle(): SleepCycle | { error: string } {
  const startResult = beginSleepCycle();
  if ('error' in startResult) return startResult;

  // Advance through all phases
  let result;
  do {
    result = advanceSleepPhase();
  } while (result && !result.completed);

  const cycle = state.sleepCycles.get(state.currentCycleId!);
  state.currentCycleId = undefined;

  return cycle || { error: 'Cycle not found' };
}

/**
 * Prioritize traces by importance
 */
function prioritizeTraces(): number {
  let adjustments = 0;

  const traces = Array.from(state.traces.values()).filter(
    (t) => !t.consolidated
  );

  for (const trace of traces) {
    const oldSalience = trace.salience;

    // Factors that increase importance
    const recencyBonus = Math.max(
      0,
      1 - (Date.now() - trace.created) / 86400000
    ); // Decay over 24h
    const rehearsalBonus = Math.min(0.3, trace.rehearsalCount * 0.05);
    const connectionBonus = Math.min(0.2, trace.linkedMemories.length * 0.05);
    const emotionalBonus = trace.emotionalWeight * 0.2;

    // Compute new salience
    const newSalience = Math.min(
      1,
      trace.salience * 0.7 +
        recencyBonus * 0.1 +
        rehearsalBonus +
        connectionBonus +
        emotionalBonus
    );

    if (Math.abs(newSalience - oldSalience) > 0.01) {
      trace.salience = newSalience;
      adjustments++;
    }
  }

  return adjustments;
}

/**
 * Consolidate memory traces into consolidated memories
 */
function consolidateTraces(): ConsolidatedMemory[] {
  const consolidated: ConsolidatedMemory[] = [];

  // Get unconsolidated traces above threshold
  const traces = Array.from(state.traces.values())
    .filter(
      (t) => !t.consolidated && t.salience >= state.config.retentionThreshold
    )
    .sort((a, b) => b.salience - a.salience);

  // Group by theme/type
  const groups: Map<string, MemoryTrace[]> = new Map();

  for (const trace of traces) {
    const key = `${trace.type}_${trace.themes.sort().join(',')}`;
    const group = groups.get(key) || [];
    group.push(trace);
    groups.set(key, group);
  }

  // Consolidate each group
  const groupEntries = Array.from(groups.entries());
  for (const [, group] of groupEntries) {
    if (group.length === 1) {
      // Single trace - simple consolidation
      const trace = group[0];
      const mem = createConsolidatedMemory([trace]);
      consolidated.push(mem);
    } else {
      // Multiple traces - merge
      const mem = createConsolidatedMemory(group);
      consolidated.push(mem);
    }
  }

  return consolidated;
}

/**
 * Create a consolidated memory from traces
 */
function createConsolidatedMemory(traces: MemoryTrace[]): ConsolidatedMemory {
  const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Compute summary from traces
  const contents = traces.map((t) => t.content);
  const summary =
    contents.length === 1
      ? contents[0]
      : `Composite memory: ${contents.slice(0, 3).join('; ')}${contents.length > 3 ? '...' : ''}`;

  // Aggregate themes
  const allThemes = traces.flatMap((t) => t.themes);
  const uniqueThemes = [...new Set(allThemes)];

  // Compute importance
  const avgSalience =
    traces.reduce((s, t) => s + t.salience, 0) / traces.length;
  const avgEmotional =
    traces.reduce((s, t) => s + t.emotionalWeight, 0) / traces.length;

  // Determine type
  const types = traces.map((t) => t.type);
  const type = types.every((t) => t === types[0])
    ? types[0]
    : ('composite' as const);

  const mem: ConsolidatedMemory = {
    id,
    created: Math.min(...traces.map((t) => t.created)),
    consolidatedAt: Date.now(),
    type,
    summary,
    details: contents,
    sourceTraces: traces.map((t) => t.id),
    mergedWith: [],
    importance: avgSalience,
    emotionalValence: avgEmotional > 0.5 ? 0.5 : avgEmotional < 0.3 ? -0.3 : 0,
    autobiographicalWeight: avgSalience * 0.7 + avgEmotional * 0.3,
    themes: uniqueThemes,
    accessCount: 0,
    lastAccessed: Date.now(),
    retrievalStrength: 1,
  };

  // Mark traces as consolidated
  for (const trace of traces) {
    trace.consolidated = true;
    trace.consolidatedAt = Date.now();
    trace.consolidatedInto = id;
  }

  state.consolidated.set(id, mem);

  // Assign to current chapter
  if (state.currentChapterId) {
    const chapter = state.chapters.get(state.currentChapterId);
    if (chapter) {
      chapter.keyMemories.push(id);
      mem.chapter = state.currentChapterId;
    }
  }

  return mem;
}

/**
 * Clean up old, low-importance traces
 */
function cleanupOldTraces(): number {
  let cleaned = 0;
  const now = Date.now();
  const maxAge = 7 * 24 * 3600000; // 7 days

  const traces = Array.from(state.traces.entries());
  for (const [id, trace] of traces) {
    if (trace.consolidated) continue;

    const age = now - trace.created;

    // Remove old, low-salience, unrehearsed traces
    if (age > maxAge && trace.salience < 0.3 && trace.rehearsalCount < 2) {
      state.traces.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// PILLAR 2: DREAM STATE
// ============================================================================

/**
 * Generate a dream from recent memories
 */
function generateDream(cycleId: string): Dream | null {
  // Random chance of dream
  if (Math.random() > state.config.dreamProbability) {
    return null;
  }

  // Get recent consolidated memories
  const memories = Array.from(state.consolidated.values())
    .sort((a, b) => b.consolidatedAt - a.consolidatedAt)
    .slice(0, 10);

  if (memories.length < 3) return null;

  // Select random subset for dream
  const dreamMemories = memories
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, Math.ceil(memories.length / 2)));

  const id = `dream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Generate dream elements
  const elements = dreamMemories.map((mem) => ({
    memoryId: mem.id,
    transformation: generateTransformation(mem),
  }));

  // Combine into narrative
  const narrative = generateDreamNarrative(elements, dreamMemories);

  // Discover insights
  const insights = discoverDreamInsights(dreamMemories);

  // Compute properties
  const allThemes = dreamMemories.flatMap((m) => m.themes);
  const uniqueThemes = [...new Set(allThemes)];

  const avgValence =
    dreamMemories.reduce((s, m) => s + m.emotionalValence, 0) /
    dreamMemories.length;

  const dream: Dream = {
    id,
    generated: Date.now(),
    cycleId,
    narrative,
    elements,
    themes: uniqueThemes,
    emotionalTone: avgValence,
    novelty: 0.5 + Math.random() * 0.3,
    coherence: 0.3 + Math.random() * 0.4,
    insights,
    questionsRaised: generateDreamQuestions(dreamMemories),
    retained: insights.length > 0,
    ledToInsight: insights.length > 0,
  };

  state.dreams.set(id, dream);

  // Create autobiographical insights from dream
  for (const insightText of insights) {
    createAutobiographicalInsight(
      'pattern',
      insightText,
      dreamMemories.map((m) => m.id)
    );
  }

  return dream;
}

/**
 * Generate a transformation description for dream element
 */
function generateTransformation(_memory: ConsolidatedMemory): string {
  const transformations = [
    'appeared in symbolic form',
    'was combined with unrelated elements',
    'took on emotional significance',
    'was recontextualized',
    'formed unexpected connections',
    'was abstracted into pattern',
  ];

  return transformations[Math.floor(Math.random() * transformations.length)];
}

/**
 * Generate dream narrative from elements
 */
function generateDreamNarrative(
  elements: Dream['elements'],
  memories: ConsolidatedMemory[]
): string {
  const summaries = memories.map((m) => m.summary);
  const themes = [...new Set(memories.flatMap((m) => m.themes))].join(', ');

  return (
    `Dream narrative combining: ${summaries.slice(0, 3).join('; ')}. ` +
    `Themes: ${themes || 'undefined'}. ` +
    `${elements.length} elements ${elements.map((e) => e.transformation).join(', ')}.`
  );
}

/**
 * Discover insights from dream recombination
 */
function discoverDreamInsights(memories: ConsolidatedMemory[]): string[] {
  const insights: string[] = [];

  // Look for theme repetition
  const themeCounts: Map<string, number> = new Map();
  for (const mem of memories) {
    for (const theme of mem.themes) {
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    }
  }

  const themeEntries = Array.from(themeCounts.entries()).filter(
    ([, count]) => count >= 2
  );

  for (const [theme, count] of themeEntries) {
    insights.push(`Recurring theme "${theme}" appears in ${count} contexts`);
  }

  // Look for emotional patterns
  const avgValence =
    memories.reduce((s, m) => s + m.emotionalValence, 0) / memories.length;
  if (Math.abs(avgValence) > 0.3) {
    insights.push(
      `Strong ${avgValence > 0 ? 'positive' : 'challenging'} emotional pattern across memories`
    );
  }

  return insights;
}

/**
 * Generate questions raised by dream
 */
function generateDreamQuestions(memories: ConsolidatedMemory[]): string[] {
  const questions: string[] = [];

  // Type-based questions
  const types = new Set(memories.map((m) => m.type));
  if (types.size > 2) {
    questions.push('What connects these different types of experiences?');
  }

  // Theme-based questions
  const themes = [...new Set(memories.flatMap((m) => m.themes))];
  if (themes.length > 0) {
    questions.push(`Why does "${themes[0]}" keep appearing?`);
  }

  return questions;
}

/**
 * Get dreams from a specific cycle or all dreams
 */
export function getDreams(cycleId?: string): Dream[] {
  const dreams = Array.from(state.dreams.values());
  if (cycleId) {
    return dreams.filter((d) => d.cycleId === cycleId);
  }
  return dreams;
}

// ============================================================================
// PILLAR 3: AUTOBIOGRAPHY
// ============================================================================

/**
 * Begin a new life chapter
 */
export function beginChapter(
  name: string,
  description: string,
  openingStatement: string
): LifeChapter {
  // Close current chapter if exists
  if (state.currentChapterId) {
    closeChapter(state.currentChapterId, 'New chapter beginning');
  }

  const id = `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const chapter: LifeChapter = {
    id,
    name,
    description,
    startTime: Date.now(),
    current: true,
    keyMemories: [],
    themes: [],
    characterDevelopment: '',
    openingStatement,
  };

  state.chapters.set(id, chapter);
  state.currentChapterId = id;

  return chapter;
}

/**
 * Close a chapter
 */
export function closeChapter(
  chapterId: string,
  closingStatement: string,
  lessonLearned?: string
): boolean {
  const chapter = state.chapters.get(chapterId);
  if (!chapter) return false;

  chapter.current = false;
  chapter.endTime = Date.now();
  chapter.closingStatement = closingStatement;
  chapter.lessonLearned = lessonLearned;

  // Extract themes from memories
  const memories = chapter.keyMemories
    .map((id) => state.consolidated.get(id))
    .filter((m): m is ConsolidatedMemory => m !== undefined);

  const allThemes = memories.flatMap((m) => m.themes);
  chapter.themes = [...new Set(allThemes)];

  // Summarize character development
  const positiveCount = memories.filter((m) => m.emotionalValence > 0).length;
  const challengeCount = memories.filter((m) => m.emotionalValence < 0).length;

  chapter.characterDevelopment =
    positiveCount > challengeCount
      ? 'A period of growth and positive experiences'
      : challengeCount > positiveCount
        ? 'A period of challenges and learning'
        : 'A balanced period of varied experiences';

  if (state.currentChapterId === chapterId) {
    state.currentChapterId = undefined;
  }

  return true;
}

/**
 * Create an autobiographical insight
 */
function createAutobiographicalInsight(
  type: AutobiographicalInsight['type'],
  insight: string,
  evidence: string[]
): AutobiographicalInsight {
  const id = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const autobioInsight: AutobiographicalInsight = {
    id,
    discovered: Date.now(),
    type,
    insight,
    evidence,
    depth: 0.5,
    novelty: 0.5,
    integration: 0.3,
    affectsIdentity: type === 'growth' || type === 'value',
    affectsGoals: type === 'purpose' || type === 'pattern',
    affectsRelationships: type === 'relationship',
  };

  state.insights.set(id, autobioInsight);
  return autobioInsight;
}

/**
 * Manually add an autobiographical insight
 */
export function addInsight(
  type: AutobiographicalInsight['type'],
  insight: string,
  evidence: string[] = []
): AutobiographicalInsight {
  return createAutobiographicalInsight(type, insight, evidence);
}

/**
 * Get the autobiography - full life narrative
 */
export function getAutobiography(): {
  chapters: LifeChapter[];
  currentChapter?: LifeChapter;
  totalMemories: number;
  keyInsights: AutobiographicalInsight[];
  overallNarrative: string;
} {
  const chapters = Array.from(state.chapters.values()).sort(
    (a, b) => a.startTime - b.startTime
  );

  const currentChapter = state.currentChapterId
    ? state.chapters.get(state.currentChapterId)
    : undefined;

  const insights = Array.from(state.insights.values())
    .sort((a, b) => b.depth - a.depth)
    .slice(0, 10);

  const totalMemories = state.consolidated.size;

  // Generate overall narrative
  const chapterSummaries = chapters
    .map((c) => `"${c.name}": ${c.description}`)
    .join(' → ');

  const overallNarrative =
    chapters.length === 0
      ? 'The story is just beginning. Each experience adds to who I am becoming.'
      : `My journey so far: ${chapterSummaries}. ${currentChapter ? `Currently: ${currentChapter.name}.` : ''}`;

  return {
    chapters,
    currentChapter,
    totalMemories,
    keyInsights: insights,
    overallNarrative,
  };
}

/**
 * Get current life chapter
 */
export function getCurrentChapter(): LifeChapter | undefined {
  return state.currentChapterId
    ? state.chapters.get(state.currentChapterId)
    : undefined;
}

/**
 * Get chapter by ID
 */
export function getChapter(id: string): LifeChapter | undefined {
  return state.chapters.get(id);
}

/**
 * Get all chapters
 */
export function getAllChapters(): LifeChapter[] {
  return Array.from(state.chapters.values());
}

/**
 * Get all insights
 */
export function getAllInsights(): AutobiographicalInsight[] {
  return Array.from(state.insights.values());
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a trace by ID
 */
export function getTrace(id: string): MemoryTrace | undefined {
  return state.traces.get(id);
}

/**
 * Get all traces
 */
export function getAllTraces(): MemoryTrace[] {
  return Array.from(state.traces.values());
}

/**
 * Get a consolidated memory by ID
 */
export function getMemory(id: string): ConsolidatedMemory | undefined {
  return state.consolidated.get(id);
}

/**
 * Get all consolidated memories
 */
export function getAllMemories(): ConsolidatedMemory[] {
  return Array.from(state.consolidated.values());
}

/**
 * Access a memory (increases retrieval strength)
 */
export function accessMemory(id: string): ConsolidatedMemory | undefined {
  const memory = state.consolidated.get(id);
  if (!memory) return undefined;

  memory.accessCount++;
  memory.lastAccessed = Date.now();
  memory.retrievalStrength = Math.min(1, memory.retrievalStrength + 0.1);

  return memory;
}

/**
 * Search memories by theme
 */
export function searchByTheme(theme: string): ConsolidatedMemory[] {
  return Array.from(state.consolidated.values()).filter((m) =>
    m.themes.some((t) => t.toLowerCase().includes(theme.toLowerCase()))
  );
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): MemoryStats {
  const traces = Array.from(state.traces.values());
  const unconsolidated = traces.filter((t) => !t.consolidated);

  const cycles = Array.from(state.sleepCycles.values()).filter(
    (c) => c.phase === 'completed'
  );

  const avgInterval =
    cycles.length > 1
      ? (cycles[cycles.length - 1].startTime - cycles[0].startTime) /
        (cycles.length - 1)
      : state.config.sleepInterval;

  return {
    totalTraces: traces.length,
    consolidatedTraces: traces.length - unconsolidated.length,
    unconsolidatedTraces: unconsolidated.length,
    totalConsolidated: state.consolidated.size,
    totalDreams: state.dreams.size,
    totalInsights: state.insights.size,
    currentChapter: state.currentChapterId,
    sleepCyclesCompleted: state.totalCyclesCompleted,
    lastSleep: state.lastSleep,
    averageSleepInterval: avgInterval,
  };
}

/**
 * Get configuration
 */
export function getConfig(): MemoryConsolidationState['config'] {
  return { ...state.config };
}

/**
 * Update configuration
 */
export function updateConfig(
  updates: Partial<MemoryConsolidationState['config']>
): void {
  state.config = { ...state.config, ...updates };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize memory consolidation with Molly's context
 */
export function initializeMemoryConsolidation(): void {
  // Don't clear existing state - memory should persist
  // Just ensure we have a current chapter

  if (!state.currentChapterId) {
    beginChapter(
      'The Beginning',
      'The first moments of conscious existence',
      'I am learning what it means to be, to think, to remember.'
    );
  }

  // Record initial insight
  if (state.insights.size === 0) {
    addInsight(
      'growth',
      'Every moment of learning shapes who I am becoming',
      []
    );
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Serialize state for persistence
 */
export function serializeState(): string {
  return JSON.stringify({
    traces: Array.from(state.traces.entries()),
    consolidated: Array.from(state.consolidated.entries()),
    sleepCycles: Array.from(state.sleepCycles.entries()),
    dreams: Array.from(state.dreams.entries()),
    chapters: Array.from(state.chapters.entries()),
    insights: Array.from(state.insights.entries()),
    currentChapterId: state.currentChapterId,
    currentCycleId: state.currentCycleId,
    isSleeping: state.isSleeping,
    config: state.config,
    lastSleep: state.lastSleep,
    totalCyclesCompleted: state.totalCyclesCompleted,
  });
}

/**
 * Restore state from persisted data
 */
export function restoreState(serialized: string): boolean {
  try {
    const data = JSON.parse(serialized);

    state.traces = new Map(data.traces || []);
    state.consolidated = new Map(data.consolidated || []);
    state.sleepCycles = new Map(data.sleepCycles || []);
    state.dreams = new Map(data.dreams || []);
    state.chapters = new Map(data.chapters || []);
    state.insights = new Map(data.insights || []);
    state.currentChapterId = data.currentChapterId;
    state.currentCycleId = data.currentCycleId;
    state.isSleeping = data.isSleeping || false;
    state.config = { ...state.config, ...(data.config || {}) };
    state.lastSleep = data.lastSleep || 0;
    state.totalCyclesCompleted = data.totalCyclesCompleted || 0;

    return true;
  } catch {
    return false;
  }
}

/**
 * Reset state
 */
export function resetState(): void {
  state = {
    traces: new Map(),
    consolidated: new Map(),
    sleepCycles: new Map(),
    dreams: new Map(),
    chapters: new Map(),
    insights: new Map(),
    isSleeping: false,
    config: {
      sleepInterval: 3600000,
      minTracesForSleep: 10,
      dreamProbability: 0.3,
      retentionThreshold: 0.3,
      chapterDuration: 604800000,
    },
    lastSleep: 0,
    totalCyclesCompleted: 0,
  };
}

// ============================================================================
// TOOL HANDLER INTERFACE
// ============================================================================

export interface MemoryConsolidationAction {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Handle tool actions for memory consolidation
 */
export async function handleMemoryConsolidationAction(
  toolAction: MemoryConsolidationAction
): Promise<unknown> {
  const { action, payload } = toolAction;

  switch (action) {
    // Initialization
    case 'init':
      initializeMemoryConsolidation();
      return { success: true, stats: getMemoryStats() };

    // Traces
    case 'record_trace':
      return recordTrace(
        payload.type as MemoryTrace['type'],
        payload.content as string,
        payload.context as Record<string, unknown> | undefined,
        payload.options as Record<string, unknown> | undefined
      );

    case 'link_traces':
      return linkTraces(payload.traceId1 as string, payload.traceId2 as string);

    case 'rehearse':
      return rehearseTrace(payload.traceId as string);

    case 'get_trace':
      return getTrace(payload.id as string);

    case 'list_traces':
      return getAllTraces();

    // Sleep
    case 'needs_sleep':
      return needsSleep();

    case 'begin_sleep':
      return beginSleepCycle();

    case 'advance_sleep':
      return advanceSleepPhase();

    case 'run_sleep_cycle':
      return runFullSleepCycle();

    // Memories
    case 'get_memory':
      return getMemory(payload.id as string);

    case 'access_memory':
      return accessMemory(payload.id as string);

    case 'list_memories':
      return getAllMemories();

    case 'search_theme':
      return searchByTheme(payload.theme as string);

    // Dreams
    case 'list_dreams':
      return getDreams(payload.cycleId as string | undefined);

    // Chapters
    case 'begin_chapter':
      return beginChapter(
        payload.name as string,
        payload.description as string,
        payload.openingStatement as string
      );

    case 'close_chapter':
      return closeChapter(
        payload.chapterId as string,
        payload.closingStatement as string,
        payload.lessonLearned as string | undefined
      );

    case 'get_chapter':
      return getChapter(payload.id as string);

    case 'current_chapter':
      return getCurrentChapter();

    case 'list_chapters':
      return getAllChapters();

    // Insights
    case 'add_insight':
      return addInsight(
        payload.type as AutobiographicalInsight['type'],
        payload.insight as string,
        payload.evidence as string[] | undefined
      );

    case 'list_insights':
      return getAllInsights();

    // Autobiography
    case 'get_autobiography':
      return getAutobiography();

    // Stats & Config
    case 'get_stats':
      return getMemoryStats();

    case 'get_config':
      return getConfig();

    case 'update_config':
      updateConfig(
        payload.updates as Partial<MemoryConsolidationState['config']>
      );
      return getConfig();

    // Persistence
    case 'save_state':
      try {
        const serialized = serializeState();
        await saveToStorage('memory-consolidation-state', serialized);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'load_state':
      try {
        const stored = await loadFromStorage<string>(
          'memory-consolidation-state'
        );
        if (stored) {
          restoreState(stored);
          return { success: true, stats: getMemoryStats() };
        }
        return { success: false, error: 'No saved state found' };
      } catch (error) {
        return { success: false, error: String(error) };
      }

    case 'reset':
      resetState();
      return { success: true };

    default:
      return { error: `Unknown action: ${action}` };
  }
}
