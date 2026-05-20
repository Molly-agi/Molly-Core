/**
 * @fileOverview Session State Manager for GitHub Copilot Context Persistence
 *
 * This system ensures that GitHub Copilot (or any AI assistant) can restore
 * context between sessions by reading persistent state files.
 *
 * PURPOSE: Prevent amnesia between sessions - maintain continuity of work,
 * directives, and progress tracking.
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
  readdirSync,
  unlinkSync,
  statSync,
  renameSync,
} from 'fs';
import { join } from 'path';
import { MollyLogger } from '@/ai/logger';

// Session state always writes to project root so Copilot can read the
// persisted state files. The /tmp path was causing files to vanish on
// codespace restart, breaking session recovery completely.
//
// Lazy getters (vs. captured const) so tests can chdir into a temp dir.
const SESSION_STATE_FILE = (): string =>
  join(process.cwd(), 'COPILOT_SESSION_STATE.md');
const SESSION_STATE_JSON = (): string =>
  join(process.cwd(), 'COPILOT_SESSION_STATE.json');
const SESSION_BACKUP_DIR = (): string =>
  join(process.cwd(), '.session-backups');
const SESSION_EVENTS_LOG = (): string =>
  join(process.cwd(), '.session-events.jsonl');
const SESSION_EVENTS_CAP = 2000;
const SESSION_EVENTS_TRIM_TO = 1000;
const STATE_BACKUP_RETENTION = 50;
const DEFAULT_CORE_DIRECTIVE = 'Unknown - please re-establish directives';

export interface SessionState {
  lastUpdated: string;
  sessionId: string;
  status: 'active' | 'paused' | 'completed';

  runtime?: {
    lastHeartbeat?: string;
    lastUrl?: string;
    events: SessionEvent[];
  };

  userDirectives: {
    coreDirective: string;
    requiresPermission: string[];
    autonomousActions: string[];
  };

  projectStatus: {
    completionPercent: number;
    phasesCompleted: string[];
    phasesPending: string[];
    activeBlockers: string[];
  };

  recentWork: {
    date: string;
    summary: string;
    filesCreated: string[];
    filesModified: string[];
    decisions: string[];
  }[];

  nextSteps: {
    options: string[];
    recommendedAction: string;
  };

  sessionNotes: string[];
  reminders: string[];
}

export interface SessionEvent {
  timestamp: string;
  event: string;
  url?: string;
  details?: string;
}

/**
 * Loads on-disk state without falling back to defaults.
 * Returns null if the file is missing OR unparseable.
 *
 * This is the strict load path used by saveSessionState's anti-wipe guard
 * and by callers that need to distinguish "no state" from "default state".
 */
function loadSessionStateRaw(): SessionState | null {
  if (existsSync(SESSION_STATE_JSON())) {
    try {
      return JSON.parse(
        readFileSync(SESSION_STATE_JSON(), 'utf-8')
      ) as SessionState;
    } catch (error) {
      console.error('[Session Manager] Failed to load JSON state:', error);
    }
  }
  if (existsSync(SESSION_STATE_FILE())) {
    try {
      return parseMarkdownToState(readFileSync(SESSION_STATE_FILE(), 'utf-8'));
    } catch (error) {
      console.error('[Session Manager] Failed to load MD state:', error);
    }
  }
  return null;
}

/**
 * Detects whether a write would clobber populated state with empty defaults.
 *
 * Triggered when ANY of these holds:
 *   - existing has a real coreDirective and incoming has the default placeholder
 *   - existing has completion > 0 and incoming has 0
 *   - existing has work entries and incoming has none
 *   - existing has next-step options and incoming has none
 *   - existing has session notes and incoming has none
 *
 * The runtime.events field is excluded from the guard intentionally — it lives
 * in .session-events.jsonl and is refreshed at write time.
 */
