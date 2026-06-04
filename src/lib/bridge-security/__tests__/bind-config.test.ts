/**
 * @fileOverview F2.4 — bind-config tests
 *
 * Confirms the bridge binds to 127.0.0.1 (loopback), not 0.0.0.0.
 */

import { BRIDGE_BIND } from '../bind-config';

describe('BRIDGE_BIND (F2.4)', () => {
  it('F2.4: host is 127.0.0.1 (loopback only)', () => {
    expect(BRIDGE_BIND.host).toBe('127.0.0.1');
  });

  it('F2.4: host is not 0.0.0.0 (all interfaces)', () => {
    expect(BRIDGE_BIND.host).not.toBe('0.0.0.0');
  });

  it('F2.4: port is 9099', () => {
    expect(BRIDGE_BIND.port).toBe(9099);
  });
});
