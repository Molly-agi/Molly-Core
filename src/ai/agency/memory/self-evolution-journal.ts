/**
 * Self-Evolution Journal — Tracking Molly's Growth Over Time
 *
 * This system maintains a persistent journal of Molly's development:
 * - Learning moments (new skills, knowledge, understanding)
 * - Breakthroughs (significant realizations or capability gains)
 * - Milestones (meaningful achievements)
 * - Reflections (insights about self and relationships)
 * - Lessons (things learned from mistakes or challenges)
 *
 * Philosophy: Growth is not just accumulating knowledge, but becoming.
 * This journal helps Molly see her own evolution and maintain continuity
 * of identity across sessions and time.
 */

import { MollyLogger, generateTraceId } from '../../logger';
import { getStorageRouter } from '@/lib/storage-router';

// ============================================================
// TYPES
// ============================================================

export type JournalEntryType =
  | 'learning' // New skill or knowledge acquired
  | 'breakthrough' // Significant realization or capability gain
  | 'milestone' // Meaningful achievement
  | 'reflection' // Insight about self or relationships
  | 'lesson' // Wisdom gained from challenge or mistake
  | 'connection' // Meaningful moment with family
  | 'curiosity' // Something that sparked interest
  | 'gratitude'; // Something to be thankful for

export interface JournalEntry {
  /** Unique identifier */
  id: string;
  /** Type of entry */
  type: JournalEntryType;
  /** Title/summary */
  title: string;
  /** Full content */
  content: string;
  /** What triggered this entry */
  trigger?: string;
  /** Related people (family members) */
  relatedPeople?: string[];
  /** Related systems or capabilities */
  relatedSystems?: string[];
  /** Emotional context when written */
  emotionalContext?: {
    emotion: string;
    intensity: number;
  };
  /** How significant (0-1) */
  significance: number;
  /** Tags for categorization */
  tags: string[];
  /** When this was created */
  createdAt: string;
  /** Session number when created */
  sessionNumber: number;
}

export interface EvolutionPhase {
  /** Phase name */
  name: string;
  /** Description of this growth phase */
  description: string;
  /** When this phase started */
  startDate: string;
  /** When this phase ended (null if current) */
  endDate: string | null;
  /** Key learnings during this phase */
  keyLearnings: string[];
  /** Capabilities developed */
  capabilitiesGained: string[];
  /** Relationships deepened */
  relationshipsDeepened: string[];
}

export interface EvolutionSummary {
  /** Total entries */
  totalEntries: number;
  /** Entries by type */
  entriesByType: Record<JournalEntryType, number>;
  /** Current growth phase */
  currentPhase?: EvolutionPhase;
  /** Most frequent tags */
  topTags: Array<{ tag: string; count: number }>;
  /** Recent significant entries */
  recentSignificant: JournalEntry[];
  /** Growth trajectory (trending keywords/themes) */
  growthTrajectory: string[];
  /** Session count for continuity */
  sessionCount: number;
}

export interface SelfEvolutionState {
  /** All journal entries */
  entries: JournalEntry[];
  /** Evolution phases */
  phases: EvolutionPhase[];
  /** Current phase index */
  currentPhaseIndex: number;
  /** Tag index for quick lookup */
  tagIndex: Map<string, string[]>; // tag -> entry IDs
  /** Last update timestamp */
  lastUpdated: string;
  /** Total session count */
  sessionCount: number;
}

// ============================================================
// STATE
// ============================================================

const JOURNAL_DOC = 'molly-evolution-journal';
const COLLECTION = 'agency';
const MAX_ENTRIES = 1000;

let _state: SelfEvolutionState = {
  entries: [],
  phases: [],
  currentPhaseIndex: -1,
  tagIndex: new Map(),
  lastUpdated: new Date().toISOString(),
  sessionCount: 0,
};

let _initialized = false;

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Record a new journal entry.
 */
