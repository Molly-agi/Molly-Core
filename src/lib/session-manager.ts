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

    // Extract Reminders
    const remindersSection = content.match(
      /## IMPORTANT REMINDERS FOR NEXT SESSION\n([\s\S]*?)(?=\n---|\n\*This file|$)/
    );
    if (remindersSection?.[1]) {
      const lines = remindersSection[1].match(/^\d+\.\s+(.+)$/gm) || [];
      state.reminders = lines.map((l) => l.replace(/^\d+\.\s+/, '').trim());
    }

    // Note: Recent work and next steps are complex; simplified here
    // Full implementation would parse the work entries table if needed

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
