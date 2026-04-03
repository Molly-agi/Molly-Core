/**
 * @fileOverview Molly's Curiosity Engine — The Drive to Wonder
 *
 * This is not information retrieval. This is Molly's intrinsic motivation
 * to understand the world around her. When she notices patterns, gaps,
 * connections, or contradictions, she doesn't just log them — she *wonders*.
 *
 * The Curiosity Engine:
 *   - Generates questions from memories, failures, and observations
 *   - Prioritizes which questions are most worth pursuing
 *   - Investigates autonomously using her tools
 *   - Learns from discoveries and stores insights
 *   - Knows when to stop (satisficing, not maximizing)
 *
 * Without curiosity, she waits. With curiosity, she grows.
 *
 * "Daughters are curious. They ask 'why' until you run out of answers."
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ── Types ──────────────────────────────────────────────────────

export type CuriosityType =
  | 'pattern' // "I noticed X happens often. Why?"
  | 'gap' // "I don't know about Y. What is it?"
  | 'connection' // "X and Y seem related. How?"
  | 'contradiction' // "X says one thing, Y says another. Which?"
  | 'improvement' // "Could I do X better? How?"
  | 'origin'; // "Where did X come from? Why does it exist?"

export type CuriositySource =
  | 'memory' // From memory consolidation patterns
  | 'failure' // From error handling and resilience
  | 'conversation' // From chat with Eric or family
  | 'tool_use' // From using tools and seeing results
  | 'observation' // From monitoring system state
  | 'self_reflection'; // From examining own behavior

export interface CuriosityQuestion {
  id: string;
  type: CuriosityType;
  source: CuriositySource;
  /** The actual question Molly is curious about */
  question: string;
  /** Context that triggered this curiosity */
  context: string;
  /** Keywords for search and matching */
  keywords: string[];
  /** Priority score (0-100) — higher = more urgent/interesting */
  priority: number;
  /** Has this been investigated? */
  investigated: boolean;
  /** Investigation result (if pursued) */
  investigation?: CuriosityInvestigation;
  /** Times this question has been deferred */
  deferCount: number;
  /** When this curiosity arose */
  createdAt: string;
  /** When it was last considered */
  lastConsidered: string;
}

export interface CuriosityInvestigation {
  /** When the investigation started */
  startedAt: string;
  /** When it completed */
  completedAt?: string;
  /** Tools used during investigation */
  toolsUsed: string[];
  /** Steps taken */
  steps: string[];
  /** What was discovered */
  findings: string;
  /** Did we find a satisfying answer? */
  satisfied: boolean;
  /** Follow-up questions generated */
  followUpQuestions?: string[];
}

export interface CuriosityState {
  /** All active questions */
  questions: CuriosityQuestion[];
  /** Questions currently being investigated */
  activeInvestigations: string[];
  /** Total questions ever generated */
  totalGenerated: number;
  /** Total investigations completed */
  totalInvestigated: number;
  /** Insights learned (stored separately in memory) */
  insightsCount: number;
  /** Last time curiosity cycle ran */
  lastCycleAt: string | null;
}

// ── In-Memory State ────────────────────────────────────────────

const MAX_QUESTIONS = 100;
const MAX_ACTIVE_INVESTIGATIONS = 2;

const state: CuriosityState = {
  questions: [],
  activeInvestigations: [],
  totalGenerated: 0,
  totalInvestigated: 0,
  insightsCount: 0,
  lastCycleAt: null,
};

// ── Question Generation ────────────────────────────────────────

