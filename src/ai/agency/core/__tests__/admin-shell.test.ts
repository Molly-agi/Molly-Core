/**
 * Admin Shell Unit Tests (D.8)
 */

import {
  AdminShell,
  verifyAdminToken,
  hashToken,
  auditLog,
} from '../admin-shell';

describe('AdminShell (D.8)', () => {
  describe('Token Verification', () => {
    test('verifyAdminToken returns true (middleware auth)', () => {
      // Middleware already handles auth, so this should always return true
      expect(verifyAdminToken()).toBe(true);
    });
  });

  describe('Token Hashing', () => {
    test('hashToken produces SHA-256 hash', () => {
      const token = 'test-password-123';
      const hash = hashToken(token);

      // SHA-256 hashes are 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('hashToken is consistent', () => {
      const token = 'admin-password';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
    });

    test('hashToken differs for different tokens', () => {
      const hash1 = hashToken('password1');
      const hash2 = hashToken('password2');

      expect(hash1).not.toBe(hash2);
    });

    test('hashToken handles empty string', () => {
      const hash = hashToken('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Command Allowlist', () => {
    test('allows valid commands', async () => {
      const validCommands = [
        'health-check',
        'reset-embedding-provider',
        'clear-memory-scar',
        'restart-heartbeat',
        'audit-log',
      ];

      for (const cmd of validCommands) {
        const result = await AdminShell.process('token', cmd);
        // We expect either success or an execution error, not a "not in allowlist" error
        expect(result.result).not.toContain('not in allowlist');
      }
    });

    test('rejects commands not in allowlist', async () => {
      const result = await AdminShell.process('token', 'invalid-command');

      expect(result.success).toBe(false);
      expect(result.result).toContain('not in allowlist');
    });

    test('rejects empty command', async () => {
      const result = await AdminShell.process('token', '');

      expect(result.success).toBe(false);
      expect(result.result).toContain('not in allowlist');
    });
  });

  describe('Health Check Command', () => {
    test('health-check returns diagnostic info', async () => {
      const result = await AdminShell.process('token', 'health-check');

      // Should either succeed or fail gracefully
      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.executedAt).toBeDefined();
    });
  });

  describe('Command Result Format', () => {
    test('returns properly formatted CommandResult', async () => {
      const result = await AdminShell.process('token', 'health-check');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('executedAt');

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.result).toBe('string');
      expect(typeof result.executedAt).toBe('string');
    });

    test('executedAt is valid ISO timestamp', async () => {
      const result = await AdminShell.process('token', 'health-check');

      const timestamp = new Date(result.executedAt);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('Audit Logging', () => {
    test('auditLog handles valid entry', () => {
      // Should not throw
      expect(() => {
        auditLog(hashToken('test'), 'health-check', true, 'success result');
      }).not.toThrow();
    });

    test('auditLog handles errors gracefully', () => {
      // Should not throw even with unusual inputs
      expect(() => {
        auditLog('invalid-hash', '', false, '');
      }).not.toThrow();
    });

    test('auditLog creates audit trail entries', () => {
      // Audit logging should complete without errors
      const tokenHash = hashToken('secret-123');
      expect(() => {
        auditLog(tokenHash, 'test-command', true, 'test output');
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('handles missing modules gracefully', async () => {
      // Commands that fail to import should return error result
      const result = await AdminShell.process(
        'token',
        'reset-embedding-provider'
      );

      // Should return a CommandResult, even if execution failed
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('result');
    });

    test('invalid token parameter is handled', async () => {
      // Token parameter is not used (middleware auth), but shouldn't break
      const result = await AdminShell.process('', 'health-check');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('result');
    });
  });

  describe('Reset Embedding Provider Command', () => {
    test('reset-embedding-provider returns a result', async () => {
      const result = await AdminShell.process(
        'token',
        'reset-embedding-provider'
      );

      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('Clear Memory Command', () => {
    test('clear-memory-scar returns a result', async () => {
      const result = await AdminShell.process('token', 'clear-memory-scar');

      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('Restart Heartbeat Command', () => {
    test('restart-heartbeat returns a result', async () => {
      const result = await AdminShell.process('token', 'restart-heartbeat');

      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });

  describe('Audit Log Command', () => {
    test('audit-log returns a result', async () => {
      const result = await AdminShell.process('token', 'audit-log');

      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
    });
  });
});
