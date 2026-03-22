/**
 * @fileOverview Tests for Compliance and Outreach Systems
 *
 * Tests the modules not covered by recovery-system.test.ts:
 * 1. JurisdictionCompliance — fee caps, waiting periods, compliance checks
 * 2. ContactTracker — outreach lifecycle, opt-outs, follow-ups
 *
 * "We don't fix the leaks in the dam. We fix the dam itself."
 */

import {
  checkCompliance,
  getJurisdictionRule,
  getRecommendedFee,
  isLaunchState,
  getLaunchStates,
  getPrioritizedStates,
  getOperationalStates,
  getAllRules,
  LAUNCH_STATES,
  FEE_SCHEDULE,
} from '../jurisdiction-compliance';
import { ContactTracker } from '../contact-tracker';

// ============================================================================
// JURISDICTION COMPLIANCE TESTS
// ============================================================================

describe('JurisdictionCompliance', () => {
  describe('getJurisdictionRule', () => {
    test('should return specific rule for Oregon', () => {
      const rule = getJurisdictionRule('OR', 'US');

      expect(rule.code).toBe('OR');
      expect(rule.name).toBe('Oregon');
      expect(rule.maxFinderFeePercent).toBeNull(); // No cap
      expect(rule.contactWaitDays).toBe(0);
      expect(rule.registrationRequired).toBe(false);
      expect(rule.stateProgramUrl).toBe('https://unclaimed.oregon.gov');
    });

    test('should return specific rule for California (strict state)', () => {
      const rule = getJurisdictionRule('CA', 'US');

      expect(rule.code).toBe('CA');
      expect(rule.maxFinderFeePercent).toBe(10); // 10% cap
      expect(rule.contactWaitDays).toBe(730); // 24 months
      expect(rule.feeRestrictionMonthsAfterListing).toBe(24);
      expect(rule.mustDiscloseStateProgram).toBe(true);
    });

    test('should return specific rule for New York (registration required)', () => {
      const rule = getJurisdictionRule('NY', 'US');

      expect(rule.code).toBe('NY');
      expect(rule.maxFinderFeePercent).toBe(15);
      expect(rule.registrationRequired).toBe(true);
    });

    test('should return default rule for unknown US state', () => {
      const rule = getJurisdictionRule('ZZ', 'US');

      expect(rule.code).toBe('ZZ'); // Gets our code back
      expect(rule.maxFinderFeePercent).toBe(10); // Conservative default
      expect(rule.contactWaitDays).toBe(365);
      expect(rule.notes).toContain('DEFAULT RULE');
    });

    test('should return international default for non-US', () => {
      const rule = getJurisdictionRule('ON', 'CA'); // Ontario, Canada

      expect(rule.country).toBe('CA');
      expect(rule.notes).toContain('INTERNATIONAL');
    });

    test('should be case-insensitive for state codes', () => {
      const lower = getJurisdictionRule('or', 'US');
      const upper = getJurisdictionRule('OR', 'US');

      expect(lower.code).toBe('OR');
      expect(upper.code).toBe('OR');
    });
  });

  describe('checkCompliance', () => {
    test('should pass compliance for launch state with reasonable fee', () => {
      const result = checkCompliance('OR', 'US', 20);

      expect(result.compliant).toBe(true);
      expect(result.allowedFeePercent).toBe(20);
      expect(result.jurisdiction).toBe('US/OR');
    });

    test('should cap fee in strict states', () => {
      // California has 10% cap
      const result = checkCompliance('CA', 'US', 25);

      expect(result.compliant).toBe(false);
      expect(result.allowedFeePercent).toBe(10);
      expect(result.issues.some((i) => i.severity === 'block')).toBe(true);
      expect(result.issues.some((i) => i.message.includes('10%'))).toBe(true);
    });

    test('should block when waiting period not met', () => {
      // California has 730-day wait
      const recentEscheatment = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const result = checkCompliance(
        'CA',
        'US',
        10,
        recentEscheatment.toISOString()
      );

      expect(result.compliant).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes('waiting period'))
      ).toBe(true);
    });

    test('should pass when waiting period met', () => {
      // Oregon has no wait
      const result = checkCompliance(
        'OR',
        'US',
        20,
        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      );

      expect(result.compliant).toBe(true);
    });

    test('should warn about registration requirement', () => {
      // New York requires registration
      const result = checkCompliance('NY', 'US', 15);

      expect(
        result.issues.some((i) => i.message.includes('registration'))
      ).toBe(true);
    });

    test('should include state program disclosure info', () => {
      const result = checkCompliance('OR', 'US', 20);

      expect(result.issues.some((i) => i.severity === 'info')).toBe(true);
      expect(
        result.issues.some((i) => i.message.includes('state program'))
      ).toBe(true);
    });

    test('should warn about fee restriction after listing', () => {
      // California restricts fees within 24 months of listing
      const recentListing = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000); // 6 months ago

      const result = checkCompliance(
        'CA',
        'US',
        10,
        undefined,
        recentListing.toISOString()
      );

      expect(
        result.issues.some((i) => i.message.includes('restricts fees'))
      ).toBe(true);
    });

    test('should provide rule in result', () => {
      const result = checkCompliance('TX', 'US', 10);

      expect(result.rule).toBeDefined();
      expect(result.rule.code).toBe('TX');
      expect(result.rule.maxFinderFeePercent).toBe(10);
    });
  });

  describe('getRecommendedFee', () => {
    test('should return 20% for launch states', () => {
      expect(getRecommendedFee('OR')).toBe(20);
      expect(getRecommendedFee('WA')).toBe(20);
      expect(getRecommendedFee('AZ')).toBe(20);
      expect(getRecommendedFee('NV')).toBe(20);
    });

    test('should undercut competitors in 10% cap states', () => {
      expect(getRecommendedFee('CA')).toBe(8);
      expect(getRecommendedFee('IN')).toBe(8);
      expect(getRecommendedFee('TX')).toBe(8);
    });

    test('should return 20% for unknown states', () => {
      expect(getRecommendedFee('ZZ')).toBe(20);
    });

    test('should be case-insensitive', () => {
      expect(getRecommendedFee('ca')).toBe(8);
      expect(getRecommendedFee('CA')).toBe(8);
    });
  });

  describe('isLaunchState', () => {
    test('should return true for launch states', () => {
      expect(isLaunchState('OR')).toBe(true);
      expect(isLaunchState('WA')).toBe(true);
      expect(isLaunchState('AZ')).toBe(true);
      expect(isLaunchState('NV')).toBe(true);
    });

    test('should return false for non-launch states', () => {
      expect(isLaunchState('CA')).toBe(false);
      expect(isLaunchState('NY')).toBe(false);
      expect(isLaunchState('TX')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(isLaunchState('or')).toBe(true);
    });
  });

  describe('getLaunchStates', () => {
    test('should return all launch states with fee schedules', () => {
      const states = getLaunchStates();

      expect(states.length).toBe(4);
      expect(states.every((s) => s.launchState)).toBe(true);
      expect(states.every((s) => s.ourFeePercent === 20)).toBe(true);
    });
  });

  describe('getPrioritizedStates', () => {
    test('should prioritize states with no fee cap', () => {
      const states = getPrioritizedStates();

      // First states should be the ones with no cap
      const noCap = states.filter((s) => s.maxFinderFeePercent === null);
      expect(noCap.length).toBeGreaterThanOrEqual(4);

      // No-cap states should come first
      const firstFourCodes = states.slice(0, 4).map((s) => s.code);
      expect(firstFourCodes).toContain('OR');
      expect(firstFourCodes).toContain('WA');
    });
  });

  describe('getOperationalStates', () => {
    test('should exclude states requiring registration', () => {
      const states = getOperationalStates();

      // NY, IL, FL require registration
      const codes = states.map((s) => s.code);
      expect(codes).not.toContain('NY');
      expect(codes).not.toContain('IL');
      expect(codes).not.toContain('FL');

      // OR, WA should be included
      expect(codes).toContain('OR');
      expect(codes).toContain('WA');
    });
  });

  describe('getAllRules', () => {
    test('should return at least 17 state rules', () => {
      const rules = getAllRules();
      expect(rules.length).toBeGreaterThanOrEqual(17);
    });

    test('should include all major states', () => {
      const rules = getAllRules();
      const codes = rules.map((r) => r.code);

      expect(codes).toContain('CA');
      expect(codes).toContain('TX');
      expect(codes).toContain('NY');
      expect(codes).toContain('FL');
      expect(codes).toContain('OR');
    });
  });

  describe('LAUNCH_STATES constant', () => {
    test('should have exactly 4 launch states', () => {
      expect(LAUNCH_STATES).toHaveLength(4);
      expect(LAUNCH_STATES).toContain('OR');
      expect(LAUNCH_STATES).toContain('WA');
      expect(LAUNCH_STATES).toContain('AZ');
      expect(LAUNCH_STATES).toContain('NV');
    });
  });

  describe('FEE_SCHEDULE', () => {
    test('should have entries for all major states', () => {
      expect(FEE_SCHEDULE.length).toBeGreaterThanOrEqual(18);
    });

    test('should have fees that undercut competitors', () => {
      for (const entry of FEE_SCHEDULE) {
        // Extract minimum competitor fee
        const competitorMin = parseInt(
          entry.competitorFeePercent.split('-')[0]
        );
        expect(entry.ourFeePercent).toBeLessThanOrEqual(competitorMin);
      }
    });
  });
});