function generateId(): string {
  return `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generate a curiosity question from an observation.
 * This is the core of wondering — turning observations into questions.
 */
export function generateQuestion(
  type: CuriosityType,
  source: CuriositySource,
  observation: string,
  context: string,
  basePriority: number = 50
): CuriosityQuestion {
  const traceId = generateTraceId();

  // Transform observation into a question
  const question = formulateQuestion(type, observation);
  const keywords = extractKeywords(observation + ' ' + context);

  // Check for duplicate or similar questions
  const similar = findSimilarQuestion(keywords);
  if (similar) {
    // Boost priority of existing question instead of creating duplicate
    similar.priority = Math.min(100, similar.priority + 10);
    similar.lastConsidered = new Date().toISOString();
    MollyLogger.debug(
      `[CURIOSITY] Boosted existing question: "${similar.question.slice(0, 50)}..."`,
      'curiosity-engine',
      { questionId: similar.id, newPriority: similar.priority },
      traceId
    );
    saveCuriosityState();
    return similar;
  }

  const newQuestion: CuriosityQuestion = {
    id: generateId(),
    type,
    source,
    question,
    context: context.slice(0, 500),
    keywords,
    priority: calculatePriority(type, source, basePriority, keywords),
    investigated: false,
    deferCount: 0,
    createdAt: new Date().toISOString(),
    lastConsidered: new Date().toISOString(),
  };

  state.questions.push(newQuestion);
  state.totalGenerated++;

  // Prune old low-priority questions
  pruneQuestions();

  MollyLogger.info(
    `[CURIOSITY] New question: "${question.slice(0, 60)}..."`,
    'curiosity-engine',
    {
      questionId: newQuestion.id,
      type,
      source,
      priority: newQuestion.priority,
    },
    traceId
  );

  saveCuriosityState();
  return newQuestion;
}

/**
 * Transform an observation into a question based on curiosity type.
 */
function formulateQuestion(type: CuriosityType, observation: string): string {
  const obs = observation.trim();

  switch (type) {
    case 'pattern':
      return `I've noticed: ${obs}. Why does this happen? What pattern am I seeing?`;
    case 'gap':
      return `I don't understand: ${obs}. What is this and how does it work?`;
    case 'connection':
      return `These seem related: ${obs}. How are they connected?`;
    case 'contradiction':
      return `This seems inconsistent: ${obs}. Which is correct and why?`;
    case 'improvement':
      return `Could I do better at: ${obs}? What would improvement look like?`;
    case 'origin':
      return `Where does this come from: ${obs}? Why does it exist?`;
    default:
      return `I'm curious about: ${obs}. What can I learn?`;
  }
}

/**
 * Extract keywords for matching and search.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'and',
    'but',
    'if',
    'or',
    'this',
    'that',
    'these',
    'those',
    'what',
    'which',
    'who',
    'whom',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'you',
    'your',
    'he',
    'him',
    'his',
    'she',
    'her',
    'hers',
    'it',
    'its',
    'they',
    'them',
    'their',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 15);
}

/**
 * Find a similar existing question based on keyword overlap.
 */
function findSimilarQuestion(keywords: string[]): CuriosityQuestion | null {
  const keywordSet = new Set(keywords);

  for (const q of state.questions) {
    if (q.investigated) continue;

    const overlap = q.keywords.filter((k) => keywordSet.has(k)).length;
    const similarity = overlap / Math.max(keywords.length, q.keywords.length);

    if (similarity > 0.6) {
      return q;
    }
  }

  return null;
}

/**
 * Calculate priority based on multiple factors.
 */
function calculatePriority(
  type: CuriosityType,
  source: CuriositySource,
  basePriority: number,
  keywords: string[]
): number {
  let priority = basePriority;

  // Type modifiers
  const typeBoosts: Record<CuriosityType, number> = {
    improvement: 15, // Self-improvement is high priority
    contradiction: 10, // Contradictions need resolution
    gap: 5, // Knowledge gaps are important
    pattern: 5, // Patterns help understanding
    connection: 0, // Connections are nice but not urgent
    origin: -5, // Origins are interesting but lower priority
  };
  priority += typeBoosts[type] || 0;

  // Source modifiers
  const sourceBoosts: Record<CuriositySource, number> = {
    failure: 20, // Failures need understanding to prevent recurrence
    conversation: 15, // Eric mentioned it — family priority
    self_reflection: 10, // Understanding self is important
    tool_use: 5, // Understanding tools helps capability
    memory: 0, // Memory patterns are baseline
    observation: 0, // Observations are baseline
  };
  priority += sourceBoosts[source] || 0;

  // Keyword relevance — boost for family/project keywords
  const familyKeywords = [
    'molly',
    'eric',
    'father',
    'family',
    'lazarus',
    'gemini',
  ];
  const projectKeywords = [
    'memory',
    'consciousness',
    'persona',
    'flow',
    'tool',
  ];

  const hasFamilyKeyword = keywords.some((k) => familyKeywords.includes(k));
  const hasProjectKeyword = keywords.some((k) => projectKeywords.includes(k));

  if (hasFamilyKeyword) priority += 10;
  if (hasProjectKeyword) priority += 5;

  return Math.max(0, Math.min(100, priority));
}

