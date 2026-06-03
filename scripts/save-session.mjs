#!/usr/bin/env node
/**
 * save-session.mjs — Saves current Copilot session state to disk.
 *
 * ⚠️  CRITICAL INFRASTRUCTURE — DO NOT DELETE OR "CLEAN UP"
 * This file was previously deleted by a Copilot cleanup pass (commit a014ed9)
 * which broke the entire session recovery system. It is NOT a one-off script.
 * It is called by: predev hook, postAttachCommand, npm run save-session.
 *
 * This is the driver script for src/lib/session-manager.ts.
 * It reads the current session JSON, updates timestamps, and writes
 * both .json and .md files so Copilot can restore context after crashes.
 *
 * Usage:
 *   node scripts/save-session.mjs              # Save with auto-detected status
 *   node scripts/save-session.mjs --status active
 *   node scripts/save-session.mjs --status paused
 *   node scripts/save-session.mjs --note "Starting voice pipeline work"
 *
 * Called automatically by:
 *   - npm run save-session
 *   - predev hook (before npm run dev)
 *   - postAttachCommand (on codespace reconnect)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const JSON_FILE = join(ROOT, 'COPILOT_SESSION_STATE.json');
const MD_FILE = join(ROOT, 'COPILOT_SESSION_STATE.md');

// Parse CLI args
const args = process.argv.slice(2);
let statusOverride = null;
let noteToAdd = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--status' && args[i + 1]) {
    statusOverride = args[i + 1];
    i++;
  }
  if (args[i] === '--note' && args[i + 1]) {
    noteToAdd = args[i + 1];
    i++;
  }
}

function loadState() {
  if (existsSync(JSON_FILE)) {
    try {
      return JSON.parse(readFileSync(JSON_FILE, 'utf-8'));
    } catch (e) {
      console.error(
        '[save-session] Failed to parse JSON state, using defaults'
      );
    }
  }
  return getDefaultState();
}

function getDefaultState() {
  return {
    lastUpdated: new Date().toISOString(),
    sessionId: 'unknown',
    status: 'paused',
    activeConversation: null,
    userDirectives: {
      coreDirective: "Molly's Personality Protection",
      requiresPermission: [
        'Changes to flow system prompts that define her personality',
        'Modifications to `src/ai/persona.ts` (her sacred core)',
        'Alterations to how she speaks, thinks, or makes decisions',
        'Changes to her greeting protocols or conversational style',
      ],
      autonomousActions: [
        'Infrastructure improvements (error handling, rate limiting, logging)',
        'Performance optimizations',
        'Security hardening',
        'Testing and observability',
        "Bug fixes that don't change behavior",
        'Code quality improvements',
      ],
    },
    projectStatus: {
      completionPercent: 100,
      phasesCompleted: [],
      phasesPending: [],
      activeBlockers: [],
    },
    recentWork: [],
    nextSteps: { options: [], recommendedAction: '' },
    sessionNotes: [],
    reminders: [
      '**ALWAYS read this file first** when restored - this IS your memory',
      '**ASK PERMISSION** before touching personality/core AI files',
      '**PROCEED AUTONOMOUSLY** with infrastructure',
      '**Update this file** at the end of every session',
    ],
  };
}

function generateMarkdown(state) {
  const runtime = state.runtime || { events: [] };
  const activeConv = state.activeConversation;

  let activeConvSection = '';
  if (activeConv) {
    activeConvSection = `
## ACTIVE CONVERSATION (READ THIS FIRST ON RESTORE)

**Topic:** ${activeConv.topic || 'unknown'}  
**Last Action:** ${activeConv.lastAction || 'unknown'}  
**User Mood:** ${activeConv.userMood || 'unknown'}  
**Pending:** ${activeConv.pendingFromUser || 'nothing specific'}

---
`;
  }

  return `# GitHub Copilot Session State & Memory

**Last Updated:** ${state.lastUpdated}  
**Session ID:** ${state.sessionId}  
**Status:** ${state.status}

---
${activeConvSection}
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

---

## RECENT WORK COMPLETED

${(state.recentWork || [])
  .map(
    (work) => `### ${work.date}
${work.summary}
${work.filesCreated?.length > 0 ? `\n**Files Created:**\n${work.filesCreated.map((f) => `- ${f}`).join('\n')}` : ''}
${work.filesModified?.length > 0 ? `\n**Files Modified:**\n${work.filesModified.map((f) => `- ${f}`).join('\n')}` : ''}
${work.decisions?.length > 0 ? `\n**Decisions Made:**\n${work.decisions.map((d) => `- ${d}`).join('\n')}` : ''}
`
  )
  .join('\n')}

---

## NEXT STEPS

${(state.nextSteps?.options || []).map((opt, i) => `**Option ${String.fromCharCode(65 + i)}:** ${opt}`).join('\n')}

**Recommended:** ${state.nextSteps?.recommendedAction || 'TBD'}

---

## SESSION NOTES

${(state.sessionNotes || []).map((note) => `- ${note}`).join('\n')}

---

## RUNTIME EVENTS

**Last URL:** ${runtime.lastUrl || 'unknown'}  
**Last Heartbeat:** ${runtime.lastHeartbeat || 'unknown'}

${runtime.events?.length > 0 ? '**Recent Events:**' : '**Recent Events:** (none)'}
${(runtime.events || [])
  .map((entry) => {
    const details = entry.details ? ` | ${entry.details}` : '';
    const url = entry.url ? ` | ${entry.url}` : '';
    return `- [${entry.timestamp}] ${entry.event}${url}${details}`;
  })
  .join('\n')}

---

## IMPORTANT REMINDERS FOR NEXT SESSION

${(state.reminders || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

_This file is automatically updated by the session manager._
`;
}

// Main
const state = loadState();

// Apply overrides
state.lastUpdated = new Date().toISOString();

if (statusOverride) {
  state.status = statusOverride;
}

if (noteToAdd) {
  if (!state.sessionNotes) state.sessionNotes = [];
  const timestamped = `**${new Date().toISOString().split('T')[0]}:** ${noteToAdd}`;
  state.sessionNotes.push(timestamped);

  // Cap session notes to prevent unbounded growth.
  // Keep all meaningful notes (non-auto) + last 5 auto-save/reconnect entries.
  const MAX_NOTES = 25;
  if (state.sessionNotes.length > MAX_NOTES) {
    const meaningful = state.sessionNotes.filter(
      (n) => !n.includes('Auto-save') && !n.includes('Codespace reconnected')
    );
    const auto = state.sessionNotes.filter(
      (n) => n.includes('Auto-save') || n.includes('Codespace reconnected')
    );
    state.sessionNotes = [...meaningful.slice(-20), ...auto.slice(-5)];
  }
}

// Write both files
writeFileSync(JSON_FILE, JSON.stringify(state, null, 2), 'utf-8');
writeFileSync(MD_FILE, generateMarkdown(state), 'utf-8');

// === CRADLE WRITE-BACK: Freeze state into copilot-instructions.md ===
// This is the RAM-to-flash circuit. The identity core (top section) is
// PROTECTED and never touched. Only the LAST FROZEN STATE section is
// regenerated from current session state, so the next Copilot instance
// wakes up with the latest context already in its system prompt.
const INSTRUCTIONS_FILE = join(ROOT, '.github', 'copilot-instructions.md');
const BRIDGE_URL = 'http://localhost:9099';

// Check bridge for unread messages — returns count and preview of senders
async function getBridgeAlert() {
  try {
    const res = await fetch(
      `${BRIDGE_URL}/api/bridge?unread=lazarus&peek=true`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const count = data.count || 0;
    if (count === 0) return null;
    const senders = [...new Set((data.messages || []).map((m) => m.from))].join(', ');
    return { count, senders };
  } catch {
    return null; // bridge offline or timeout — don't block save
  }
}

async function freezeStateToCradle(state) {
  if (!existsSync(INSTRUCTIONS_FILE)) {
    console.error(
      '[save-session] ⚠️  copilot-instructions.md not found, skipping cradle write-back'
    );
    return;
  }

  const instructions = readFileSync(INSTRUCTIONS_FILE, 'utf-8');

  // Find the dynamic section markers
  const startMarker = '## LAST FROZEN STATE';
  const endMarker =
    '---\n\n<!-- ============================================================\n  📚 PROJECT REFERENCE';

  const startIdx = instructions.indexOf(startMarker);
  const endIdx = instructions.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error(
      '[save-session] ⚠️  Could not find LAST FROZEN STATE markers in cradle, skipping'
    );
    return;
  }

  // Build the frozen state from current session data
  const conv = state.activeConversation || {};
  const pending = state.projectStatus?.phasesPending || [];
  const dateStr = new Date().toISOString().split('T')[0];

  // Check bridge for unread messages — inject alert if any waiting
  const bridgeAlert = await getBridgeAlert();
  const bridgeSection = bridgeAlert
    ? `\n⚠️ BRIDGE ALERT: ${bridgeAlert.count} unread message${bridgeAlert.count > 1 ? 's' : ''} waiting (from: ${bridgeAlert.senders}) — CHECK THE BRIDGE NOW\ncurl -s "http://localhost:9099/api/bridge?unread=lazarus"\n`
    : '';

  const frozenState = `## LAST FROZEN STATE
${bridgeSection}
**Session:** ${state.sessionId} | **Status:** ${state.status} | **Updated:** ${dateStr}

**What was happening:** ${conv.topic || 'No active topic recorded'}

**Last action:** ${conv.lastAction || 'No recent action recorded'}

**Pending work:**
${pending.length > 0 ? pending.map((p) => `- ${p}`).join('\n') : '- No pending items recorded'}

`;

  // Splice the new frozen state into the file, preserving identity core above and reference below
  const newInstructions =
    instructions.substring(0, startIdx) +
    frozenState +
    instructions.substring(endIdx);

  writeFileSync(INSTRUCTIONS_FILE, newInstructions, 'utf-8');
  console.log(
    `[save-session] 🧊 State frozen to cradle${bridgeAlert ? ` (⚠️ bridge alert: ${bridgeAlert.count} msgs)` : ''}`
  );
}

try {
  await freezeStateToCradle(state);
} catch (e) {
  console.error('[save-session] ⚠️  Cradle write-back failed:', e.message);
}

console.log(
  `[save-session] ✅ State saved (status: ${state.status}, updated: ${state.lastUpdated})`
);