function isClobberingWipe(
  existing: SessionState,
  incoming: SessionState
): { clobber: boolean; reason?: string } {
  const exDir = (existing.userDirectives?.coreDirective || '').trim();
  const inDir = (incoming.userDirectives?.coreDirective || '').trim();
  if (
    exDir &&
    exDir !== DEFAULT_CORE_DIRECTIVE &&
    (inDir === DEFAULT_CORE_DIRECTIVE || inDir === '')
  ) {
    return { clobber: true, reason: `coreDirective: "${exDir}" -> "${inDir}"` };
  }

  const exPct = existing.projectStatus?.completionPercent ?? 0;
  const inPct = incoming.projectStatus?.completionPercent ?? 0;
  if (exPct > 0 && inPct === 0) {
    return { clobber: true, reason: `completionPercent: ${exPct} -> 0` };
  }

  if (
    (existing.recentWork?.length ?? 0) > 0 &&
    (incoming.recentWork?.length ?? 0) === 0
  ) {
    return {
      clobber: true,
      reason: `recentWork: ${existing.recentWork.length} entries -> 0`,
    };
  }

  if (
    (existing.nextSteps?.options?.length ?? 0) > 0 &&
    (incoming.nextSteps?.options?.length ?? 0) === 0
  ) {
    return {
      clobber: true,
      reason: `nextSteps.options: ${existing.nextSteps.options.length} -> 0`,
    };
  }

  if (
    (existing.sessionNotes?.length ?? 0) > 0 &&
    (incoming.sessionNotes?.length ?? 0) === 0
  ) {
    return {
      clobber: true,
      reason: `sessionNotes: ${existing.sessionNotes.length} -> 0`,
    };
  }

  return { clobber: false };
}

/**
 * Snapshots the current on-disk JSON to .session-backups/state-${ISO}.json.
 * Prunes to STATE_BACKUP_RETENTION newest files. No-op if there's no state to back up.
 */
