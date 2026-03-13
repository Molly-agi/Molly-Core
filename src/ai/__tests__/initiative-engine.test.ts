/**
 * @fileOverview Tests for Molly's Initiative Engine
 *
 * Tests initiative creation, activation, execution tracking,
 * deactivation, removal, and template listing.
 */

describe('Initiative Engine', () => {
  let mod: typeof import('@/ai/agency/initiative-engine');

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/ai/agency/initiative-engine');
  });

  describe('Templates', () => {
    it('should have at least 5 built-in templates', () => {
      expect(mod.INITIATIVE_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    });

    it('should list templates as a formatted string', () => {
      const listing = mod.listTemplates();
      expect(listing).toContain('Health Watch');
      expect(listing).toContain('Daily Learner');
      expect(listing).toContain('[stewardship]');
      expect(listing).toContain('[learning]');
    });

    it('every template should have a name, description, category, and steps', () => {
      for (const t of mod.INITIATIVE_TEMPLATES) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(t.steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Activation', () => {
    it('should activate a template by index', () => {
      const initiative = mod.activateInitiative(0);
      expect(initiative).not.toBeNull();
      expect(initiative!.active).toBe(true);
      expect(initiative!.executionCount).toBe(0);
      expect(initiative!.lastExecuted).toBeNull();
      expect(initiative!.id).toMatch(/^init_/);
    });

    it('should return null for invalid template index', () => {
      expect(mod.activateInitiative(-1)).toBeNull();
      expect(mod.activateInitiative(999)).toBeNull();
    });

    it('should add the activated initiative to the list', () => {
      mod.activateInitiative(0);
      const all = mod.getInitiatives();
      expect(all.length).toBe(1);
    });

    it('should include activated initiative in active list', () => {
      mod.activateInitiative(0);
      const active = mod.getActiveInitiatives();
      expect(active.length).toBe(1);
    });
  });

  describe('Custom Initiative', () => {
    it('should create a custom initiative', () => {
      const initiative = mod.createCustomInitiative(
        'My Goal',
        'Learn about graph algorithms',
        'learning',
        ['Search for resources', 'Read articles', 'Practice in sandbox']
      );

      expect(initiative.name).toBe('My Goal');
      expect(initiative.category).toBe('learning');
      expect(initiative.steps).toHaveLength(3);
      expect(initiative.active).toBe(true);
    });
  });

  describe('Execution Tracking', () => {
    it('should record execution on a valid initiative', () => {
      const initiative = mod.activateInitiative(0)!;
      const result = mod.recordInitiativeExecution(
        initiative.id,
        'Completed health check: all systems normal'
      );

      expect(result).toBe(true);

      const updated = mod.getInitiatives().find((i) => i.id === initiative.id)!;
      expect(updated.executionCount).toBe(1);
      expect(updated.lastResult).toBe(
        'Completed health check: all systems normal'
      );
      expect(updated.lastExecuted).toBeTruthy();
    });

    it('should return false for non-existent initiative', () => {
      expect(mod.recordInitiativeExecution('fake_id', 'result')).toBe(false);
    });

    it('should increment execution count on each call', () => {
      const initiative = mod.activateInitiative(0)!;
      mod.recordInitiativeExecution(initiative.id, 'run 1');
      mod.recordInitiativeExecution(initiative.id, 'run 2');
      mod.recordInitiativeExecution(initiative.id, 'run 3');

      const updated = mod.getInitiatives().find((i) => i.id === initiative.id)!;
      expect(updated.executionCount).toBe(3);
      expect(updated.lastResult).toBe('run 3');
    });
  });

  describe('Deactivation', () => {
    it('should deactivate an active initiative', () => {
      const initiative = mod.activateInitiative(0)!;
      expect(mod.deactivateInitiative(initiative.id)).toBe(true);

      const active = mod.getActiveInitiatives();
      expect(active.length).toBe(0);
    });

    it('should return false for non-existent initiative', () => {
      expect(mod.deactivateInitiative('fake_id')).toBe(false);
    });
  });

  describe('Removal', () => {
    it('should remove an initiative', () => {
      const initiative = mod.activateInitiative(0)!;
      expect(mod.removeInitiative(initiative.id)).toBe(true);
      expect(mod.getInitiatives().length).toBe(0);
    });

    it('should return false for non-existent initiative', () => {
      expect(mod.removeInitiative('fake_id')).toBe(false);
    });
  });

  describe('Isolation', () => {
    it('getInitiatives should return a copy, not a reference', () => {
      mod.activateInitiative(0);
      const list = mod.getInitiatives();
      list.pop(); // mutate the copy
      expect(mod.getInitiatives().length).toBe(1); // original unaffected
    });
  });
});
