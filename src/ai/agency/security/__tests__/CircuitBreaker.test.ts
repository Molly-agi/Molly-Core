import { CircuitBreaker } from '../CircuitBreaker';

beforeEach(() => {
  CircuitBreaker.resetInstance();
});

describe('CircuitBreaker', () => {
  describe('singleton', () => {
    it('getInstance always returns the same instance', () => {
      const a = CircuitBreaker.getInstance();
      const b = CircuitBreaker.getInstance();
      expect(a).toBe(b);
    });

    it('resetInstance creates a fresh instance', () => {
      const a = CircuitBreaker.getInstance();
      CircuitBreaker.resetInstance();
      const b = CircuitBreaker.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('state transitions', () => {
    it('starts in CONNECTED state', () => {
      expect(CircuitBreaker.getInstance().getNetworkState()).toBe('CONNECTED');
    });

    it('tripCircuitBreaker switches to ISOLATED_FALLBACK', () => {
      const cb = CircuitBreaker.getInstance();
      cb.tripCircuitBreaker('unit test');
      expect(cb.getNetworkState()).toBe('ISOLATED_FALLBACK');
    });

    it('resetCircuitBreaker returns to CONNECTED', () => {
      const cb = CircuitBreaker.getInstance();
      cb.tripCircuitBreaker('unit test');
      cb.resetCircuitBreaker();
      expect(cb.getNetworkState()).toBe('CONNECTED');
    });

    it('trips remain isolated until reset', () => {
      const cb = CircuitBreaker.getInstance();
      cb.tripCircuitBreaker('error 1');
      cb.tripCircuitBreaker('error 2');
      expect(cb.getNetworkState()).toBe('ISOLATED_FALLBACK');
      cb.resetCircuitBreaker();
      expect(cb.getNetworkState()).toBe('CONNECTED');
    });
  });

  describe('secureTransmit', () => {
    it('trips the breaker when fetch rejects', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network failure')) as typeof fetch;
      const cb = CircuitBreaker.getInstance();
      await expect(
        cb.secureTransmit('https://example.com/api', { payload: 'test' })
      ).rejects.toThrow();
      expect(cb.getNetworkState()).toBe('ISOLATED_FALLBACK');
    });

    it('trips the breaker when fetch returns a non-ok status', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        } as Response) as typeof fetch;
      const cb = CircuitBreaker.getInstance();
      await expect(
        cb.secureTransmit('https://example.com/api', { payload: 'test' })
      ).rejects.toThrow();
      expect(cb.getNetworkState()).toBe('ISOLATED_FALLBACK');
    });
  });
});
