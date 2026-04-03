/**
 * Tests for Molly's Self-Regulation — Client-Side Consciousness
 *
 * Tests the mode transition logic (normal → cautious → quiet),
 * deduplication of error messages, and regulation snapshot accuracy.
 */

// Self-regulation uses module-level state, so we need fresh imports
// for each test group. Jest resetModules handles this.

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function loadRegulation() {
  return import('../self-regulation');
}

// ============================================================================
// shouldAllow — Essential/Heartbeat/Consciousness bypass
// ============================================================================

describe('shouldAllow', () => {
  it('always allows essential requests regardless of mode', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldAllow('essential')).toBe(true);
  });

  it('always allows heartbeat requests', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldAllow('heartbeat')).toBe(true);
  });

  it('always allows consciousness requests', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldAllow('consciousness')).toBe(true);
  });

  it('allows all request types in normal mode', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldAllow('error-report')).toBe(true);
    expect(reg.shouldAllow('session-event')).toBe(true);
    expect(reg.shouldAllow('firestore-log')).toBe(true);
  });
});

// ============================================================================
// Mode transitions — normal → cautious → quiet
// ============================================================================

describe('mode transitions', () => {
  it('starts in normal mode', async () => {
    const reg = await loadRegulation();
    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.mode).toBe('normal');
    expect(snapshot.cascadeCount).toBe(0);
  });

  it('transitions to cautious after >5 errors in window', async () => {
    const reg = await loadRegulation();

    // Record 6 errors within the window
    for (let i = 0; i < 6; i++) {
      reg.recordError();
    }

    // Trigger evaluation by calling shouldAllow with a non-bypass type
    reg.shouldAllow('error-report');

    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.mode).toBe('cautious');
    expect(snapshot.errorsInWindow).toBe(6);
  });

  it('in cautious mode, allows error-report but blocks firestore-log and session-event', async () => {
    const reg = await loadRegulation();

    // Push into cautious mode
    for (let i = 0; i < 6; i++) {
      reg.recordError();
    }
    reg.shouldAllow('error-report'); // triggers evaluation

    expect(reg.shouldAllow('error-report')).toBe(true);
    expect(reg.shouldAllow('firestore-log')).toBe(false);
    expect(reg.shouldAllow('session-event')).toBe(false);
  });

  it('transitions to quiet after >15 errors in window', async () => {
    const reg = await loadRegulation();

    // Record 16 errors
    for (let i = 0; i < 16; i++) {
      reg.recordError();
    }

    reg.shouldAllow('error-report');

    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.mode).toBe('quiet');
    expect(snapshot.cascadeCount).toBe(1);
  });

  it('transitions to quiet after >20 requests in window', async () => {
    const reg = await loadRegulation();

    // Record 21 outbound requests
    for (let i = 0; i < 21; i++) {
      reg.recordOutbound();
    }

    reg.shouldAllow('error-report');

    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.mode).toBe('quiet');
  });

  it('in quiet mode, blocks all non-essential/non-heartbeat/non-consciousness requests', async () => {
    const reg = await loadRegulation();

    // Push into quiet mode
    for (let i = 0; i < 16; i++) {
      reg.recordError();
    }
    reg.shouldAllow('error-report'); // triggers transition

    expect(reg.shouldAllow('error-report')).toBe(false);
    expect(reg.shouldAllow('firestore-log')).toBe(false);
    expect(reg.shouldAllow('session-event')).toBe(false);

    // But these always go through
    expect(reg.shouldAllow('essential')).toBe(true);
    expect(reg.shouldAllow('heartbeat')).toBe(true);
    expect(reg.shouldAllow('consciousness')).toBe(true);
  });

  it('de-escalates from quiet → cautious after 30s cooldown with no errors', async () => {
    const reg = await loadRegulation();

    // Push into quiet mode
    for (let i = 0; i < 16; i++) {
      reg.recordError();
    }
    reg.shouldAllow('error-report');
    expect(reg.getRegulationSnapshot().mode).toBe('quiet');

    // Advance time past the 10s error window + 30s quiet cooldown
    jest.advanceTimersByTime(31_000);

    // Trigger evaluation
    reg.shouldAllow('error-report');

    expect(reg.getRegulationSnapshot().mode).toBe('cautious');
  });

  it('de-escalates from cautious → normal after 60s cooldown with ≤2 errors', async () => {
    const reg = await loadRegulation();

    // Push into cautious mode
    for (let i = 0; i < 6; i++) {
      reg.recordError();
    }
    reg.shouldAllow('error-report');
    expect(reg.getRegulationSnapshot().mode).toBe('cautious');

    // Advance time past the 10s window + 60s cautious cooldown
    jest.advanceTimersByTime(61_000);

    // Trigger evaluation
    reg.shouldAllow('error-report');

    expect(reg.getRegulationSnapshot().mode).toBe('normal');
    expect(reg.getRegulationSnapshot().cascadeCount).toBe(0);
  });
});

// ============================================================================
// shouldReportError — deduplication
// ============================================================================

describe('shouldReportError', () => {
  it('allows the first occurrence of an error', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldReportError('Connection timeout')).toBe(true);
  });

  it('blocks duplicate errors within the dedup window', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldReportError('Connection timeout')).toBe(true);
    expect(reg.shouldReportError('Connection timeout')).toBe(false);
  });

  it('allows the same error after the dedup window expires', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldReportError('Connection timeout')).toBe(true);

    // Advance past the 5s dedup window
    jest.advanceTimersByTime(6_000);

    expect(reg.shouldReportError('Connection timeout')).toBe(true);
  });

  it('allows different error messages concurrently', async () => {
    const reg = await loadRegulation();
    expect(reg.shouldReportError('Error A')).toBe(true);
    expect(reg.shouldReportError('Error B')).toBe(true);
    expect(reg.shouldReportError('Error C')).toBe(true);
  });
});

// ============================================================================
// recordOutbound / recordError / getRegulationSnapshot
// ============================================================================

describe('recording and snapshot', () => {
  it('tracks error and request counts in the snapshot', async () => {
    const reg = await loadRegulation();

    reg.recordError();
    reg.recordError();
    reg.recordOutbound();
    reg.recordOutbound();
    reg.recordOutbound();

    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.errorsInWindow).toBe(2);
    expect(snapshot.requestsInWindow).toBe(3);
  });

  it('expires old timestamps outside the window', async () => {
    const reg = await loadRegulation();

    reg.recordError();
    reg.recordOutbound();

    // Advance time past the 10s window
    jest.advanceTimersByTime(11_000);

    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.errorsInWindow).toBe(0);
    expect(snapshot.requestsInWindow).toBe(0);
  });

  it('snapshot includes correct reason and lastModeChange', async () => {
    const reg = await loadRegulation();
    const snapshot = reg.getRegulationSnapshot();
    expect(snapshot.reason).toBe('Initial state');
    expect(typeof snapshot.lastModeChange).toBe('number');
  });
});