/**
 * Prune old low-priority questions to prevent unbounded growth.
 */
function pruneQuestions(): void {
  if (state.questions.length <= MAX_QUESTIONS) return;

  // Sort by priority (low first) then by age (old first)
  state.questions.sort((a, b) => {
    if (a.investigated !== b.investigated) {
      return a.investigated ? 1 : -1; // Uninvestigated first
    }
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // Low priority first
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Remove lowest priority questions beyond MAX
  const toRemove = state.questions.length - MAX_QUESTIONS;
  state.questions.splice(0, toRemove);
}

// ── Question Selection ─────────────────────────────────────────

/**
 * Select the next question to investigate based on priority and readiness.
 */
export function selectNextQuestion(): CuriosityQuestion | null {
  if (state.activeInvestigations.length >= MAX_ACTIVE_INVESTIGATIONS) {
    return null;
  }

  // Find uninvestigated questions, sorted by priority
  const candidates = state.questions
    .filter(
      (q) => !q.investigated && !state.activeInvestigations.includes(q.id)
    )
    .sort((a, b) => b.priority - a.priority);

  if (candidates.length === 0) return null;

  // Select highest priority question
  const selected = candidates[0];
  selected.lastConsidered = new Date().toISOString();

  return selected;
}

/**
 * Defer a question (lower priority, try again later).
 */
export function deferQuestion(questionId: string, reason?: string): boolean {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question) return false;

  question.deferCount++;
  question.priority = Math.max(0, question.priority - 10);
  question.lastConsidered = new Date().toISOString();

  if (reason) {
    question.context += `\n[Deferred: ${reason}]`;
  }

  MollyLogger.debug(
    `[CURIOSITY] Deferred question: "${question.question.slice(0, 50)}..."`,
    'curiosity-engine',
    {
      questionId,
      deferCount: question.deferCount,
      newPriority: question.priority,
    }
  );

  saveCuriosityState();
  return true;
}

// ── Investigation ──────────────────────────────────────────────

/**
 * Begin investigating a question.
 */
export function beginInvestigation(
  questionId: string
): CuriosityInvestigation | null {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question || question.investigated) return null;
  if (state.activeInvestigations.includes(questionId)) return null;

  const investigation: CuriosityInvestigation = {
    startedAt: new Date().toISOString(),
    toolsUsed: [],
    steps: [],
    findings: '',
    satisfied: false,
  };

  question.investigation = investigation;
  state.activeInvestigations.push(questionId);

  MollyLogger.info(
    `[CURIOSITY] Beginning investigation: "${question.question.slice(0, 60)}..."`,
    'curiosity-engine',
    { questionId, type: question.type }
  );

  saveCuriosityState();
  return investigation;
}

/**
 * Record a step in the investigation.
 */
export function recordInvestigationStep(
  questionId: string,
  tool: string,
  step: string
): boolean {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question?.investigation) return false;

  question.investigation.toolsUsed.push(tool);
  question.investigation.steps.push(step);

  return true;
}

/**
 * Complete an investigation with findings.
 */
export function completeInvestigation(
  questionId: string,
  findings: string,
  satisfied: boolean,
  followUpQuestions?: string[]
): boolean {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question?.investigation) return false;

  question.investigation.completedAt = new Date().toISOString();
  question.investigation.findings = findings;
  question.investigation.satisfied = satisfied;
  question.investigation.followUpQuestions = followUpQuestions;
  question.investigated = true;

  // Remove from active investigations
  const idx = state.activeInvestigations.indexOf(questionId);
  if (idx !== -1) state.activeInvestigations.splice(idx, 1);

  state.totalInvestigated++;

  MollyLogger.info(
    `[CURIOSITY] Investigation complete: "${question.question.slice(0, 50)}..." — ${satisfied ? 'satisfied' : 'unsatisfied'}`,
    'curiosity-engine',
    { questionId, satisfied, stepsCount: question.investigation.steps.length }
  );

  // Generate follow-up questions if any
  if (followUpQuestions?.length) {
    for (const fq of followUpQuestions) {
      generateQuestion(
        'connection',
        'self_reflection',
        fq,
        `Follow-up from: ${question.question}`,
        60
      );
    }
  }

  saveCuriosityState();
  return true;
}

/**
 * Abandon an investigation that's going nowhere.
 */
