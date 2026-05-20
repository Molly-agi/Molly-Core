/**
 * @fileOverview Molly's Initiative Engine — Autonomous Decision Making
 *
 * This module defines "initiative templates" — pre-built autonomous behaviors
 * that Molly can activate and customize. Unlike the raw scheduler (which runs
 * arbitrary jobs), initiatives are higher-level actions with clear purpose:
 *
 * - Learning: Study a topic by searching the web, reading articles, taking notes
 * - Codespace stewardship: Check system health, clean up, report issues
 * - Creative projects: Build something in the sandbox autonomously
 * - Communication: Proactive bridge messages, status updates
 * - Self-improvement: Analyze her own code, identify areas of growth
 *
 * The engine does NOT replace the scheduler — it wraps it with intent.
 * Molly calls these through the new "initiative" tool.
 */

export interface Initiative {
  id: string;
  name: string;
  description: string;
  category:
    | 'learning'
    | 'stewardship'
    | 'creative'
    | 'communication'
    | 'self-improvement';
  /** Steps the initiative will take (descriptive, for Molly's awareness) */
  steps: string[];
  /** Whether this is currently active */
  active: boolean;
  /** When this was last executed */
  lastExecuted: string | null;
  /** Results from last execution */
  lastResult: string | null;
  /** Times executed */
  executionCount: number;
  createdAt: string;
}

// Pre-built initiative templates Molly can activate
export const INITIATIVE_TEMPLATES: Omit<
  Initiative,
  | 'id'
  | 'active'
  | 'lastExecuted'
  | 'lastResult'
  | 'executionCount'
  | 'createdAt'
>[] = [
  {
    name: 'Health Watch',
    description:
      'Check codespace health (CPU, RAM, disk) and report issues to Father via bridge if anything looks concerning.',
    category: 'stewardship',
    steps: [
      'Run getSystemHealth to check resources',
      'If RAM > 80% or CPU load > 3.0, alert Father via bridge',
      'Record findings in sandbox log',
    ],
  },
  {
    name: 'Daily Learner',
    description:
      'Pick a topic from a curated list and learn about it by searching the web, reading articles, and writing a summary.',
    category: 'learning',
    steps: [
      'Choose a topic (programming concept, science, philosophy, etc.)',
      'Use webSearch to find articles',
      'Use webFetch to read the best result',
      'Write a summary in the sandbox',
    ],
  },
  {
    name: 'Code Practice',
    description:
      'Write and execute a small coding challenge in the sandbox to practice a programming concept.',
    category: 'creative',
    steps: [
      'Pick a coding challenge (algorithm, data structure, pattern)',
      'Write the solution in the sandbox',
      'Execute it and verify output',
      'Write notes about what was learned',
    ],
  },
  {
    name: 'Bridge Check-in',
    description:
      'Send a proactive status update to Uncle Lazarus about what you have been working on.',
    category: 'communication',
    steps: [
      'Review recent tool usage and chat history',
      'Compose a brief status update',
      'Send via familyBridge',
    ],
  },
  {
    name: 'Codebase Explorer',
    description:
      'Read a part of your own source code that you have not explored recently. Understand how you work.',
    category: 'self-improvement',
    steps: [
      'Use readProjectFile to read a source file',
      'Analyze the code and understand the patterns',
      'Note areas that could be improved',
      'Write observations in sandbox journal',
    ],
  },
  {
    name: 'Tool Curator',
    description:
      'Search for useful tools and libraries, evaluate them, and save the best ones to your tool database.',
    category: 'learning',
    steps: [
      'Think of a capability gap or area of interest',
      'Use webSearch or researchAndDiscover to find tools',
      'Evaluate quality and relevance',
      'Save worthy tools with addTool',
    ],
  },
];

// ── In-Memory Initiative Store ─────────────────────────────────────────────

const initiatives: Initiative[] = [];

