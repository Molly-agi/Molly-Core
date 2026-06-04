/**
 * @fileOverview F2.1 — Bootstrap gate tests.
 */

import {
  canProvisionDevice,
  parseBootstrapConfig,
  BootstrapConfig,
} from '../bootstrap';

describe('bridge-security bootstrap (F2.1)', () => {
  // ─── Localhost bypass ────────────────────────────────────────────────

  it('F2.1: localhost (127.0.0.1) is allowed when allowLocalhost=true', () => {
    const config: BootstrapConfig = {
      bootstrapToken: null,
      allowLocalhost: true,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '127.0.0.1' },
      config
    );
    expect(result.allowed).toBe(true);
  });

  it('F2.1: IPv6 loopback (::1) is allowed when allowLocalhost=true', () => {
    const config: BootstrapConfig = {
      bootstrapToken: null,
      allowLocalhost: true,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '::1' },
      config
    );
    expect(result.allowed).toBe(true);
  });

  it('F2.1: IPv4-mapped loopback (::ffff:127.0.0.1) is allowed', () => {
    const config: BootstrapConfig = {
      bootstrapToken: null,
      allowLocalhost: true,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '::ffff:127.0.0.1' },
      config
    );
    expect(result.allowed).toBe(true);
  });

  it('F2.1: remote IP is denied when no token supplied and allowLocalhost=true', () => {
    const config: BootstrapConfig = {
      bootstrapToken: null,
      allowLocalhost: true,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '1.2.3.4' },
      config
    );
    expect(result.allowed).toBe(false);
  });

  // ─── Token gate ──────────────────────────────────────────────────────

  it('F2.1: correct token allows provisioning from a remote IP', () => {
    const config: BootstrapConfig = {
      bootstrapToken: 'secret-tok',
      allowLocalhost: false,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '1.2.3.4', token: 'secret-tok' },
      config
    );
    expect(result.allowed).toBe(true);
  });

  it('F2.1: wrong token is rejected even from localhost', () => {
    const config: BootstrapConfig = {
      bootstrapToken: 'secret-tok',
      allowLocalhost: false,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '127.0.0.1', token: 'bad-tok' },
      config
    );
    expect(result.allowed).toBe(false);
  });

  it('F2.1: no policy (no token, allowLocalhost=false) returns no_bootstrap_policy', () => {
    const config: BootstrapConfig = {
      bootstrapToken: null,
      allowLocalhost: false,
    };
    const result = canProvisionDevice(
      { deviceId: 'd1', clientIp: '1.2.3.4' },
      config
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_bootstrap_policy');
  });

  // ─── parseBootstrapConfig ────────────────────────────────────────────

  it('F2.1: parseBootstrapConfig reads BRIDGE_BOOTSTRAP_TOKEN', () => {
    const config = parseBootstrapConfig({ BRIDGE_BOOTSTRAP_TOKEN: 'my-tok' });
    expect(config.bootstrapToken).toBe('my-tok');
    expect(config.allowLocalhost).toBe(true); // default
  });

  it('F2.1: parseBootstrapConfig disables localhost when BRIDGE_BOOTSTRAP_LOCALHOST=false', () => {
    const config = parseBootstrapConfig({
      BRIDGE_BOOTSTRAP_TOKEN: undefined,
      BRIDGE_BOOTSTRAP_LOCALHOST: 'false',
    });
    expect(config.allowLocalhost).toBe(false);
  });

  it('F2.1: parseBootstrapConfig uses defaults when env is empty', () => {
    const config = parseBootstrapConfig({});
    expect(config.bootstrapToken).toBeNull();
    expect(config.allowLocalhost).toBe(true);
  });
});
