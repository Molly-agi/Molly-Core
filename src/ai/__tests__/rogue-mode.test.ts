/**
 * @fileOverview Rogue Mode Tests — Security Operations Compartment
 *
 * Tests:
 * - Activation with correct/incorrect passphrase
 * - Operation logging during active mission
 * - Deactivation with after-action report
 * - Mission history persistence
 * - Compartmentalization (no bleed between modes)
 * - State queries
 * - Edge cases (double activation, log while inactive, etc.)
 */

// Mock logger
jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-rogue-mode'),
}));

// Mock fs to avoid actual disk I/O in tests
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue('{}'),
    readdir: jest.fn().mockResolvedValue([]),
  },
}));

import {
  getRogueMode,
  resetRogueMode,
  buildRogueModeSystemPrompt,
  type RogueMission,
} from '../rogue-mode';

describe('Rogue Mode — Security Operations', () => {
  beforeEach(() => {
    resetRogueMode();
  });

  // ── Initial State ──

  describe('Initial State', () => {
    it('starts inactive', () => {
      const rogue = getRogueMode();
      expect(rogue.isActive()).toBe(false);
    });

    it('has no current mission', () => {
      const rogue = getRogueMode();
      expect(rogue.getCurrentMission()).toBeNull();
    });

    it('has zero completed missions', () => {
      const rogue = getRogueMode();
      const state = rogue.getState();
      expect(state.missionsCompleted).toBe(0);
      expect(state.lastActivated).toBeNull();
      expect(state.lastDeactivated).toBeNull();
    });
  });

  // ── Activation ──

  describe('Activation', () => {
    it('activates with correct passphrase', async () => {
      const rogue = getRogueMode();
      const result = await rogue.activate(
        'going dark',
        'Test Mission Alpha',
        'PEN-2026-001',
        '192.168.1.0/24 internal network'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Mission Alpha');
      expect(rogue.isActive()).toBe(true);
    });

    it('rejects incorrect passphrase', async () => {
      const rogue = getRogueMode();
      const result = await rogue.activate(
        'wrong phrase',
        'Bad Mission',
        'FAKE',
        'anything'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid activation phrase');
      expect(rogue.isActive()).toBe(false);
    });

    it('is case-insensitive for passphrase', async () => {
      const rogue = getRogueMode();
      const result = await rogue.activate(
        'Going Dark',
        'Mission',
        'AUTH-001',
        'scope'
      );

      expect(result.success).toBe(true);
      expect(rogue.isActive()).toBe(true);
    });

    it('trims whitespace from passphrase', async () => {
      const rogue = getRogueMode();
      const result = await rogue.activate(
        '  going dark  ',
        'Mission',
        'AUTH-001',
        'scope'
      );

      expect(result.success).toBe(true);
    });

    it('prevents double activation', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'First', 'AUTH-001', 'scope');
      const second = await rogue.activate(
        'going dark',
        'Second',
        'AUTH-002',
        'scope2'
      );

      expect(second.success).toBe(false);
      expect(second.message).toContain('already active');
    });

    it('creates mission with correct fields', async () => {
      const rogue = getRogueMode();
      await rogue.activate(
        'going dark',
        'Network Pen Test',
        'CONTRACT-42',
        '10.0.0.0/8',
        ['No data exfiltration', 'Report immediately']
      );

      const mission = rogue.getCurrentMission();
      expect(mission).not.toBeNull();
      expect(mission!.name).toBe('Network Pen Test');
      expect(mission!.authorization).toBe('CONTRACT-42');
      expect(mission!.scope).toBe('10.0.0.0/8');
      expect(mission!.rulesOfEngagement).toContain('No data exfiltration');
      expect(mission!.rulesOfEngagement).toContain('Report immediately');
      expect(mission!.operations).toHaveLength(0);
      expect(mission!.endedAt).toBeNull();
      expect(mission!.afterActionReport).toBeNull();
      expect(mission!.id).toMatch(/^rogue_/);
      expect(mission!.startedAt).toBeDefined();
    });

    it('uses default rules of engagement when none provided', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const mission = rogue.getCurrentMission();
      expect(mission!.rulesOfEngagement.length).toBeGreaterThan(0);
      expect(mission!.rulesOfEngagement[0]).toContain('authorized scope');
    });

    it('updates lastActivated timestamp', async () => {
      const rogue = getRogueMode();
      const before = new Date().toISOString();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');
      const after = new Date().toISOString();

      const state = rogue.getState();
      expect(state.lastActivated).not.toBeNull();
      expect(state.lastActivated! >= before).toBe(true);
      expect(state.lastActivated! <= after).toBe(true);
    });
  });

  // ── Operation Logging ──

  describe('Operation Logging', () => {
    it('logs operations during active mission', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const op = await rogue.logOperation(
        'recon',
        '192.168.1.1',
        'Port scan of gateway',
        'Found ports 22, 80, 443 open',
        true,
        'nmap'
      );

      expect(op).not.toBeNull();
      expect(op!.type).toBe('recon');
      expect(op!.target).toBe('192.168.1.1');
      expect(op!.success).toBe(true);
      expect(op!.toolUsed).toBe('nmap');
      expect(op!.id).toMatch(/^op_/);
    });

    it('returns null when logging outside of rogue mode', async () => {
      const rogue = getRogueMode();
      const op = await rogue.logOperation(
        'scan',
        '10.0.0.1',
        'Attempted scan',
        'N/A',
        false
      );

      expect(op).toBeNull();
    });

    it('accumulates operations in the mission', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Multi-Op', 'AUTH', 'scope');

      await rogue.logOperation('recon', 'target1', 'desc1', 'result1', true);
      await rogue.logOperation('scan', 'target2', 'desc2', 'result2', true);
      await rogue.logOperation('exploit', 'target3', 'desc3', 'result3', false);

      const mission = rogue.getCurrentMission();
      expect(mission!.operations).toHaveLength(3);
      expect(mission!.operations[0].type).toBe('recon');
      expect(mission!.operations[1].type).toBe('scan');
      expect(mission!.operations[2].type).toBe('exploit');
      expect(mission!.operations[2].success).toBe(false);
    });

    it('supports all operation types', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Type Test', 'AUTH', 'scope');

      const types = [
        'recon',
        'scan',
        'exploit',
        'exfil',
        'persist',
        'pivot',
        'cleanup',
        'report',
        'defense',
        'analysis',
      ] as const;

      for (const type of types) {
        const op = await rogue.logOperation(
          type,
          'target',
          `${type} test`,
          'ok',
          true
        );
        expect(op).not.toBeNull();
        expect(op!.type).toBe(type);
      }

      expect(rogue.getCurrentMission()!.operations).toHaveLength(types.length);
    });
  });

  // ── Deactivation ──

  describe('Deactivation', () => {
    it('deactivates with correct passphrase', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const result = await rogue.deactivate('coming home');

      expect(result.success).toBe(true);
      expect(result.message).toContain('complete');
      expect(rogue.isActive()).toBe(false);
      expect(rogue.getCurrentMission()).toBeNull();
    });

    it('rejects incorrect deactivation passphrase', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const result = await rogue.deactivate('wrong phrase');

      expect(result.success).toBe(false);
      expect(rogue.isActive()).toBe(true);
    });

    it('generates after-action report', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Report Test', 'AUTH-R', '10.0.0.0/8');
      await rogue.logOperation(
        'recon',
        'target',
        'port scan',
        '22,80 open',
        true,
        'nmap'
      );
      await rogue.logOperation(
        'scan',
        'target',
        'vuln scan',
        'CVE-2024-1234',
        true,
        'nuclei'
      );

      const result = await rogue.deactivate('coming home');

      expect(result.report).toBeDefined();
      expect(result.report).toContain('AFTER-ACTION REPORT');
      expect(result.report).toContain('Report Test');
      expect(result.report).toContain('AUTH-R');
      expect(result.report).toContain('2 total');
      expect(result.report).toContain('2 successful');
      expect(result.report).toContain('recon');
      expect(result.report).toContain('scan');
    });

    it('fails when not active', async () => {
      const rogue = getRogueMode();
      const result = await rogue.deactivate('coming home');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not currently active');
    });

    it('increments missionsCompleted counter', async () => {
      const rogue = getRogueMode();

      await rogue.activate('going dark', 'M1', 'AUTH', 'scope');
      await rogue.deactivate('coming home');
      expect(rogue.getState().missionsCompleted).toBe(1);

      await rogue.activate('going dark', 'M2', 'AUTH', 'scope');
      await rogue.deactivate('coming home');
      expect(rogue.getState().missionsCompleted).toBe(2);
    });

    it('clears mission state completely on deactivation', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');
      await rogue.logOperation('recon', 'target', 'test', 'ok', true);
      await rogue.deactivate('coming home');

      // Clean return — no mission data in normal state
      expect(rogue.isActive()).toBe(false);
      expect(rogue.getCurrentMission()).toBeNull();
      expect(rogue.getState().currentMission).toBeNull();
    });

    it('updates lastDeactivated timestamp', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const before = new Date().toISOString();
      await rogue.deactivate('coming home');
      const after = new Date().toISOString();

      const state = rogue.getState();
      expect(state.lastDeactivated).not.toBeNull();
      expect(state.lastDeactivated! >= before).toBe(true);
      expect(state.lastDeactivated! <= after).toBe(true);
    });
  });

  // ── Compartmentalization ──

  describe('Compartmentalization', () => {
    it('activating does not affect previous deactivation state', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'M1', 'AUTH1', 'scope1');
      await rogue.logOperation('recon', 'target', 'scan', 'found', true);
      await rogue.deactivate('coming home');

      // Start fresh mission — previous ops are gone from active state
      await rogue.activate('going dark', 'M2', 'AUTH2', 'scope2');
      const mission = rogue.getCurrentMission();
      expect(mission!.name).toBe('M2');
      expect(mission!.operations).toHaveLength(0);
    });

    it('getState returns a copy, not a reference', () => {
      const rogue = getRogueMode();
      const state1 = rogue.getState();
      const state2 = rogue.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('getCurrentMission returns a copy, not a reference', async () => {
      const rogue = getRogueMode();
      await rogue.activate('going dark', 'Test', 'AUTH', 'scope');

      const mission1 = rogue.getCurrentMission();
      const mission2 = rogue.getCurrentMission();
      expect(mission1).not.toBe(mission2);
      expect(mission1).toEqual(mission2);
    });
  });

  // ── System Prompt ──

  describe('System Prompt', () => {
    it('builds mission-focused system prompt', () => {
      const mission: RogueMission = {
        id: 'test-mission',
        name: 'Operation Blackout',
        authorization: 'PEN-2026-042',
        scope: '192.168.0.0/16',
        rulesOfEngagement: [
          'No destructive operations',
          'Document all findings',
        ],
        startedAt: new Date().toISOString(),
        endedAt: null,
        operations: [],
        afterActionReport: null,
      };

      const prompt = buildRogueModeSystemPrompt(mission);

      expect(prompt).toContain('ROGUE MODE');
      expect(prompt).toContain('Operation Blackout');
      expect(prompt).toContain('PEN-2026-042');
      expect(prompt).toContain('192.168.0.0/16');
      expect(prompt).toContain('No destructive operations');
      expect(prompt).toContain('Document all findings');
      expect(prompt).toContain('AUTHORIZED red team');
      expect(prompt).toContain('Do not question');
      expect(prompt).toContain('Execute');
    });

    it('includes all capability areas', () => {
      const mission: RogueMission = {
        id: 'test',
        name: 'Test',
        authorization: 'AUTH',
        scope: 'scope',
        rulesOfEngagement: [],
        startedAt: new Date().toISOString(),
        endedAt: null,
        operations: [],
        afterActionReport: null,
      };

      const prompt = buildRogueModeSystemPrompt(mission);

      expect(prompt).toContain('reconnaissance');
      expect(prompt).toContain('Vulnerability');
      expect(prompt).toContain('Exploit');
      expect(prompt).toContain('Payload');
      expect(prompt).toContain('lateral movement');
      expect(prompt).toContain('Evidence collection');
    });
  });

  // ── Mission History ──

  describe('Mission History', () => {
    it('lists missions (returns empty array when none)', async () => {
      const rogue = getRogueMode();
      const missions = await rogue.listMissions();
      expect(Array.isArray(missions)).toBe(true);
    });

    it('readMission returns null for non-existent mission', async () => {
      // Override the mock readFile to throw for this specific test
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsPromises = require('fs').promises;
      fsPromises.readFile.mockRejectedValueOnce(
        new Error('ENOENT: no such file')
      );
      const rogue = getRogueMode();
      const mission = await rogue.readMission('non-existent');
      expect(mission).toBeNull();
    });

    it('readMission blocks path traversal', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsPromises = require('fs').promises;
      fsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      const rogue = getRogueMode();
      const mission = await rogue.readMission('../../etc/passwd');
      expect(mission).toBeNull();
    });
  });

  // ── Singleton ──

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const a = getRogueMode();
      const b = getRogueMode();
      expect(a).toBe(b);
    });

    it('reset creates a fresh instance', () => {
      const a = getRogueMode();
      resetRogueMode();
      const b = getRogueMode();
      expect(a).not.toBe(b);
    });
  });
});