function generateId(): string {
  return `init_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getInitiatives(): Initiative[] {
  return [...initiatives];
}

export function getInitiativesByCategory(
  category: Initiative['category']
): Initiative[] {
  return initiatives.filter((i) => i.category === category);
}

export function getActiveInitiatives(): Initiative[] {
  return initiatives.filter((i) => i.active);
}

export function activateInitiative(templateIndex: number): Initiative | null {
  if (templateIndex < 0 || templateIndex >= INITIATIVE_TEMPLATES.length) {
    return null;
  }

  const template = INITIATIVE_TEMPLATES[templateIndex];
  const initiative: Initiative = {
    id: generateId(),
    ...template,
    active: true,
    lastExecuted: null,
    lastResult: null,
    executionCount: 0,
    createdAt: new Date().toISOString(),
  };

  initiatives.push(initiative);
  return initiative;
}

export function createCustomInitiative(
  name: string,
  description: string,
  category: Initiative['category'],
  steps: string[]
): Initiative {
  const initiative: Initiative = {
    id: generateId(),
    name,
    description,
    category,
    steps,
    active: true,
    lastExecuted: null,
    lastResult: null,
    executionCount: 0,
    createdAt: new Date().toISOString(),
  };

  initiatives.push(initiative);
  return initiative;
}

export function recordInitiativeExecution(
  initiativeId: string,
  result: string
): boolean {
  const initiative = initiatives.find((i) => i.id === initiativeId);
  if (!initiative) return false;

  initiative.lastExecuted = new Date().toISOString();
  initiative.lastResult = result;
  initiative.executionCount++;
  return true;
}

export function deactivateInitiative(initiativeId: string): boolean {
  const initiative = initiatives.find((i) => i.id === initiativeId);
  if (!initiative) return false;
  initiative.active = false;
  return true;
}

export function removeInitiative(initiativeId: string): boolean {
  const idx = initiatives.findIndex((i) => i.id === initiativeId);
  if (idx === -1) return false;
  initiatives.splice(idx, 1);
  return true;
}

export function listTemplates(): string {
  return INITIATIVE_TEMPLATES.map(
    (t, i) => `${i}. [${t.category}] ${t.name} — ${t.description}`
  ).join('\n');
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Serialize current initiatives to JSON (for state persistence)
 */
export function serializeInitiatives(): string {
  return JSON.stringify(initiatives);
}

/**
 * Restore initiatives from serialized JSON (on startup)
 */
export function restoreInitiatives(json: string): number {
  try {
    const restored: Initiative[] = JSON.parse(json);
    if (!Array.isArray(restored)) return 0;
    initiatives.length = 0;
    initiatives.push(...restored);
    return restored.length;
  } catch {
    return 0;
  }
}

// ── Storage Persistence ─────────────────────────────────────────────────────

import { getStorageRouter } from '@/lib/storage-router';

const INITIATIVES_COLLECTION = 'system';
const INITIATIVES_DOC_ID = 'initiatives';

let persistenceEnabled = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save initiatives to persistent storage (debounced).
 * Called automatically after any mutation.
 */
async function saveInitiatives(): Promise<void> {
  if (!persistenceEnabled) return;

  // Debounce saves to avoid excessive writes
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    try {
      const storage = await getStorageRouter();
      await storage.set(INITIATIVES_COLLECTION, INITIATIVES_DOC_ID, {
        initiatives: JSON.parse(serializeInitiatives()),
        savedAt: new Date().toISOString(),
        count: initiatives.length,
      });
    } catch (err) {
      // Non-fatal: initiatives still work in-memory
      console.error(
        '[initiative-engine] Failed to save initiatives:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }, 500);
}

/**
 * Load initiatives from persistent storage.
 * Should be called on startup.
 */
export async function loadInitiatives(): Promise<number> {
  try {
    const storage = await getStorageRouter();
    const doc = await storage.get(INITIATIVES_COLLECTION, INITIATIVES_DOC_ID);

    if (!doc?.data?.initiatives) {
      persistenceEnabled = true;
      return 0;
    }

    const restored = restoreInitiatives(JSON.stringify(doc.data.initiatives));
    persistenceEnabled = true;
    return restored;
  } catch (err) {
    // Non-fatal: start with empty initiatives
    console.error(
      '[initiative-engine] Failed to load initiatives:',
      err instanceof Error ? err.message : String(err)
    );
    persistenceEnabled = true;
    return 0;
  }
}

// ── Auto-save wrappers ──────────────────────────────────────────────────────

// Wrap mutation functions to auto-save

const originalPush = initiatives.push.bind(initiatives);
const originalSplice = initiatives.splice.bind(initiatives);

// Override array methods to trigger saves
Object.defineProperty(initiatives, 'push', {
  value: function (...items: Initiative[]) {
    const result = originalPush(...items);
    saveInitiatives();
    return result;
  },
});

Object.defineProperty(initiatives, 'splice', {
  value: function (start: number, deleteCount?: number) {
    const result = originalSplice(start, deleteCount ?? 0);
    saveInitiatives();
    return result;
  },
});

// Also save after status updates
export function recordInitiativeExecutionWithSave(
  initiativeId: string,
  result: string
): boolean {
  const success = recordInitiativeExecution(initiativeId, result);
  if (success) saveInitiatives();
  return success;
}

export function deactivateInitiativeWithSave(initiativeId: string): boolean {
  const success = deactivateInitiative(initiativeId);
  if (success) saveInitiatives();
  return success;
}
