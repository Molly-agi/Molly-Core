/**
 * @fileOverview Session Manager Tests — Anti-Wipe Guarantees
 *
 * These tests pin down the four locks added after the heart-patch wipe
 * silently corrupted COPILOT_SESSION_STATE for over a week:
 *   1. loadSessionStateRaw returns the real on-disk state (not defaults) when present
 *   2. saveSessionState refuses to overwrite populated data with empty defaults
 *   3. saveSessionState backs up the current state before each write
 *   4. appendSessionEvent writes only to .session-events.jsonl, never the JSON state
 *
 * Approach: chdir into a temp directory so the session-manager's process.cwd()
 * paths point at isolated fixture files.
 */

import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import os from 'os';

jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  loadSessionState,
  saveSessionState,
  appendSessionEvent,
  type SessionState,
} from '../session-manager';
import { MollyLogger } from '../../ai/logger';

const populatedState: SessionState = {
  lastUpdated: '2026-05-12T00:00:00.000Z',
  sessionId: 'test-session-001',
  status: 'active',
  userDirectives: {
    coreDirective: 'Real directive that must not be wiped',
    requiresPermission: ['touching persona.ts'],
    autonomousActions: ['refactoring tests'],
  },
  projectStatus: {
    completionPercent: 73,
    phasesCompleted: ['Phase 1', 'Phase 2'],
    phasesPending: ['Phase 3'],
    activeBlockers: [],
  },
  recentWork: [
    {
      date: '2026-05-12',
      summary: 'Hand-rolled HTTP primitives',
      filesCreated: ['src/ai/agency/tool-handlers/http-tools.ts'],
      filesModified: [],
      decisions: ['Block private hosts by default'],
    },
  ],
  nextSteps: {
    options: ['Port ANTHROPIC_BASE_URL', 'Hybrid memory taxonomy'],
    recommendedAction: 'Port ANTHROPIC_BASE_URL',
  },
  sessionNotes: ['Heart-patch race wiped state for a week'],
  reminders: ['Read COPILOT_SESSION_STATE.md first'],
  runtime: { events: [] },
};

describe('session-manager (anti-wipe guarantees)', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-session-test-'));
    process.chdir(testDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('load → save round-trip', () => {
    it('persists and returns populated state', () => {
      saveSessionState(populatedState);
      const loaded = loadSessionState();
      expect(loaded.userDirectives.coreDirective).toBe(
        'Real directive that must not be wiped'
      );
      expect(loaded.projectStatus.completionPercent).toBe(73);
      expect(loaded.recentWork).toHaveLength(1);
    });

    it('falls back to defaults only when no on-disk state exists', () => {
      const loaded = loadSessionState();
      expect(loaded.userDirectives.coreDirective).toBe(
        'Unknown - please re-establish directives'
      );
    });
  });

  describe('Lock #2: anti-wipe guard', () => {
    it('refuses to overwrite a real directive with the default placeholder', () => {
      saveSessionState(populatedState);

      // Simulate the bug: caller hands us a default-shaped state
      saveSessionState({
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
        nextSteps: { options: [], recommendedAction: '' },
        sessionNotes: [],
      });

      const after = loadSessionState();
      expect(after.userDirectives.coreDirective).toBe(
        'Real directive that must not be wiped'
      );
      expect(after.projectStatus.completionPercent).toBe(73);
      expect(after.recentWork).toHaveLength(1);
      expect(MollyLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Refusing wipe-write'),
        'session-manager',
        expect.any(Object)
      );
    });

    it('allows legitimate updates that do not clobber data', () => {
      saveSessionState(populatedState);
      saveSessionState({
        sessionNotes: ['New note', 'Heart-patch race wiped state for a week'],
      });
      const after = loadSessionState();
      expect(after.sessionNotes).toContain('New note');
      expect(after.userDirectives.coreDirective).toBe(
        'Real directive that must not be wiped'
      );
    });

    it('allows explicit reset via force: true', () => {
      saveSessionState(populatedState);
      saveSessionState(
        {
          userDirectives: {
            coreDirective: 'Unknown - please re-establish directives',
            requiresPermission: [],
            autonomousActions: [],
          },
        },
        { force: true }
      );
      const after = loadSessionState();
      expect(after.userDirectives.coreDirective).toBe(
        'Unknown - please re-establish directives'
      );
    });
  });

  describe('Lock #3: per-write backup', () => {
    it('snapshots existing state to .session-backups/ before each write', () => {
      saveSessionState(populatedState);
      // Second write triggers a backup of the first
      saveSessionState({ sessionNotes: ['Round two'] });

      const backupDir = path.join(testDir, '.session-backups');
      const files = fsSync
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('state-') && f.endsWith('.json'));
      expect(files.length).toBeGreaterThanOrEqual(1);

      // Each backup must contain the prior on-disk state
      const newest = files.sort().pop()!;
      const content = JSON.parse(
        fsSync.readFileSync(path.join(backupDir, newest), 'utf-8')
      );
      expect(content.userDirectives.coreDirective).toBe(
        'Real directive that must not be wiped'
      );
    });
  });

  describe('Lock #4: append-only event log', () => {
    it('writes events to .session-events.jsonl, not the main state file', () => {
      saveSessionState(populatedState);
      const mtimeBefore = fsSync.statSync(
        path.join(testDir, 'COPILOT_SESSION_STATE.json')
      ).mtimeMs;

      // Wait a tick so any rewrite would change mtime
      const start = Date.now();
      while (Date.now() - start < 5) {
        /* spin */
      }

      appendSessionEvent({
        timestamp: new Date().toISOString(),
        event: 'server-heartbeat',
      });

      const mtimeAfter = fsSync.statSync(
        path.join(testDir, 'COPILOT_SESSION_STATE.json')
      ).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);

      const jsonl = fsSync
        .readFileSync(path.join(testDir, '.session-events.jsonl'), 'utf-8')
        .trim();
      expect(jsonl).toContain('server-heartbeat');
    });

    it('a thousand heartbeats cannot wipe the JSON state', () => {
      saveSessionState(populatedState);
      for (let i = 0; i < 1000; i++) {
        appendSessionEvent({
          timestamp: new Date().toISOString(),
          event: 'server-heartbeat',
        });
      }
      const after = loadSessionState();
      expect(after.userDirectives.coreDirective).toBe(
        'Real directive that must not be wiped'
      );
      expect(after.projectStatus.completionPercent).toBe(73);
    });

    it('hydrates runtime.events from the jsonl on load', () => {
      saveSessionState(populatedState);
      appendSessionEvent({
        timestamp: '2026-05-12T10:00:00.000Z',
        event: 'server-heartbeat',
      });
      appendSessionEvent({
        timestamp: '2026-05-12T10:01:00.000Z',
        event: 'server-heartbeat',
      });
      const loaded = loadSessionState();
      expect(loaded.runtime?.events ?? []).toHaveLength(2);
      expect(loaded.runtime?.events?.[1]?.timestamp).toBe(
        '2026-05-12T10:01:00.000Z'
      );
    });
  });
});