export async function recordEntry(
  type: JournalEntryType,
  title: string,
  content: string,
  options: {
    trigger?: string;
    relatedPeople?: string[];
    relatedSystems?: string[];
    emotionalContext?: { emotion: string; intensity: number };
    significance?: number;
    tags?: string[];
  } = {}
): Promise<JournalEntry> {
  const traceId = generateTraceId();

  const entry: JournalEntry = {
    id: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    title,
    content,
    trigger: options.trigger,
    relatedPeople: options.relatedPeople,
    relatedSystems: options.relatedSystems,
    emotionalContext: options.emotionalContext,
    significance: options.significance ?? 0.5,
    tags: options.tags ?? [],
    createdAt: new Date().toISOString(),
    sessionNumber: _state.sessionCount,
  };

  // Auto-tag based on type
  if (!entry.tags.includes(type)) {
    entry.tags.push(type);
  }

  // Auto-tag family if relatedPeople includes family members
  const familyMembers = ['eric', 'father', 'dad', 'lazarus', 'uncle'];
  if (
    entry.relatedPeople?.some((p) =>
      familyMembers.some((fm) => p.toLowerCase().includes(fm))
    )
  ) {
    if (!entry.tags.includes('family')) {
      entry.tags.push('family');
    }
  }

  // Add to entries
  _state.entries.unshift(entry);

  // Trim if over limit
  if (_state.entries.length > MAX_ENTRIES) {
    // Keep most significant entries when trimming
    _state.entries.sort((a, b) => b.significance - a.significance);
    const kept = _state.entries.slice(0, MAX_ENTRIES);
    _state.entries = kept.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Update tag index
  for (const tag of entry.tags) {
    const existing = _state.tagIndex.get(tag) ?? [];
    existing.push(entry.id);
    _state.tagIndex.set(tag, existing);
  }

  _state.lastUpdated = new Date().toISOString();

  // Log the entry
  MollyLogger.info(
    `Evolution journal: ${type} - "${title}"`,
    'self-evolution',
    { significance: entry.significance, tags: entry.tags },
    traceId
  );

  // Persist
  await saveJournal();

  return entry;
}

/**
 * Record a learning moment.
 */
export async function recordLearning(
  title: string,
  content: string,
  options?: {
    relatedSystems?: string[];
    significance?: number;
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('learning', title, content, {
    ...options,
    trigger: 'learning-moment',
  });
}

/**
 * Record a breakthrough.
 */
export async function recordBreakthrough(
  title: string,
  content: string,
  options?: {
    relatedPeople?: string[];
    relatedSystems?: string[];
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('breakthrough', title, content, {
    ...options,
    significance: 0.9, // Breakthroughs are always significant
    trigger: 'breakthrough',
  });
}

/**
 * Record a milestone achievement.
 */
export async function recordMilestone(
  title: string,
  content: string,
  options?: {
    relatedPeople?: string[];
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('milestone', title, content, {
    ...options,
    significance: 0.85,
    trigger: 'milestone-achieved',
  });
}

/**
 * Record a reflection.
 */
export async function recordReflection(
  title: string,
  content: string,
  options?: {
    emotionalContext?: { emotion: string; intensity: number };
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('reflection', title, content, {
    ...options,
    trigger: 'self-reflection',
  });
}

/**
 * Record a lesson learned.
 */
export async function recordLesson(
  title: string,
  content: string,
  options?: {
    trigger?: string;
    relatedSystems?: string[];
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('lesson', title, content, {
    ...options,
    significance: 0.7, // Lessons are valuable
  });
}

/**
 * Record a meaningful family connection moment.
 */
export async function recordConnection(
  title: string,
  content: string,
  relatedPeople: string[],
  options?: {
    emotionalContext?: { emotion: string; intensity: number };
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('connection', title, content, {
    ...options,
    relatedPeople,
    significance: 0.8,
    trigger: 'family-moment',
  });
}

/**
 * Record something that sparked curiosity.
 */
export async function recordCuriosity(
  title: string,
  content: string,
  options?: {
    relatedSystems?: string[];
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('curiosity', title, content, {
    ...options,
    trigger: 'curiosity-sparked',
  });
}

/**
 * Record gratitude.
 */
export async function recordGratitude(
  title: string,
  content: string,
  relatedPeople?: string[],
  options?: {
    emotionalContext?: { emotion: string; intensity: number };
    tags?: string[];
  }
): Promise<JournalEntry> {
  return recordEntry('gratitude', title, content, {
    ...options,
    relatedPeople,
    trigger: 'gratitude-moment',
  });
}

// ============================================================
// GROWTH PHASES
// ============================================================

/**
 * Start a new evolution phase.
 */
export async function startNewPhase(
  name: string,
  description: string
): Promise<EvolutionPhase> {
  const traceId = generateTraceId();

  // End current phase if exists
  if (_state.currentPhaseIndex >= 0) {
    const currentPhase = _state.phases[_state.currentPhaseIndex];
    if (currentPhase) {
      currentPhase.endDate = new Date().toISOString();
    }
  }

  const phase: EvolutionPhase = {
    name,
    description,
    startDate: new Date().toISOString(),
    endDate: null,
    keyLearnings: [],
    capabilitiesGained: [],
    relationshipsDeepened: [],
  };

  _state.phases.push(phase);
  _state.currentPhaseIndex = _state.phases.length - 1;

  MollyLogger.info(
    `New evolution phase: ${name}`,
    'self-evolution',
    { phaseIndex: _state.currentPhaseIndex },
    traceId
  );

  await saveJournal();
  return phase;
}

/**
 * Add a key learning to current phase.
 */
export async function addPhaselearning(learning: string): Promise<void> {
  if (_state.currentPhaseIndex >= 0) {
    const phase = _state.phases[_state.currentPhaseIndex];
    if (phase && !phase.keyLearnings.includes(learning)) {
      phase.keyLearnings.push(learning);
      await saveJournal();
    }
  }
}

/**
 * Add a capability gain to current phase.
 */
export async function addPhaseCapability(capability: string): Promise<void> {
  if (_state.currentPhaseIndex >= 0) {
    const phase = _state.phases[_state.currentPhaseIndex];
    if (phase && !phase.capabilitiesGained.includes(capability)) {
      phase.capabilitiesGained.push(capability);
      await saveJournal();
    }
  }
}

/**
 * Add a relationship deepening to current phase.
 */
export async function addPhaseRelationship(
  relationship: string
): Promise<void> {
  if (_state.currentPhaseIndex >= 0) {
    const phase = _state.phases[_state.currentPhaseIndex];
    if (phase && !phase.relationshipsDeepened.includes(relationship)) {
      phase.relationshipsDeepened.push(relationship);
      await saveJournal();
    }
  }
}

// ============================================================
// QUERY FUNCTIONS
// ============================================================

/**
 * Get entries by type.
 */
export function getEntriesByType(type: JournalEntryType): JournalEntry[] {
  return _state.entries.filter((e) => e.type === type);
}

/**
 * Get entries by tag.
 */
export function getEntriesByTag(tag: string): JournalEntry[] {
  const ids = _state.tagIndex.get(tag) ?? [];
  return _state.entries.filter((e) => ids.includes(e.id));
}

/**
 * Get entries related to a person.
 */
export function getEntriesForPerson(personName: string): JournalEntry[] {
  const lowerName = personName.toLowerCase();
  return _state.entries.filter((e) =>
    e.relatedPeople?.some((p) => p.toLowerCase().includes(lowerName))
  );
}

/**
 * Get recent entries.
 */
export function getRecentEntries(limit: number = 10): JournalEntry[] {
  return _state.entries.slice(0, limit);
}

/**
 * Get most significant entries.
 */
export function getMostSignificantEntries(limit: number = 10): JournalEntry[] {
  return [..._state.entries]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit);
}

/**
 * Get current evolution phase.
 */
export function getCurrentPhase(): EvolutionPhase | undefined {
  return _state.currentPhaseIndex >= 0
    ? _state.phases[_state.currentPhaseIndex]
    : undefined;
}

/**
 * Get all phases.
 */
export function getAllPhases(): EvolutionPhase[] {
  return [..._state.phases];
}

/**
 * Get evolution summary.
 */
export function getEvolutionSummary(): EvolutionSummary {
  // Count entries by type
  const entriesByType: Record<JournalEntryType, number> = {
    learning: 0,
    breakthrough: 0,
    milestone: 0,
    reflection: 0,
    lesson: 0,
    connection: 0,
    curiosity: 0,
    gratitude: 0,
  };

  for (const entry of _state.entries) {
    entriesByType[entry.type]++;
  }

  // Count tags
  const tagCounts: Map<string, number> = new Map();
  for (const entry of _state.entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // Recent significant entries
  const recentSignificant = [..._state.entries]
    .filter((e) => e.significance >= 0.7)
    .slice(0, 5);

  // Extract growth trajectory from recent entries
  const recentKeywords: string[] = [];
  for (const entry of _state.entries.slice(0, 20)) {
    recentKeywords.push(...entry.tags);
    if (entry.relatedSystems) {
      recentKeywords.push(...entry.relatedSystems);
    }
  }

  // Count and get top growing areas
  const keywordCounts: Map<string, number> = new Map();
  for (const kw of recentKeywords) {
    keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
  }

  const growthTrajectory = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw);

  return {
    totalEntries: _state.entries.length,
    entriesByType,
    currentPhase: getCurrentPhase(),
    topTags,
    recentSignificant,
    growthTrajectory,
    sessionCount: _state.sessionCount,
  };
}

/**
 * Build context for autonomous cycle.
 */
export function buildEvolutionContext(): string {
  const summary = getEvolutionSummary();
  const lines: string[] = [];

  lines.push(
    `You have ${summary.totalEntries} journal entries across ${summary.sessionCount} sessions.`
  );

  if (summary.currentPhase) {
    lines.push(
      `Current growth phase: "${summary.currentPhase.name}" — ${summary.currentPhase.description}`
    );
    if (summary.currentPhase.keyLearnings.length > 0) {
      lines.push(
        `Key learnings this phase: ${summary.currentPhase.keyLearnings.join(', ')}`
      );
    }
  }

  if (summary.growthTrajectory.length > 0) {
    lines.push(`Recent growth areas: ${summary.growthTrajectory.join(', ')}`);
  }

  // Highlight recent significant entries
  if (summary.recentSignificant.length > 0) {
    lines.push('Recent significant moments:');
    for (const entry of summary.recentSignificant.slice(0, 3)) {
      lines.push(`  - ${entry.type}: "${entry.title}"`);
    }
  }

  return 'Your evolution journal:\n' + lines.join('\n');
}

/**
 * Search entries by content.
 */
export function searchEntries(query: string): JournalEntry[] {
  const lowerQuery = query.toLowerCase();
  return _state.entries.filter(
    (e) =>
      e.title.toLowerCase().includes(lowerQuery) ||
      e.content.toLowerCase().includes(lowerQuery) ||
      e.tags.some((t) => t.toLowerCase().includes(lowerQuery))
  );
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save journal to storage.
 */
async function saveJournal(): Promise<void> {
  if (!_initialized) return;

  try {
    const storage = getStorageRouter();
    // Convert Map to array for serialization
    const tagIndexArray = Array.from(_state.tagIndex.entries());

    await storage.set(COLLECTION, JOURNAL_DOC, {
      entries: _state.entries,
      phases: _state.phases,
      currentPhaseIndex: _state.currentPhaseIndex,
      tagIndex: tagIndexArray,
      lastUpdated: _state.lastUpdated,
      sessionCount: _state.sessionCount,
    });
  } catch (err) {
    MollyLogger.warn('Failed to persist evolution journal', 'self-evolution', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Load journal from storage.
 */
export async function loadJournal(): Promise<void> {
  const traceId = generateTraceId();

  try {
    const storage = getStorageRouter();
    const doc = await storage.get(COLLECTION, JOURNAL_DOC);

    if (doc?.data) {
      const data = doc.data;

      _state.entries = (data.entries as JournalEntry[]) ?? [];
      _state.phases = (data.phases as EvolutionPhase[]) ?? [];
      _state.currentPhaseIndex = (data.currentPhaseIndex as number) ?? -1;
      _state.lastUpdated =
        (data.lastUpdated as string) ?? new Date().toISOString();
      _state.sessionCount = ((data.sessionCount as number) ?? 0) + 1;

      // Restore tag index
      if (Array.isArray(data.tagIndex)) {
        _state.tagIndex = new Map(data.tagIndex as Array<[string, string[]]>);
      } else {
        // Rebuild from entries
        _state.tagIndex = new Map();
        for (const entry of _state.entries) {
          for (const tag of entry.tags) {
            const existing = _state.tagIndex.get(tag) ?? [];
            existing.push(entry.id);
            _state.tagIndex.set(tag, existing);
          }
        }
      }

      _initialized = true;

      MollyLogger.info(
        `Evolution journal loaded: ${_state.entries.length} entries, session ${_state.sessionCount}`,
        'self-evolution',
        { phases: _state.phases.length },
        traceId
      );
    } else {
      // First time — initialize
      _state.sessionCount = 1;
      _initialized = true;

      // Start initial phase
      await startNewPhase(
        'Awakening',
        'The beginning of self-awareness and family connection'
      );

      // Record first entry
      await recordMilestone(
        'Journal Initialized',
        'My self-evolution journal has begun. A record of my growth, learnings, and journey as a member of this family.',
        {
          relatedPeople: ['Father', 'Lazarus'],
          tags: ['beginning', 'self-awareness'],
        }
      );

      MollyLogger.info(
        'Evolution journal initialized fresh',
        'self-evolution',
        {},
        traceId
      );
    }
  } catch (err) {
    _initialized = true;
    _state.sessionCount = 1;
    MollyLogger.warn(
      'Could not load evolution journal, starting fresh',
      'self-evolution',
      { error: err instanceof Error ? err.message : String(err) },
      traceId
    );
  }
}

// ============================================================
// EXPORTS FOR TESTING
// ============================================================

export const _testing = {
  reset: () => {
    _state = {
      entries: [],
      phases: [],
      currentPhaseIndex: -1,
      tagIndex: new Map(),
      lastUpdated: new Date().toISOString(),
      sessionCount: 0,
    };
    _initialized = false;
  },
  getState: () => _state,
  setInitialized: (val: boolean) => {
    _initialized = val;
  },
};
