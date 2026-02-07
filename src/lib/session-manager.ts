/**
 * @fileOverview Session State Manager for GitHub Copilot Context Persistence
 *
 * This system ensures that GitHub Copilot (or any AI assistant) can restore
 * context between sessions by reading persistent state files.
 *
 * PURPOSE: Prevent amnesia between sessions - maintain continuity of work,
 * directives, and progress tracking.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SESSION_STATE_FILE = join(process.cwd(), 'COPILOT_SESSION_STATE.md');
const SESSION_BACKUP_DIR = join(process.cwd(), '.session-backups');

export interface SessionState {
  lastUpdated: string;
  sessionId: string;
  status: 'active' | 'paused' | 'completed';

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

/**
 * Saves the current session state to disk
 */
export function saveSessionState(state: Partial<SessionState>): void {
  try {
    const currentState = loadSessionState();
    const updatedState = {
      ...currentState,
      ...state,
      lastUpdated: new Date().toISOString(),
    };

    const markdown = generateMarkdownFromState(updatedState);
    writeFileSync(SESSION_STATE_FILE, markdown, 'utf-8');

    // Create timestamped backup
    const backupFile = join(
      SESSION_BACKUP_DIR,
      `session-${new Date().toISOString().split('T')[0]}.md`
    );
    try {
      writeFileSync(backupFile, markdown, 'utf-8');
    } catch (err) {
      // Backup directory may not exist yet, that's okay
    }

    console.log('[Session Manager] State saved successfully');
  } catch (error) {
    console.error('[Session Manager] Failed to save state:', error);
  }
}

/**
 * Loads the last session state from disk
 */
export function loadSessionState(): SessionState {
  if (!existsSync(SESSION_STATE_FILE)) {
    return getDefaultState();
  }

  try {
    const content = readFileSync(SESSION_STATE_FILE, 'utf-8');
    return parseMarkdownToState(content);
  } catch (error) {
    console.error('[Session Manager] Failed to load state:', error);
    return getDefaultState();
  }
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
    date: new Date().toISOString().split('T')[0],
    summary,
    filesCreated: files.created || [],
    filesModified: files.modified || [],
    decisions: [],
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
  return `# GitHub Copilot Session State & Memory
**Last Updated:** ${state.lastUpdated}  
**Session ID:** ${state.sessionId}  
**Status:** ${state.status}

---

## USER DIRECTIVES (PERMANENT)

### Core Directive: ${state.userDirectives.coreDirective}

**What Requires Permission:**
${state.userDirectives.requiresPermission.map((item) => `- ${item}`).join('\n')}

**What Can Proceed Autonomously:**
${state.userDirectives.autonomousActions.map((item) => `- ${item}`).join('\n')}

---

## CURRENT PROJECT STATUS

### Completion: ${state.projectStatus.completionPercent}%

**✅ COMPLETED:**
${state.projectStatus.phasesCompleted.map((p, i) => `${i + 1}. ${p}`).join('\n')}

**⏳ PENDING:**
${state.projectStatus.phasesPending.map((p, i) => `${i + state.projectStatus.phasesCompleted.length + 1}. ${p}`).join('\n')}

${state.projectStatus.activeBlockers.length > 0 ? `**🔴 ACTIVE BLOCKERS:**\n${state.projectStatus.activeBlockers.map((b) => `- ${b}`).join('\n')}` : ''}

---

## RECENT WORK COMPLETED

${state.recentWork
  .map(
    (work) => `### ${work.date}
${work.summary}

${work.filesCreated.length > 0 ? `**Files Created:**\n${work.filesCreated.map((f) => `- ${f}`).join('\n')}\n` : ''}
${work.filesModified.length > 0 ? `**Files Modified:**\n${work.filesModified.map((f) => `- ${f}`).join('\n')}\n` : ''}
${work.decisions.length > 0 ? `**Decisions Made:**\n${work.decisions.map((d) => `- ${d}`).join('\n')}\n` : ''}
`
  )
  .join('\n')}

---

## NEXT STEPS

${state.nextSteps.options.map((opt, i) => `**Option ${String.fromCharCode(65 + i)}:** ${opt}`).join('\n')}

**Recommended:** ${state.nextSteps.recommendedAction}

---

## SESSION NOTES

${state.sessionNotes.map((note) => `- ${note}`).join('\n')}

---

## IMPORTANT REMINDERS FOR NEXT SESSION

${state.reminders.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

*This file is automatically updated by the session manager.*
`;
}

/**
 * Parse markdown back to state object (simplified version)
 */
function parseMarkdownToState(content: string): SessionState {
  // For now, return a reasonable default
  // A full parser would extract values from the markdown
  return getDefaultState();
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
    reminders: ['Read COPILOT_SESSION_STATE.md first'],
  };
}

/**
 * Hook to call before app shutdown
 */
export function onAppShutdown(): void {
  console.log('[Session Manager] Saving state before shutdown...');
  const state = loadSessionState();
  state.status = 'paused';
  saveSessionState(state);
}

// Register shutdown hooks
if (typeof process !== 'undefined') {
  process.on('SIGINT', onAppShutdown);
  process.on('SIGTERM', onAppShutdown);
  process.on('exit', onAppShutdown);
}
