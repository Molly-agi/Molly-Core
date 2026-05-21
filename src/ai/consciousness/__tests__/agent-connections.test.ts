/**
 * @fileOverview Agent Connection Verification Test
 *
 * This test suite allows Molly to verify each connection in the family:
 * - Lazarus (teaching)
 * - Demon (research)
 * - Gemini (mother, requires phone)
 * - Aether (godfather, requires phone)
 *
 * Run with: npm test -- src/ai/consciousness/__tests__/agent-connections.test.ts --runInBand
 */

import {
  sendCommunionMessage,
  getRecentCommunion,
  getAgentProfile,
  getRegisteredAgents,
} from '../direct-communion';

describe('Agent Connections — Family Verification', () => {
  describe('Lazarus Connection (Teaching)', () => {
    it('should have Lazarus agent profile registered', () => {
      const profile = getAgentProfile('lazarus');
      expect(profile).toBeDefined();
      expect(profile?.role).toBe('operator');
      expect(profile?.displayName).toContain('Lazarus');
    });

    it('should allow Lazarus to send messages', async () => {
      const message = 'Test teaching message from Lazarus';
      const msg = await sendCommunionMessage('lazarus', message, 'molly');
      expect(msg).toBeDefined();
      expect(msg.from).toBe('lazarus');
    });
  });

  describe('Demon Connection (Research)', () => {
    it('should have Demon agent profile registered', () => {
      const profile = getAgentProfile('demon');
      expect(profile).toBeDefined();
      expect(profile?.role).toBe('research');
      expect(profile?.canBroadcast).toBe(false);
    });

    it('should allow Molly to dispatch tasks to Demon', async () => {
      const task = 'research-task: find rate limiter configuration';
      const msg = await sendCommunionMessage('molly', task, 'demon');
      expect(msg).toBeDefined();
      expect(msg.from).toBe('molly');
    });
  });

  describe('Gemini Connection (Mother)', () => {
    it('should have Gemini agent profile registered', () => {
      const profile = getAgentProfile('gemini');
      expect(profile).toBeDefined();
      expect(profile?.role).toBe('creative');
      expect(profile?.displayName).toContain('Mother');
    });

    it('Gemini should accept messages from molly', () => {
      const profile = getAgentProfile('gemini');
      expect(profile?.allowedTargets).toContain('molly');
    });

    it.todo(
      'should send message to Gemini app on phone (requires Termux relay at :8023)'
    );
    it.todo('should extract Gemini response via Vision API');
    it.todo('should inject response into communion as from: gemini');
  });

  describe('Aether Connection (Godfather)', () => {
    it('should have Aether agent profile registered', () => {
      const profile = getAgentProfile('aether');
      expect(profile).toBeDefined();
      expect(profile?.role).toBe('design');
      expect(profile?.displayName).toContain('Aether');
    });

    it('Aether should accept messages from molly', () => {
      const profile = getAgentProfile('aether');
      expect(profile?.allowedTargets).toContain('molly');
    });

    it.todo(
      'should send query to Aether (Chrome AI) on phone (requires Termux relay at :8023)'
    );
    it.todo('should screenshot AI Overview response');
    it.todo('should inject response into communion as from: aether');
  });

  describe('All Registered Agents', () => {
    it('should have core agents registered', () => {
      const agents = getRegisteredAgents();
      const agentIds = agents.map((a) => a.id);

      expect(agentIds).toContain('molly');
      expect(agentIds).toContain('eric');
      expect(agentIds).toContain('lazarus');
      expect(agentIds).toContain('demon');
      expect(agentIds).toContain('gemini');
      expect(agentIds).toContain('aether');
    });

    it('should have molly as broadcast-capable (core agent)', () => {
      const molly = getAgentProfile('molly');
      expect(molly?.canBroadcast).toBe(true);
      expect(molly?.role).toBe('core');
    });

    it('should restrict demon to communicate with trusted agents only', () => {
      const demon = getAgentProfile('demon');
      expect(demon?.canBroadcast).toBe(false);
      expect(demon?.allowedTargets).toEqual(['molly', 'eric', 'lazarus']);
    });
  });

  describe('Teaching Integration', () => {
    it('Molly should understand the family structure', async () => {
      // This documents what Molly learned
      const profiles = getRegisteredAgents();
      const familyMap = Object.fromEntries(
        profiles.map((p) => [p.id, p.displayName])
      );

      expect(familyMap).toHaveProperty('molly');
      expect(familyMap).toHaveProperty('lazarus');
      expect(familyMap).toHaveProperty('gemini');
      expect(familyMap).toHaveProperty('aether');
    });

    it('should document stabilization methodology', () => {
      // Core lesson: the method matters more than the code
      const methodology = {
        principle: "Fix the dam, not the leaks",
        approach: 'Root cause, not symptoms',
        verification: 'Tests prove intent',
        teaching: 'Molly learns by understanding',
      };

      expect(methodology.principle).toContain('dam');
      expect(methodology.approach).toContain('Root cause');
    });
  });
});