// ============================================================================
// CONTACT TRACKER TESTS
// ============================================================================

describe('ContactTracker', () => {
  let tracker: ContactTracker;

  beforeEach(() => {
    tracker = ContactTracker.getInstance();
  });

  afterEach(() => {
    // Reset by importing empty state since there's no destroy() method
    tracker.importState([]);
  });

  function createTestOutreach(
    type:
      | 'initial-discovery'
      | 'follow-up'
      | 'agreement-reminder' = 'initial-discovery'
  ) {
    return {
      type,
      channel: 'email' as const,
      holdReasons: [],
      body: 'Test outreach body',
      subject: 'Test subject',
    };
  }

  test('should create a contact record', () => {
    const record = tracker.createRecord(
      'client-1',
      'John Doe',
      'john@example.com'
    );

    expect(record.clientId).toBe('client-1');
    expect(record.name).toBe('John Doe');
    expect(record.status).toBe('not-contacted');
    expect(record.attempts).toHaveLength(0);
  });

  test('should return existing record for same client', () => {
    const record1 = tracker.createRecord('client-1', 'John Doe');
    const record2 = tracker.createRecord('client-1', 'John Doe 2');

    expect(record1.id).toBe(record2.id);
    expect(record2.name).toBe('John Doe'); // Original name preserved
  });

  test('should get record by client ID', () => {
    tracker.createRecord('client-1', 'John Doe', 'john@example.com');

    const retrieved = tracker.getByClientId('client-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('John Doe');
  });

  test('should record outreach attempt', () => {
    tracker.createRecord('client-1', 'John Doe');
    const outreach = createTestOutreach('initial-discovery');

    const updated = tracker.recordAttempt('client-1', outreach, true);

    expect(updated).not.toBeNull();
    expect(updated!.attempts).toHaveLength(1);
    expect(updated!.attempts[0].channel).toBe('email');
    expect(updated!.status).toBe('initial-sent');
    expect(updated!.nextFollowUp).not.toBeNull(); // Follow-up scheduled
  });

  test('should return null when recording attempt for unknown client', () => {
    const outreach = createTestOutreach();
    const result = tracker.recordAttempt('unknown-client', outreach, true);

    expect(result).toBeNull();
  });

  test('should handle opt-out via recordOptOut', () => {
    tracker.createRecord('client-1', 'John Doe');

    const success = tracker.recordOptOut('client-1');
    expect(success).toBe(true);

    const record = tracker.getByClientId('client-1');
    expect(record!.optedOut).toBe(true);
    expect(record!.optedOutAt).toBeDefined();
    expect(record!.status).toBe('opted-out');
    expect(record!.nextFollowUp).toBeNull();
  });

  test('should block outreach after opt-out', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordOptOut('client-1');

    const outreach = createTestOutreach();
    const result = tracker.recordAttempt('client-1', outreach, true);

    expect(result).toBeNull(); // Blocked
  });

  test('should get due follow-ups', () => {
    // Create contact with past-due follow-up
    const record = tracker.createRecord('client-past', 'Past Due');
    record.nextFollowUp = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    record.status = 'initial-sent';

    // Create contact with future follow-up
    tracker.createRecord('client-future', 'Future');
    const futureRecord = tracker.getByClientId('client-future')!;
    futureRecord.nextFollowUp = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    futureRecord.status = 'initial-sent';

    // Create contact with no follow-up
    tracker.createRecord('client-none', 'No Follow-up');

    const due = tracker.getDueFollowUps();
    expect(due.map((c) => c.clientId)).toContain('client-past');
    expect(due.map((c) => c.clientId)).not.toContain('client-future');
    expect(due.map((c) => c.clientId)).not.toContain('client-none');
  });

  test('should enforce max attempts', () => {
    tracker.createRecord(
      'client-1',
      'John Doe',
      undefined,
      undefined,
      undefined,
      2
    );
    const outreach = createTestOutreach();

    // First attempt
    tracker.recordAttempt('client-1', outreach, true);
    // Second attempt
    tracker.recordAttempt('client-1', createTestOutreach('follow-up'), true);

    const record = tracker.getByClientId('client-1');
    expect(record!.status).toBe('follow-up-sent');

    // Third attempt should be blocked (max is 2)
    const blocked = tracker.recordAttempt(
      'client-1',
      createTestOutreach('follow-up'),
      true
    );
    expect(blocked).toBeNull();

    // Status should be no-response
    const final = tracker.getByClientId('client-1');
    expect(final!.status).toBe('no-response');
  });

  test('should record response', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordAttempt('client-1', createTestOutreach(), true);

    const updated = tracker.recordResponse(
      'client-1',
      'email',
      'Interested in learning more',
      'positive'
    );

    expect(updated).not.toBeNull();
    expect(updated!.responses).toHaveLength(1);
    expect(updated!.status).toBe('interested');
  });

  test('should record opt-out response', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordAttempt('client-1', createTestOutreach(), true);

    tracker.recordResponse('client-1', 'email', 'Please remove me', 'opt-out');

    const record = tracker.getByClientId('client-1');
    expect(record!.optedOut).toBe(true);
    expect(record!.status).toBe('opted-out');
  });

  test('should record delivery confirmation', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordAttempt('client-1', createTestOutreach(), true);

    const success = tracker.recordDelivery('client-1');
    expect(success).toBe(true);

    const record = tracker.getByClientId('client-1');
    const lastAttempt = record!.attempts[record!.attempts.length - 1];
    expect(lastAttempt.delivered).toBe(true);
    expect(lastAttempt.deliveredAt).toBeDefined();
  });

  test('should record undeliverable status', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordAttempt('client-1', createTestOutreach(), true);

    const success = tracker.recordUndeliverable('client-1', 'Email bounced');
    expect(success).toBe(true);

    const record = tracker.getByClientId('client-1');
    expect(record!.status).toBe('undeliverable');
    expect(record!.nextFollowUp).toBeNull();
  });

  test('should generate summary', () => {
    tracker.createRecord('client-a', 'Client A');
    tracker.createRecord('client-b', 'Client B');
    tracker.recordAttempt('client-b', createTestOutreach(), true);
    tracker.recordOptOut('client-a');

    const summary = tracker.getSummary();

    expect(summary.total).toBe(2);
    expect(summary.optOuts).toBe(1);
    expect(summary.totalAttempts).toBe(1);
  });

  test('should get contact history', () => {
    tracker.createRecord('client-1', 'John Doe');
    tracker.recordAttempt('client-1', createTestOutreach(), true);
    tracker.recordResponse('client-1', 'email', 'Thanks!', 'positive');

    const history = tracker.getContactHistory('client-1');

    expect(history).not.toBeNull();
    expect(history!.attemptCount).toBe(1);
    expect(history!.responseCount).toBe(1);
    expect(history!.timeline.length).toBe(2);
  });

  test('should export and import state', () => {
    tracker.createRecord('persist-1', 'Persist 1');
    tracker.createRecord('persist-2', 'Persist 2');
    tracker.recordOptOut('persist-2');

    const state = tracker.exportState();
    expect(state).toHaveLength(2);

    // Import into fresh state
    tracker.importState([]);
    expect(tracker.getByClientId('persist-1')).toBeUndefined();

    // Re-import original state
    tracker.importState(state);
    expect(tracker.getByClientId('persist-1')).toBeDefined();
    expect(tracker.getByClientId('persist-2')?.optedOut).toBe(true);
  });
});