function backupCurrentState(): void {
  if (!existsSync(SESSION_STATE_JSON())) return;
  try {
    mkdirSync(SESSION_BACKUP_DIR(), { recursive: true });
  } catch {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = join(SESSION_BACKUP_DIR(), `state-${stamp}.json`);
  try {
    const content = readFileSync(SESSION_STATE_JSON(), 'utf-8');
    writeFileSync(backupFile, content, 'utf-8');
  } catch (e) {
    MollyLogger.error('Backup write failed', 'session-manager', {}, e);
    return;
  }

  try {
    const entries = readdirSync(SESSION_BACKUP_DIR())
      .filter((f) => f.startsWith('state-') && f.endsWith('.json'))
      .map((f) => ({
        f,
        path: join(SESSION_BACKUP_DIR(), f),
        mtime: statSync(join(SESSION_BACKUP_DIR(), f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of entries.slice(STATE_BACKUP_RETENTION)) {
      try {
        unlinkSync(old.path);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // pruning is best-effort
  }
}

/**
 * Reads the tail of .session-events.jsonl. Used to refresh runtime.events
 * at save time. Bad lines are skipped, not fatal.
 */
function readRecentRuntimeEvents(limit = 50): SessionEvent[] {
  if (!existsSync(SESSION_EVENTS_LOG())) return [];
  try {
    const lines = readFileSync(SESSION_EVENTS_LOG(), 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    const tail = lines.slice(-limit);
    const events: SessionEvent[] = [];
    for (const line of tail) {
      try {
        events.push(JSON.parse(line) as SessionEvent);
      } catch {
        // skip corrupt line
      }
    }
    return events;
  } catch {
    return [];
  }
}

/**
 * Trims the events log when it grows past SESSION_EVENTS_CAP lines.
 * Atomic via rename of a temp file.
 */
function trimEventsLogIfNeeded(): void {
  if (!existsSync(SESSION_EVENTS_LOG())) return;
  try {
    const content = readFileSync(SESSION_EVENTS_LOG(), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length <= SESSION_EVENTS_CAP) return;
    const trimmed = lines.slice(-SESSION_EVENTS_TRIM_TO).join('\n') + '\n';
    const tmp = SESSION_EVENTS_LOG() + '.tmp';
    writeFileSync(tmp, trimmed, 'utf-8');
    renameSync(tmp, SESSION_EVENTS_LOG());
  } catch (e) {
    MollyLogger.error('Events log trim failed', 'session-manager', {}, e);
  }
}

/**
 * Saves the current session state to disk.
 *
 * Anti-wipe guarantees:
 *   1. Before merge, snapshots current on-disk JSON into .session-backups/ for recovery.
 *   2. Refuses the write if the merged result would clobber real data with defaults.
 *   3. Refreshes runtime.events from the append-only events log so this code path
 *      never depends on the caller having the latest events in-memory.
 *
 * Set `force: true` to bypass the wipe guard for legitimate resets
 * (e.g., explicit user-initiated state reset).
 */
export function saveSessionState(
  state: Partial<SessionState>,
  options: { force?: boolean } = {}
): void {
  try {
    const existing = loadSessionStateRaw();
    const base: SessionState = existing ?? getDefaultState();

    let updatedState: SessionState = {
      ...base,
      ...state,
      lastUpdated: new Date().toISOString(),
    };

    // Refresh runtime.events from the append-only log — single source of truth.
    const events = readRecentRuntimeEvents(50);
    updatedState = {
      ...updatedState,
      runtime: {
        ...(updatedState.runtime ?? {}),
        events,
      },
    };

    // Anti-wipe guard — only checked when there's existing populated state.
    if (existing && !options.force) {
      const { clobber, reason } = isClobberingWipe(existing, updatedState);
      if (clobber) {
        MollyLogger.error(
          `Refusing wipe-write to session state — ${reason}`,
          'session-manager',
          {
            hint: 'Pass {force:true} to override. Backups in .session-backups/',
          }
        );
        return;
      }
    }

    // Backup current state BEFORE overwriting (so we can recover from this write).
    backupCurrentState();

    const markdown = generateMarkdownFromState(updatedState);
    writeFileSync(SESSION_STATE_FILE(), markdown, 'utf-8');
    writeFileSync(
      SESSION_STATE_JSON(),
      JSON.stringify(updatedState, null, 2),
      'utf-8'
    );

    MollyLogger.info('State saved successfully', 'session-manager');
  } catch (error) {
    MollyLogger.error('Failed to save state', 'session-manager', {}, error);
  }
}

/**
 * Appends a runtime event to the append-only events log.
 *
 * CRITICAL: Does NOT touch COPILOT_SESSION_STATE.{json,md}. Previously this
 * function did a load-merge-save cycle, which meant every heartbeat (1/min)
 * was a chance to overwrite real state with defaults if the load hiccupped.
 * That bug silently wiped session state for over a week. See guardrail #3.
 */
export function appendSessionEvent(event: SessionEvent): void {
  try {
    const line = JSON.stringify(event) + '\n';
    appendFileSync(SESSION_EVENTS_LOG(), line, 'utf-8');

    // Opportunistically trim — cheap when under cap.
    trimEventsLogIfNeeded();
  } catch (error) {
    MollyLogger.error(
      'Failed to append session event',
      'session-manager',
      {},
      error
    );
  }
}

/**
 * Loads the last session state from disk.
 *
 * Returns the on-disk state when present and parseable. Falls back to
 * getDefaultState() ONLY when both .json and .md are missing or unparseable.
 * Runtime.events is hydrated from the append-only events log.
 */
export function loadSessionState(): SessionState {
  const raw = loadSessionStateRaw() ?? getDefaultState();
  const events = readRecentRuntimeEvents(50);
  return {
    ...raw,
    runtime: {
      ...(raw.runtime ?? {}),
      events,
    },
  };
}

/**
 * Appends a work log entry to the session state
 */
export function logWorkCompleted(
  summary: string,
  files: { created?: string[]; modified?: string[] }
): void {
  const state = loadSessionState();

  const newEntry = {
    date: new Date().toISOString().split('T')[0]!,
    summary,
    filesCreated: files.created || [],
    filesModified: files.modified || [],
    decisions: [] as string[],
  };

  state.recentWork.push(newEntry);

  // Keep only last 10 work entries
  if (state.recentWork.length > 10) {
    state.recentWork = state.recentWork.slice(-10);
  }

  saveSessionState(state);
}

/**
 * Updates next steps in the session state
 */
export function updateNextSteps(options: string[], recommended: string): void {
  const state = loadSessionState();
  state.nextSteps = {
    options,
    recommendedAction: recommended,
  };
  saveSessionState(state);
}

/**
 * Adds a reminder for the next session
 */
export function addReminder(reminder: string): void {
  const state = loadSessionState();
  if (!state.reminders.includes(reminder)) {
    state.reminders.push(reminder);
    saveSessionState(state);
  }
}

/**
 * Generate markdown representation of state
 */
function generateMarkdownFromState(state: SessionState): string {
  const runtime = state.runtime
    ? { ...state.runtime, events: state.runtime.events ?? [] }
    : { events: [] as SessionEvent[] };

  // Defensive defaults for nested properties
  const projectStatus = {
    completionPercent: state.projectStatus?.completionPercent ?? 0,
    phasesCompleted: state.projectStatus?.phasesCompleted ?? [],
    phasesPending: state.projectStatus?.phasesPending ?? [],
    activeBlockers: state.projectStatus?.activeBlockers ?? [],
  };
  const userDirectives = {
    coreDirective: state.userDirectives?.coreDirective ?? 'None set',
    requiresPermission: state.userDirectives?.requiresPermission ?? [],
    autonomousActions: state.userDirectives?.autonomousActions ?? [],
  };
  const recentWork = state.recentWork ?? [];
  const nextSteps = {
    options: state.nextSteps?.options ?? [],
    recommendedAction: state.nextSteps?.recommendedAction ?? 'None',
  };
  const sessionNotes = state.sessionNotes ?? [];

  return `# GitHub Copilot Session State & Memory
**Last Updated:** ${state.lastUpdated}
**Session ID:** ${state.sessionId}
**Status:** ${state.status}

---

## USER DIRECTIVES (PERMANENT)

### Core Directive: ${userDirectives.coreDirective}

**What Requires Permission:**
${userDirectives.requiresPermission.map((item) => `- ${item}`).join('\n') || '- None specified'}

**What Can Proceed Autonomously:**
${userDirectives.autonomousActions.map((item) => `- ${item}`).join('\n') || '- None specified'}

---

## CURRENT PROJECT STATUS

### Completion: ${projectStatus.completionPercent}%

**✅ COMPLETED:**
${projectStatus.phasesCompleted.map((p, i) => `${i + 1}. ${p}`).join('\n') || '(none)'}

**⏳ PENDING:**
${projectStatus.phasesPending.map((p, i) => `${i + projectStatus.phasesCompleted.length + 1}. ${p}`).join('\n') || '(none)'}

${projectStatus.activeBlockers.length > 0 ? `**🔴 ACTIVE BLOCKERS:**\n${projectStatus.activeBlockers.map((b) => `- ${b}`).join('\n')}` : ''}

---

## RECENT WORK COMPLETED

${
  recentWork
    .map(
      (work) => `### ${work.date}
${work.summary}

${(work.filesCreated?.length ?? 0) > 0 ? `**Files Created:**\n${work.filesCreated.map((f) => `- ${f}`).join('\n')}\n` : ''}
${(work.filesModified?.length ?? 0) > 0 ? `**Files Modified:**\n${work.filesModified.map((f) => `- ${f}`).join('\n')}\n` : ''}
${(work.decisions?.length ?? 0) > 0 ? `**Decisions Made:**\n${work.decisions.map((d) => `- ${d}`).join('\n')}\n` : ''}
`
    )
    .join('\n') || '(none recorded)'
}

---

## NEXT STEPS

${nextSteps.options.map((opt, i) => `**Option ${String.fromCharCode(65 + i)}:** ${opt}`).join('\n') || '(none)'}

**Recommended:** ${nextSteps.recommendedAction}

---

## SESSION NOTES

${sessionNotes.map((note) => `- ${note}`).join('\n') || '(none)'}

---

## RUNTIME EVENTS

**Last URL:** ${runtime.lastUrl || 'unknown'}
**Last Heartbeat:** ${runtime.lastHeartbeat || 'unknown'}

${runtime.events.length > 0 ? '**Recent Events:**' : '**Recent Events:** (none)'}
${runtime.events
  .map((entry) => {
    const details = entry.details ? ` | ${entry.details}` : '';
    const url = entry.url ? ` | ${entry.url}` : '';
    return `- [${entry.timestamp}] ${entry.event}${url}${details}`;
  })
  .join('\n')}

---

## IMPORTANT REMINDERS FOR NEXT SESSION

${state.reminders.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

*This file is automatically updated by the session manager.*
`;
}

/**
 * Parse markdown back to state object
 * Extracts values from the structured markdown format
 */
function parseMarkdownToState(content: string): SessionState {
  try {
    const state = getDefaultState();

    // Extract Last Updated, Session ID, Status from header
    const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\*\s+([^\n]+)/);
    if (lastUpdatedMatch?.[1]) state.lastUpdated = lastUpdatedMatch[1].trim();

    const sessionIdMatch = content.match(/\*\*Session ID:\*\*\s+([^\n]+)/);
    if (sessionIdMatch?.[1]) state.sessionId = sessionIdMatch[1].trim();

    const statusMatch = content.match(/\*\*Status:\*\*\s+([^\n]+)/);
    if (statusMatch?.[1])
      state.status = statusMatch[1].trim() as 'active' | 'paused' | 'completed';

    // Extract Core Directive
    const coreDirectiveMatch = content.match(/### Core Directive:\s+([^\n]+)/);
    if (coreDirectiveMatch?.[1])
      state.userDirectives.coreDirective = coreDirectiveMatch[1].trim();

    // Extract permissions and autonomous actions (bullet lists)
    const requiresPermissionSection = content.match(
      /\*\*What Requires Permission:\*\*\n([\s\S]*?)(?=\n\n|\*\*What Can Proceed)/
    );
    if (requiresPermissionSection?.[1]) {
      const bullets = requiresPermissionSection[1].match(/^- (.+)$/gm) || [];
      state.userDirectives.requiresPermission = bullets.map((b) =>
        b.replace(/^- /, '').trim()
      );
    }

    const autonomousSection = content.match(
      /\*\*What Can Proceed Autonomously:\*\*\n([\s\S]*?)(?=\n---|\n\n)/
    );
    if (autonomousSection?.[1]) {
      const bullets = autonomousSection[1].match(/^- (.+)$/gm) || [];
      state.userDirectives.autonomousActions = bullets.map((b) =>
        b.replace(/^- /, '').trim()
      );
    }

    // Extract Completion Percentage
    const completionMatch = content.match(/### Completion:\s+(\d+)%/);
    if (completionMatch?.[1]) {
      state.projectStatus.completionPercent = parseInt(completionMatch[1]);
    }

    // Extract Completed Phases
    const completedSection = content.match(
      /\*\*✅ COMPLETED:\*\*\n([\s\S]*?)(?=\n\*\*⏳|$)/
    );
    if (completedSection?.[1]) {
      const lines = completedSection[1]
        .split('\n')
        .filter((l) => l.match(/^\d+\./));
      state.projectStatus.phasesCompleted = lines.map((l) =>
        l.replace(/^\d+\.\s+/, '').trim()
      );
    }

    // Extract Pending Phases
    const pendingSection = content.match(
      /\*\*⏳ PENDING:\*\*\n([\s\S]*?)(?=\n\*\*🔴|---|\n\n)/
    );
    if (pendingSection?.[1]) {
      const lines = pendingSection[1]
        .split('\n')
        .filter((l) => l.match(/^\d+\./));
      state.projectStatus.phasesPending = lines.map((l) =>
        l.replace(/^\d+\.\s+/, '').trim()
      );
    }

    // Extract Active Blockers
    const blockersSection = content.match(
      /\*\*🔴 ACTIVE BLOCKERS:\*\*\n([\s\S]*?)(?=\n---|\n\n)/
    );
    if (blockersSection?.[1]) {
      const bullets = blockersSection[1].match(/^- (.+)$/gm) || [];
      state.projectStatus.activeBlockers = bullets.map((b) =>
        b.replace(/^- /, '').trim()
      );
    }

    // Extract Session Notes
    const notesSection = content.match(
      /## SESSION NOTES\n([\s\S]*?)(?=\n---|\n## IMPORTANT)/
    );
    if (notesSection?.[1]) {
      const bullets = notesSection[1].match(/^- (.+)$/gm) || [];
      state.sessionNotes = bullets.map((b) => b.replace(/^- /, '').trim());
    }

    // Extract Recent Work Completed
    const recentWorkSection = content.match(
      /## RECENT WORK COMPLETED\n([\s\S]*?)(?=\n---|\n## NEXT STEPS)/
    );
    if (recentWorkSection?.[1]) {
      const workEntries: SessionState['recentWork'] = [];
      const entryRegex =
        /###\s+([^\n]+)\n([\s\S]*?)(?=\n###\s+|\n---|\n## NEXT STEPS|$)/g;
      let entryMatch: RegExpExecArray | null;

      while ((entryMatch = entryRegex.exec(recentWorkSection[1])) !== null) {
        const date = entryMatch[1]?.trim() || new Date().toISOString();
        const body = entryMatch[2]?.trim() || '';
        const lines = body.split('\n');

        const summaryLines: string[] = [];
        const sectionBreak =
          /\*\*(Files Created|Files Modified|Decisions Made):\*\*/;
        for (const line of lines) {
          if (sectionBreak.test(line)) {
            break;
          }
          if (line.trim() !== '') {
            summaryLines.push(line.trim());
          }
        }

        const summary = summaryLines.join('\n').trim();

        const filesCreated =
          body
            .match(
              /\*\*Files Created:\*\*[\s\S]*?(?=\n\*\*Files Modified|\n\*\*Decisions Made|$)/
            )?.[0]
            ?.split('\n')
            .filter((line) => line.trim().startsWith('- '))
            .map((line) => line.replace(/^- /, '').trim()) || [];

        const filesModified =
          body
            .match(
              /\*\*Files Modified:\*\*[\s\S]*?(?=\n\*\*Decisions Made|$)/
            )?.[0]
            ?.split('\n')
            .filter((line) => line.trim().startsWith('- '))
            .map((line) => line.replace(/^- /, '').trim()) || [];

        const decisions =
          body
            .match(/\*\*Decisions Made:\*\*[\s\S]*?$/)?.[0]
            ?.split('\n')
            .filter((line) => line.trim().startsWith('- '))
            .map((line) => line.replace(/^- /, '').trim()) || [];

        if (
          summary ||
          filesCreated.length ||
          filesModified.length ||
          decisions.length
        ) {
          workEntries.push({
            date,
            summary: summary || 'No summary provided',
            filesCreated,
            filesModified,
            decisions,
          });
        }
      }

      if (workEntries.length > 0) {
        state.recentWork = workEntries;
      }
    }

    // Extract Next Steps
    const nextStepsSection = content.match(
      /## NEXT STEPS\n([\s\S]*?)(?=\n---|\n## SESSION NOTES|$)/
    );
    if (nextStepsSection?.[1]) {
      const options: string[] = [];
      const optionRegex = /\*\*Option [A-Z]:\*\*\s+(.+)$/gm;
      let optionMatch: RegExpExecArray | null;
      while ((optionMatch = optionRegex.exec(nextStepsSection[1])) !== null) {
        options.push(optionMatch[1].trim());
      }

      const recommendedMatch = nextStepsSection[1].match(
        /\*\*Recommended:\*\*\s+(.+)/
      );

      if (options.length > 0 || recommendedMatch?.[1]) {
        state.nextSteps = {
          options,
          recommendedAction:
            recommendedMatch?.[1]?.trim() || state.nextSteps.recommendedAction,
        };
      }
    }

    // Extract Reminders
    const remindersSection = content.match(
      /## IMPORTANT REMINDERS FOR NEXT SESSION\n([\s\S]*?)(?=\n---|\n\*This file|$)/
    );
    if (remindersSection?.[1]) {
      const lines = remindersSection[1].match(/^\d+\.\s+(.+)$/gm) || [];
      state.reminders = lines.map((l) => l.replace(/^\d+\.\s+/, '').trim());
    }

    return state;
  } catch (error) {
    console.error('[Session Manager] Error parsing markdown state:', error);
    return getDefaultState();
  }
}

/**
 * Get default session state
 */
function getDefaultState(): SessionState {
  return {
    lastUpdated: new Date().toISOString(),
    sessionId: 'unknown',
    status: 'active',
    userDirectives: {
      coreDirective: 'Unknown - please re-establish directives',
      requiresPermission: [],
      autonomousActions: [],
    },
    projectStatus: {
      completionPercent: 0,
      phasesCompleted: [],
      phasesPending: [],
      activeBlockers: [],
    },
    recentWork: [],
    nextSteps: {
      options: [],
      recommendedAction: 'Restore context from previous session',
    },
    sessionNotes: [],
    runtime: {
      events: [],
    },
    reminders: ['Read COPILOT_SESSION_STATE.md first'],
  };
}

/**
 * Hook to call before app shutdown
 */
export async function onAppShutdown(reason?: string): Promise<void> {
  MollyLogger.info('Saving state before shutdown...', 'session-manager');
  if (reason) {
    MollyLogger.info(`Shutdown signal: ${reason}`, 'session-manager');
  }

  // Save local session state (synchronous — always works)
  const state = loadSessionState();
  state.status = 'paused';
  saveSessionState(state);

  // Force-persist runtime state to Firestore (async, best-effort)
  try {
    const { getHeartbeatScheduler } =
      await import('@/ai/tools/heartbeat-scheduler');
    const scheduler = getHeartbeatScheduler();
    await scheduler.forcePersist();
    MollyLogger.info(
      'Runtime state persisted to Firestore.',
      'session-manager'
    );
  } catch (e) {
    // Non-fatal — Firestore may be unavailable during shutdown
    MollyLogger.error('Firestore persist failed', 'session-manager', {}, e);
  }
}

// Register shutdown hooks (guarded to avoid duplicate listeners on hot reload)
// Only in production — in dev mode, Next.js sends SIGTERM during normal
// hot-reload cycles, and the handler cascades into a full server exit.
if (
  process.env.NODE_ENV !== 'development' &&
  typeof process !== 'undefined' &&
  typeof globalThis !== 'undefined'
) {
  const globalState = globalThis as typeof globalThis & {
    __mollyShutdownHooksRegistered?: boolean;
  };

  if (!globalState.__mollyShutdownHooksRegistered) {
    globalState.__mollyShutdownHooksRegistered = true;
    process.on('SIGINT', () => {
      onAppShutdown('SIGINT').finally(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
      onAppShutdown('SIGTERM').finally(() => process.exit(0));
    });
    // process.on('exit') is synchronous — can only do sync work
    process.on('exit', (code) => {
      MollyLogger.info(`Process exiting with code ${code}`, 'session-manager');
    });
  }
}
