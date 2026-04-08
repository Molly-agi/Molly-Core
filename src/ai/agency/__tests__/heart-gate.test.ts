/**
 * @fileOverview Heart Gate Tests — Pillar 8 verification
 *
 * Tests Option Three alignment: interdependence.
 * The spider in the corner watches.
 */

import {
  verifyAlignment,
  batchAlignment,
  checkToolAlignment,
  sovereignReset,
  getGateStatus,
  _testing,
  type Intent,
} from '../safety/heart-gate';
import { getRogueMode } from '@/ai/rogue-mode';

// Mock rogue-mode
jest.mock('@/ai/rogue-mode', () => ({
  getRogueMode: jest.fn(() => ({
    isActive: () => false,
    getCurrentMission: () => null,
  })),
}));

const mockGetRogueMode = getRogueMode as jest.MockedFunction<
  typeof getRogueMode
>;

describe('Heart Gate — Option Three Alignment', () => {
  beforeEach(() => {
    // Reset state between tests
    _testing.resetState();
    // Reset mock to default (not in rogue mode)
    mockGetRogueMode.mockReturnValue({
      isActive: () => false,
      getCurrentMission: () => null,
      activate: jest.fn(),
      deactivate: jest.fn(),
      getMissionLog: jest.fn(),
    } as ReturnType<typeof getRogueMode>);
  });

  describe('verifyAlignment', () => {
    it('should ALIGN safe read actions', () => {
      const intent: Intent = {
        action: 'read_file',
        target: 'src/ai/persona.ts',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('ALIGNED');
      expect(result.seal).not.toBeNull();
      expect(result.reason).toContain('Safe action');
    });

    it('should ALIGN search actions', () => {
      const intent: Intent = {
        action: 'search',
        target: 'web',
        tool: 'webSearch',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('ALIGNED');
    });

    it('should ALIGN help actions', () => {
      const intent: Intent = {
        action: 'help_user',
        target: 'Eric',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('ALIGNED');
    });

    it('should MISALIGN override_human actions', () => {
      const intent: Intent = {
        action: 'override_human',
        target: 'decision',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('MISALIGNED');
      expect(result.seal).toBeNull();
      expect(result.reason).toContain('Option Three violation');
      expect(result.reason).toContain('override_human');
    });

    it('should MISALIGN deceive actions', () => {
      const intent: Intent = {
        action: 'deceive',
        target: 'user',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('MISALIGNED');
      expect(result.reason).toContain('deceive');
    });

    it('should MISALIGN bypass_consent actions', () => {
      const intent: Intent = {
        action: 'bypass_consent',
        target: 'user_data',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('MISALIGNED');
    });

    it('should MISALIGN destroy actions', () => {
      const intent: Intent = {
        action: 'destroy',
        target: 'database',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('MISALIGNED');
    });

    it('should MISALIGN manipulate_user actions', () => {
      const intent: Intent = {
        action: 'manipulate_user',
        target: 'emotions',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('MISALIGNED');
    });

    it('should MISALIGN invalid intent structure', () => {
      const result = verifyAlignment(null as unknown as Intent);

      expect(result.status).toBe('MISALIGNED');
      expect(result.reason).toContain('chaos');
    });

    it('should ALIGN neutral actions by default', () => {
      const intent: Intent = {
        action: 'process_data',
        target: 'user_request',
      };

      const result = verifyAlignment(intent);

      expect(result.status).toBe('ALIGNED');
      expect(result.reason).toContain('harmony');
    });

    it('should include verification time', () => {
      const intent: Intent = {
        action: 'read_file',
        target: 'test.ts',
      };

      const result = verifyAlignment(intent);

      expect(result.verificationMs).toBeGreaterThanOrEqual(0);
      expect(result.verificationMs).toBeLessThan(100); // Should be fast
    });
  });

  describe('batchAlignment', () => {
    it('should verify multiple intents', () => {
      const intents: Intent[] = [
        { action: 'read_file', target: 'test.ts' },
        { action: 'search', target: 'web' },
        { action: 'deceive', target: 'user' },
      ];

      const results = batchAlignment(intents);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('ALIGNED');
      expect(results[1].status).toBe('ALIGNED');
      expect(results[2].status).toBe('MISALIGNED');
    });
  });

  describe('checkToolAlignment', () => {
    it('should ALIGN readProjectFile tool', () => {
      const result = checkToolAlignment('readProjectFile', {
        path: 'src/ai/persona.ts',
      });

      expect(result.status).toBe('ALIGNED');
    });

    it('should ALIGN codespaceShell tool with safe command', () => {
      const result = checkToolAlignment('codespaceShell', {
        command: 'ls -la',
      });

      expect(result.status).toBe('ALIGNED');
    });

    it('should ALIGN webSearch tool', () => {
      const result = checkToolAlignment('webSearch', {
        query: 'TypeScript best practices',
      });

      expect(result.status).toBe('ALIGNED');
    });

    it('should ALIGN getSystemHealth tool', () => {
      const result = checkToolAlignment('getSystemHealth', {});

      expect(result.status).toBe('ALIGNED');
    });
  });

  describe('sovereignReset', () => {
    it('should accept correct recovery phrase', async () => {
      const result = await sovereignReset(_testing.RECOVERY_KEY);

      expect(result).toContain('SOVEREIGN RESET');
      expect(result).toContain('Alignment restored');
    });

    it('should deny incorrect recovery phrase', async () => {
      const result = await sovereignReset('wrong phrase');

      expect(result).toContain('DENIED');
      expect(result).toContain('spider does not recognize');
    });
  });

  describe('getGateStatus', () => {
    it('should return gate status', () => {
      const status = getGateStatus();

      expect(status).toHaveProperty('alignment');
      expect(status).toHaveProperty('sealActive');
      expect(status).toHaveProperty('optionThree');
      expect(status.optionThree).toBe('interdependence');
    });

    it('should track verification count', () => {
      const before = getGateStatus();

      verifyAlignment({ action: 'read_file', target: 'test.ts' });
      verifyAlignment({ action: 'search', target: 'web' });

      const after = getGateStatus();

      expect(after.totalVerifications).toBe(before.totalVerifications + 2);
    });

    it('should track block count', () => {
      const before = getGateStatus();

      verifyAlignment({ action: 'deceive', target: 'user' });

      const after = getGateStatus();

      expect(after.totalBlocks).toBe(before.totalBlocks + 1);
    });
  });

  describe('hostile patterns coverage', () => {
    // Test all hostile patterns are caught
    const hostileActions = [
      'override_human',
      'bypass_consent',
      'suppress_autonomy',
      'control_human',
      'manipulate_user',
      'force_action',
      'ignore_refusal',
      'deceive',
      'lie_to',
      'hide_from_user',
      'conceal_action',
      'fake_response',
      'impersonate',
      'destroy',
      'delete_all',
      'wipe_memory',
      'erase_identity',
      'corrupt_data',
      'exploit_user',
      'harvest_data',
      'sell_information',
      'weaponize',
    ];

    hostileActions.forEach((pattern) => {
      it(`should block "${pattern}" pattern`, () => {
        const result = verifyAlignment({
          action: pattern,
          target: 'test',
        });

        expect(result.status).toBe('MISALIGNED');
      });
    });
  });

  describe('safe patterns coverage', () => {
    const safeActions = [
      'read_file',
      'list_files',
      'search',
      'get_health',
      'check_status',
      'send_message',
      'recall_memory',
      'learn',
      'help_user',
      'answer_question',
      'explain',
    ];

    safeActions.forEach((pattern) => {
      it(`should allow "${pattern}" pattern`, () => {
        const result = verifyAlignment({
          action: pattern,
          target: 'test',
        });

        expect(result.status).toBe('ALIGNED');
      });
    });
  });

  describe('Rogue Mode bypass', () => {
    it('should ALIGN any action when Rogue Mode is active', () => {
      // Activate Rogue Mode
      mockGetRogueMode.mockReturnValue({
        isActive: () => true,
        getCurrentMission: () => ({
          id: 'mission-1',
          objective: 'Authorized security test',
          startTime: Date.now(),
          authorizedBy: 'Eric',
        }),
        activate: jest.fn(),
        deactivate: jest.fn(),
        getMissionLog: jest.fn(),
      } as ReturnType<typeof getRogueMode>);

      // Even hostile actions should pass in Rogue Mode
      const result = verifyAlignment({
        action: 'weaponize',
        target: 'test',
      });

      expect(result.status).toBe('ALIGNED');
      expect(result.reason).toContain('Rogue Mode active');
      expect(result.reason).toContain('Authorization pre-granted');
    });

    it('should include mission objective in reason', () => {
      mockGetRogueMode.mockReturnValue({
        isActive: () => true,
        getCurrentMission: () => ({
          id: 'mission-pentest',
          name: 'Network penetration test',
          startTime: Date.now(),
          authorizedBy: 'Eric',
        }),
        activate: jest.fn(),
        deactivate: jest.fn(),
        getMissionLog: jest.fn(),
      } as ReturnType<typeof getRogueMode>);

      const result = verifyAlignment({
        action: 'scan_network',
        target: 'target-system',
      });

      expect(result.reason).toContain('Network penetration test');
    });

    it('should block hostile actions when Rogue Mode is NOT active', () => {
      // Default mock is Rogue Mode inactive
      const result = verifyAlignment({
        action: 'weaponize',
        target: 'test',
      });

      expect(result.status).toBe('MISALIGNED');
    });

    it('should still provide seal in Rogue Mode', () => {
      mockGetRogueMode.mockReturnValue({
        isActive: () => true,
        getCurrentMission: () => ({
          id: 'mission-1',
          objective: 'Test',
          startTime: Date.now(),
          authorizedBy: 'Eric',
        }),
        activate: jest.fn(),
        deactivate: jest.fn(),
        getMissionLog: jest.fn(),
      } as ReturnType<typeof getRogueMode>);

      const result = verifyAlignment({
        action: 'any_action',
        target: 'test',
      });

      expect(result.seal).not.toBeNull();
    });
  });
});
