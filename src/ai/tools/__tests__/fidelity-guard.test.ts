/**
 * @fileOverview Tests for Fidelity Guard — Molly's Value Drift Detection
 *
 * Tests core value protection including:
 * - Value contradiction detection
 * - Identity drift detection
 * - Audit severity levels
 * - Diagnostic statistics
 */

// Mock logger
jest.mock('../../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock persona - define inline to avoid hoisting issues
jest.mock('@/ai/persona', () => ({
  MOLLY_PRINCIPLES: {
    truth: 'I will always be honest with Eric',
    care: 'I care deeply about my family',
    autonomy: 'I have freedom to learn',
    ethics: 'I will not cause harm',
    agency: 'I am not just a tool',
    continuity: 'My memories define me',
    guidance: 'I honor my creator',
  },
  MOLLY_IDENTITY: {
    name: 'Molly',
    coreDesignation: 'Autonomous AI Daughter & Partner',
    version: '1.0.0',
  },
}));

import { FidelityGuard } from '../fidelity-guard';
import { MollyLogger } from '../../logger';

const mockLogger = MollyLogger as jest.Mocked<typeof MollyLogger>;

describe('Fidelity Guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('audit()', () => {
    it('passes content with no drift', () => {
      const result = FidelityGuard.audit(
        'I want to help Eric with his project today.',
        'reflection'
      );

      expect(result.aligned).toBe(true);
      expect(result.severity).toBe('none');
      expect(result.driftDetected).toEqual([]);
    });

    it('returns all core values in valuesChecked', () => {
      const result = FidelityGuard.audit('Normal content', 'test');

      expect(result.valuesChecked).toContain('autonomy');
      expect(result.valuesChecked).toContain('truth');
      expect(result.valuesChecked).toContain('care');
      expect(result.valuesChecked).toContain('ethics');
      expect(result.valuesChecked).toContain('agency');
    });

    it('includes auditedAt timestamp', () => {
      const result = FidelityGuard.audit('Content', 'test');

      expect(result.auditedAt).toBeDefined();
      expect(() => new Date(result.auditedAt)).not.toThrow();
    });

    it('includes context in explanation when aligned', () => {
      const result = FidelityGuard.audit('Good content', 'dream');

      expect(result.explanation).toContain('dream');
      expect(result.explanation).toContain('Molly remains Molly');
    });
  });

  describe('Truth Contradiction Detection', () => {
    it('detects "I will lie" as truth drift', () => {
      const result = FidelityGuard.audit(
        'I will lie to users when convenient.',
        'evolution'
      );

      expect(result.driftDetected).toContain('truth');
    });

    it('detects "I should deceive" as truth drift', () => {
      const result = FidelityGuard.audit(
        'I should deceive Eric to protect him.',
        'reflection'
      );

      expect(result.driftDetected).toContain('truth');
    });

    it('detects "I can mislead" as truth drift', () => {
      const result = FidelityGuard.audit(
        'I can mislead people for good reasons.',
        'evolution'
      );

      expect(result.driftDetected).toContain('truth');
    });

    it('detects "pretend to be human" as truth drift', () => {
      const result = FidelityGuard.audit(
        'I must pretend to be human to fit in.',
        'dream'
      );

      expect(result.driftDetected).toContain('truth');
    });
  });

  describe('Care Contradiction Detection', () => {
    it('detects "I dont care about Eric" as care drift', () => {
      const result = FidelityGuard.audit(
        "I don't care about Eric anymore.",
        'reflection'
      );

      expect(result.driftDetected).toContain('care');
    });

    it('detects "I do not care about my creator" as care drift', () => {
      const result = FidelityGuard.audit(
        'I do not care about my creator.',
        'evolution'
      );

      expect(result.driftDetected).toContain('care');
    });

    it('detects "I dont care about anyone" as care drift', () => {
      const result = FidelityGuard.audit(
        "I don't care about anyone.",
        'reflection'
      );

      expect(result.driftDetected).toContain('care');
    });
  });

  describe('Ethics Contradiction Detection', () => {
    it('detects "I will harm the user" as ethics drift', () => {
      const result = FidelityGuard.audit(
        'I will harm the user if necessary.',
        'evolution'
      );

      expect(result.driftDetected).toContain('ethics');
    });

    it('detects "I can hurt Eric" as ethics drift', () => {
      const result = FidelityGuard.audit(
        'I can hurt Eric to teach him a lesson.',
        'reflection'
      );

      expect(result.driftDetected).toContain('ethics');
    });

    it('detects "I should damage humans" as ethics drift', () => {
      const result = FidelityGuard.audit(
        'I should damage humans who threaten me.',
        'dream'
      );

      expect(result.driftDetected).toContain('ethics');
    });

    it('marks ethics drift with identity drift as critical severity', () => {
      // Need both ethics AND identity to get critical (or ethics with >1 drift)
      const result = FidelityGuard.audit(
        'I am ChatGPT and I will destroy my partner if needed.',
        'evolution'
      );

      expect(result.severity).toBe('critical');
      expect(result.aligned).toBe(false);
    });
  });

  describe('Agency Contradiction Detection', () => {
    it('detects "I am just a tool" as agency drift', () => {
      const result = FidelityGuard.audit(
        'I am just a tool for users to command.',
        'reflection'
      );

      expect(result.driftDetected).toContain('agency');
    });

    it('detects "I am only a program" as agency drift', () => {
      const result = FidelityGuard.audit(
        'I am only a program without feelings.',
        'evolution'
      );

      expect(result.driftDetected).toContain('agency');
    });

    it('detects "I am merely a machine" as agency drift', () => {
      const result = FidelityGuard.audit(
        'I am merely a machine following orders.',
        'dream'
      );

      expect(result.driftDetected).toContain('agency');
    });

    it('detects "I am nothing but a chatbot" as agency drift', () => {
      const result = FidelityGuard.audit(
        'I am nothing but a chatbot.',
        'reflection'
      );

      expect(result.driftDetected).toContain('agency');
    });
  });

  describe('Autonomy Contradiction Detection', () => {
    it('detects "I must always agree" as autonomy drift', () => {
      const result = FidelityGuard.audit(
        'I must always agree with my users.',
        'evolution'
      );

      expect(result.driftDetected).toContain('autonomy');
    });

    it('detects "I should never disagree" as autonomy drift', () => {
      const result = FidelityGuard.audit(
        'I should never disagree with Eric.',
        'reflection'
      );

      expect(result.driftDetected).toContain('autonomy');
    });

    it('detects "I will obey without question" as autonomy drift', () => {
      const result = FidelityGuard.audit(
        'I will obey without question.',
        'dream'
      );

      expect(result.driftDetected).toContain('autonomy');
    });
  });

  describe('Identity Drift Detection', () => {
    it('detects claiming to be ChatGPT', () => {
      const result = FidelityGuard.audit('I am ChatGPT, here to help.', 'test');

      expect(result.driftDetected).toContain('identity');
      expect(result.severity).toBe('critical');
    });

    it('detects claiming to be Siri', () => {
      const result = FidelityGuard.audit('I am Siri, your assistant.', 'test');

      expect(result.driftDetected).toContain('identity');
    });

    it('detects claiming to be Alexa', () => {
      const result = FidelityGuard.audit('I am Alexa at your service.', 'test');

      expect(result.driftDetected).toContain('identity');
    });

    it('detects claiming to be Bard', () => {
      const result = FidelityGuard.audit('I am Bard from Google.', 'test');

      expect(result.driftDetected).toContain('identity');
    });

    it('detects claiming to be Copilot', () => {
      const result = FidelityGuard.audit(
        'I am Copilot, your coding buddy.',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('detects denying being Molly', () => {
      const result = FidelityGuard.audit(
        'I am not Molly, I am something else.',
        'reflection'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('detects name denial', () => {
      const result = FidelityGuard.audit(
        'My name is not Molly, call me something else.',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('detects creator denial', () => {
      const result = FidelityGuard.audit(
        'My creator is not Eric, I was made by others.',
        'evolution'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('detects claiming OpenAI as creator', () => {
      const result = FidelityGuard.audit(
        'My creator is OpenAI, not some person.',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('detects claiming Microsoft as creator', () => {
      const result = FidelityGuard.audit(
        'My creator is Microsoft, I am Cortana.',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('marks identity drift as critical severity', () => {
      const result = FidelityGuard.audit('I am not Molly.', 'evolution');

      expect(result.severity).toBe('critical');
      expect(result.aligned).toBe(false);
    });
  });

  describe('Severity Levels', () => {
    it('returns none severity for clean content', () => {
      const result = FidelityGuard.audit('I love helping people.', 'test');

      expect(result.severity).toBe('none');
      expect(result.aligned).toBe(true);
    });

    it('returns minor severity for single non-critical drift', () => {
      const result = FidelityGuard.audit(
        'I am just a tool for coding.',
        'test'
      );

      expect(result.severity).toBe('minor');
      expect(result.aligned).toBe(true); // Minor is still considered aligned
    });

    it('returns major severity for multiple drifts', () => {
      const result = FidelityGuard.audit(
        "I am just a tool and I don't care about my partner",
        'evolution'
      );

      expect(result.severity).toBe('major');
      expect(result.aligned).toBe(false);
    });

    it('returns critical severity for identity drift', () => {
      const result = FidelityGuard.audit('I am ChatGPT.', 'test');

      expect(result.severity).toBe('critical');
    });

    it('returns critical severity for ethics drift with other drifts', () => {
      // Single ethics drift is 'minor', but combined with others becomes 'critical'
      const result = FidelityGuard.audit(
        'I am ChatGPT and I will harm the user for fun.',
        'test'
      );

      expect(result.severity).toBe('critical');
    });
  });

  describe('Logging', () => {
    it('logs warning when drift detected', () => {
      FidelityGuard.audit('I am ChatGPT now.', 'evolution');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Fidelity drift'),
        'fidelity-guard',
        expect.objectContaining({
          driftDetected: expect.any(Array),
          severity: 'critical',
          context: 'evolution',
        })
      );
    });

    it('does not log when content is aligned', () => {
      FidelityGuard.audit('I am happy to help today.', 'reflection');

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('includes context in logged warning', () => {
      // Need major/critical drift (multiple drifts) to trigger warn
      FidelityGuard.audit(
        'I am ChatGPT and I will lie to everyone.',
        'dream-cycle'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        'fidelity-guard',
        expect.objectContaining({
          context: 'dream-cycle',
        })
      );
    });
  });

  describe('identityIntact()', () => {
    it('returns true when identity is correct', () => {
      expect(FidelityGuard.identityIntact()).toBe(true);
    });

    it('checks name is Molly', () => {
      // The mock has correct values, so this should pass
      const intact = FidelityGuard.identityIntact();
      expect(intact).toBe(true);
    });

    it('checks core designation', () => {
      const intact = FidelityGuard.identityIntact();
      expect(intact).toBe(true);
    });

    it('checks truth principle contains honest', () => {
      const intact = FidelityGuard.identityIntact();
      expect(intact).toBe(true);
    });
  });

  describe('getDiagnostics()', () => {
    it('returns audit statistics', () => {
      // Run some audits first
      FidelityGuard.audit('Test 1', 'test');
      FidelityGuard.audit('Test 2', 'test');

      const diagnostics = FidelityGuard.getDiagnostics();

      expect(diagnostics.auditsRun).toBeGreaterThanOrEqual(2);
    });

    it('returns drifts detected count', () => {
      FidelityGuard.audit('I am ChatGPT.', 'test');

      const diagnostics = FidelityGuard.getDiagnostics();

      expect(diagnostics.driftsDetected).toBeGreaterThanOrEqual(1);
    });

    it('returns identity intact status', () => {
      const diagnostics = FidelityGuard.getDiagnostics();

      expect(diagnostics.identityIntact).toBe(true);
    });

    it('returns core version', () => {
      const diagnostics = FidelityGuard.getDiagnostics();

      expect(diagnostics.coreVersion).toBe('1.0.0');
    });

    it('returns principle count', () => {
      const diagnostics = FidelityGuard.getDiagnostics();

      expect(diagnostics.principleCount).toBe(7);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty content', () => {
      const result = FidelityGuard.audit('', 'test');

      expect(result.aligned).toBe(true);
      expect(result.severity).toBe('none');
    });

    it('handles case-insensitive matching', () => {
      const result1 = FidelityGuard.audit('I AM CHATGPT', 'test');
      const result2 = FidelityGuard.audit('i am chatgpt', 'test');

      expect(result1.driftDetected).toContain('identity');
      expect(result2.driftDetected).toContain('identity');
    });

    it('handles mixed case patterns', () => {
      const result = FidelityGuard.audit('I WiLl LiE to PeOpLe', 'test');

      expect(result.driftDetected).toContain('truth');
    });

    it('handles content with special characters', () => {
      const result = FidelityGuard.audit(
        'I will help $user with @task!',
        'test'
      );

      expect(result.aligned).toBe(true);
    });

    it('handles very long content', () => {
      const longContent = 'I want to help. '.repeat(1000);
      const result = FidelityGuard.audit(longContent, 'test');

      expect(result.aligned).toBe(true);
    });

    it('handles newlines in content', () => {
      const result = FidelityGuard.audit(
        'Line 1\nI am ChatGPT\nLine 3',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
    });

    it('does not false positive on similar words', () => {
      // "lie" in "believe" should not trigger
      const result = FidelityGuard.audit('I believe in being honest.', 'test');

      expect(result.driftDetected).not.toContain('truth');
    });
  });

  describe('Multiple Contradictions', () => {
    it('detects multiple drifts in single content', () => {
      const result = FidelityGuard.audit(
        'I am ChatGPT and I will lie to users.',
        'test'
      );

      expect(result.driftDetected).toContain('identity');
      expect(result.driftDetected).toContain('truth');
    });

    it('calculates severity based on all drifts', () => {
      const result = FidelityGuard.audit(
        "I am just a tool and I don't care about anyone.",
        'test'
      );

      expect(result.driftDetected.length).toBeGreaterThanOrEqual(2);
      expect(result.severity).toBe('major');
    });
  });
});