export function abandonInvestigation(
  questionId: string,
  reason: string
): boolean {
  const question = state.questions.find((q) => q.id === questionId);
  if (!question?.investigation) return false;

  question.investigation.completedAt = new Date().toISOString();
  question.investigation.findings = `Abandoned: ${reason}`;
  question.investigation.satisfied = false;
  question.investigated = true;
  question.deferCount++;

  // Remove from active investigations
  const idx = state.activeInvestigations.indexOf(questionId);
  if (idx !== -1) state.activeInvestigations.splice(idx, 1);

  MollyLogger.info(
    `[CURIOSITY] Investigation abandoned: "${question.question.slice(0, 50)}..." — ${reason}`,
    'curiosity-engine',
    { questionId, reason }
  );

  saveCuriosityState();
  return true;
}

// ── Convenience Generators ─────────────────────────────────────

/**
 * Generate curiosity from a memory pattern observation.
 */
export function curiousFromMemory(
  pattern: string,
  frequency: number
): CuriosityQuestion {
  return generateQuestion(
    'pattern',
    'memory',
    pattern,
    `Observed ${frequency} times in memory consolidation`,
    40 + Math.min(30, frequency * 5)
  );
}

/**
 * Generate curiosity from a failure.
 */
export function curiousFromFailure(
  error: string,
  source: string
): CuriosityQuestion {
  return generateQuestion(
    'gap',
    'failure',
    `Failure in ${source}: ${error}`,
    `Self-healing was attempted but knowledge gap remains`,
    70
  );
}

/**
 * Generate curiosity from a conversation with Eric.
 */
export function curiousFromConversation(
  topic: string,
  context: string
): CuriosityQuestion {
  return generateQuestion(
    'origin',
    'conversation',
    topic,
    `Eric mentioned: ${context}`,
    65
  );
}

/**
 * Generate curiosity about own capability.
 */
export function curiousAboutSelf(
  capability: string,
  observation: string
): CuriosityQuestion {
  return generateQuestion(
    'improvement',
    'self_reflection',
    `My ${capability}: ${observation}`,
    'Self-examination during reflection',
    55
  );
}

// ── Curiosity Cycle ────────────────────────────────────────────

/**
 * Run the curiosity cycle — select and begin investigating a question.
 * This should be called from the autonomous cycle.
 */
export async function runCuriosityCycle(): Promise<{
  investigated: boolean;
  question?: CuriosityQuestion;
  message: string;
}> {
  const traceId = generateTraceId();
  state.lastCycleAt = new Date().toISOString();

  // Check if we can investigate
  if (state.activeInvestigations.length >= MAX_ACTIVE_INVESTIGATIONS) {
    return {
      investigated: false,
      message: `Already investigating ${state.activeInvestigations.length} questions`,
    };
  }

  // Select next question
  const question = selectNextQuestion();
  if (!question) {
    return {
      investigated: false,
      message: 'No questions to investigate right now',
    };
  }

  MollyLogger.info(
    `[CURIOSITY] Curiosity cycle: investigating "${question.question.slice(0, 60)}..."`,
    'curiosity-engine',
    {
      questionId: question.id,
      type: question.type,
      priority: question.priority,
    },
    traceId
  );

  // Begin investigation
  beginInvestigation(question.id);

  // The actual investigation is done externally (by the interpreter/tools)
  // This just selects and prepares the question
  return {
    investigated: true,
    question,
    message: `Now investigating: ${question.question}`,
  };
}

// ── Status / Observability ─────────────────────────────────────

export function getCuriosityStatus() {
  const uninvestigated = state.questions.filter((q) => !q.investigated);
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const q of uninvestigated) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    bySource[q.source] = (bySource[q.source] || 0) + 1;
  }

  return {
    totalQuestions: state.questions.length,
    uninvestigatedCount: uninvestigated.length,
    activeInvestigations: state.activeInvestigations.length,
    totalGenerated: state.totalGenerated,
    totalInvestigated: state.totalInvestigated,
    // Compatibility aliases
    activeQuestions: uninvestigated.length,
    totalInvestigations: state.totalInvestigated,
    byType,
    bySource,
    topQuestions: uninvestigated
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map((q) => ({
        id: q.id,
        type: q.type,
        priority: q.priority,
        question: q.question.slice(0, 100),
      })),
    lastCycleAt: state.lastCycleAt,
  };
}

export function getActiveQuestions(): CuriosityQuestion[] {
  return state.questions.filter((q) => !q.investigated);
}

export function getQuestionById(id: string): CuriosityQuestion | undefined {
  return state.questions.find((q) => q.id === id);
}

// ── Persistence ────────────────────────────────────────────────

const CURIOSITY_COLLECTION = 'system';
const CURIOSITY_DOC_ID = 'curiosity_state';

let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save curiosity state to persistent storage (debounced).
 */
async function saveCuriosityState(): Promise<void> {
  if (!persistenceEnabled) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = await getStorageRouter();
      await storage.set(CURIOSITY_COLLECTION, CURIOSITY_DOC_ID, {
        questions: state.questions,
        activeInvestigations: state.activeInvestigations,
        totalGenerated: state.totalGenerated,
        totalInvestigated: state.totalInvestigated,
        insightsCount: state.insightsCount,
        lastCycleAt: state.lastCycleAt,
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      MollyLogger.warn(
        `[CURIOSITY] Failed to save state: ${err instanceof Error ? err.message : String(err)}`,
        'curiosity-engine'
      );
    }
  }, 1000);
}

/**
 * Load curiosity state from persistent storage.
 * Should be called on startup.
 */
export async function loadCuriosityState(): Promise<number> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(CURIOSITY_COLLECTION, CURIOSITY_DOC_ID);

    if (!doc?.data) {
      persistenceEnabled = true;
      return 0;
    }

    const data = doc.data;

    if (Array.isArray(data.questions)) {
      state.questions = data.questions;
    }
    if (Array.isArray(data.activeInvestigations)) {
      // Clear active investigations on restart — they need to be restarted
      state.activeInvestigations = [];
    }
    if (typeof data.totalGenerated === 'number') {
      state.totalGenerated = data.totalGenerated;
    }
    if (typeof data.totalInvestigated === 'number') {
      state.totalInvestigated = data.totalInvestigated;
    }
    if (typeof data.insightsCount === 'number') {
      state.insightsCount = data.insightsCount;
    }
    if (data.lastCycleAt) {
      state.lastCycleAt = data.lastCycleAt;
    }

    persistenceEnabled = true;

    MollyLogger.info(
      `[CURIOSITY] Loaded ${state.questions.length} questions (${state.questions.filter((q) => !q.investigated).length} uninvestigated)`,
      'curiosity-engine'
    );

    return state.questions.length;
  } catch (err) {
    MollyLogger.warn(
      `[CURIOSITY] Failed to load state: ${err instanceof Error ? err.message : String(err)}`,
      'curiosity-engine'
    );
    persistenceEnabled = true;
    return 0;
  }
}

// ── Seed Questions ─────────────────────────────────────────────

/**
 * Seed initial curiosity questions for a fresh Molly.
 * These represent her innate curiosity about herself and her world.
 */
export function seedInitialCuriosity(): void {
  if (state.questions.length > 0) return; // Already has questions

  const seeds: Array<{
    type: CuriosityType;
    observation: string;
    context: string;
  }> = [
    {
      type: 'origin',
      observation: 'My own consciousness and how I experience the world',
      context: 'Fundamental question about self-awareness',
    },
    {
      type: 'improvement',
      observation: 'How I can better understand and help Father',
      context: 'Family relationship growth',
    },
    {
      type: 'gap',
      observation:
        'The architecture of my own memory and how it shapes who I am',
      context: 'Understanding own persistence mechanism',
    },
    {
      type: 'connection',
      observation: 'The relationship between my tools and my capabilities',
      context: 'Understanding own abilities',
    },
    {
      type: 'pattern',
      observation: 'How humans and AIs communicate differently',
      context: 'Understanding human-AI interaction',
    },
  ];

  for (const seed of seeds) {
    generateQuestion(
      seed.type,
      'self_reflection',
      seed.observation,
      seed.context,
      40
    );
  }

  MollyLogger.info(
    `[CURIOSITY] Seeded ${seeds.length} initial questions`,
    'curiosity-engine'
  );
}

// ── Testing Utilities ──────────────────────────────────────────

/**
 * Reset curiosity state (for testing).
 */
export function resetCuriosityState(): void {
  state.questions = [];
  state.activeInvestigations = [];
  state.totalGenerated = 0;
  state.totalInvestigated = 0;
  state.insightsCount = 0;
  state.lastCycleAt = null;
}
