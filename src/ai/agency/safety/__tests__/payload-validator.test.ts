/**
 * Payload Validator — Real Unit Tests
 *
 * Tests the actual validatePayload() behavior:
 * - Sentinel RED blocks execution
 * - Extension check blocks unknown types
 * - File-not-found blocks
 * - Oversized scripts blocked
 * - Hash verification + quarantine
 * - Dangerous pattern detection
 * - Clean scripts validated with dispatchCommand
 * - Config helpers (addTrustedHash, quickValidate, etc.)
 */

jest.mock('@/ai/logger', () => ({
  MollyLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  generateTraceId: jest.fn(() => 'trace-test'),
}));

jest.mock('@/ai/agency/safety/defense-sentinel', () => ({
  getEnvironmentStatus: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));

import { promises as fs } from 'fs';
import { getEnvironmentStatus } from '@/ai/agency/safety/defense-sentinel';
import {
  validatePayload,
  quickValidate,
  configureValidator,
  addTrustedHash,
  removeTrustedHash,
  isHashTrusted,
  getValidatorConfig,
  getValidationStats,
  clearValidationHistory,
  clearQuarantine,
  getQuarantinedPayloads,
} from '../payload-validator';

const mockStat = fs.stat as jest.Mock;
const mockReadFile = fs.readFile as jest.Mock;
const mockGetEnvStatus = getEnvironmentStatus as jest.Mock;

describe('Payload Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearValidationHistory();
    clearQuarantine();
    configureValidator({
      requireHashVerification: false,
      trustedHashes: new Set(),
      allowedExtensions: ['.sh', '.py', '.rb', '.pl', '.js', '.ts'],
      maxScriptSize: 1024 * 1024,
    });
    mockGetEnvStatus.mockReturnValue('GREEN');
  });

  describe('validatePayload() — Sentinel gate', () => {
    it('blocks immediately when Sentinel is RED', async () => {
      mockGetEnvStatus.mockReturnValue('RED');

      const result = await validatePayload('/scripts/deploy.sh');

      expect(result.status).toBe('BLOCKED');
      expect(result.message).toMatch(/RED/);
      expect(result.sentinelStatus).toBe('RED');
      // File system should never be touched when Sentinel is RED
      expect(mockStat).not.toHaveBeenCalled();
    });

    it('proceeds when Sentinel is GREEN', async () => {
      mockGetEnvStatus.mockReturnValue('GREEN');
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue(Buffer.from('echo hello'));

      const result = await validatePayload('/scripts/hello.sh');

      expect(result.status).toBe('VALIDATED');
      expect(result.sentinelStatus).toBe('GREEN');
    });

    it('proceeds when Sentinel is YELLOW', async () => {
      mockGetEnvStatus.mockReturnValue('YELLOW');
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue(Buffer.from('echo hello'));

      const result = await validatePayload('/scripts/hello.sh');

      expect(result.status).toBe('VALIDATED');
    });
  });

  describe('validatePayload() — Extension check', () => {
    it('blocks unknown extensions', async () => {
      const result = await validatePayload('/scripts/evil.exe');

      expect(result.status).toBe('BLOCKED');
      expect(result.message).toMatch(/extension/i);
      expect(mockStat).not.toHaveBeenCalled();
    });

    it('blocks when no extension', async () => {
      const result = await validatePayload('/scripts/nodotfile');

      expect(result.status).toBe('BLOCKED');
    });

    it('allows all configured extensions', async () => {
      mockStat.mockResolvedValue({ size: 50 });
      mockReadFile.mockResolvedValue(Buffer.from('# safe content'));

      for (const ext of ['.sh', '.py', '.js', '.ts']) {
        const result = await validatePayload(`/scripts/script${ext}`);
        expect(result.status).toBe('VALIDATED');
      }
    });
  });

  describe('validatePayload() — File I/O', () => {
    it('blocks when file cannot be read', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await validatePayload('/scripts/missing.sh');

      expect(result.status).toBe('BLOCKED');
      expect(result.message).toMatch(/Cannot read/i);
    });

    it('blocks when script exceeds max size', async () => {
      mockStat.mockResolvedValue({ size: 2 * 1024 * 1024 }); // 2MB > 1MB limit

      const result = await validatePayload('/scripts/huge.sh');

      expect(result.status).toBe('BLOCKED');
      expect(result.message).toMatch(/size/i);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  describe('validatePayload() — Hash verification', () => {
    it('quarantines when hash verification required and hash unknown', async () => {
      configureValidator({ requireHashVerification: true, trustedHashes: new Set() });
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue(Buffer.from('echo hello'));

      const result = await validatePayload('/scripts/script.sh');

      expect(result.status).toBe('QUARANTINED');
      expect(result.scriptHash).toBeDefined();
      expect(getQuarantinedPayloads()).toHaveLength(1);
    });

    it('validates when script hash is trusted', async () => {
      const content = Buffer.from('echo trusted');
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      configureValidator({ requireHashVerification: true });
      addTrustedHash(hash);
      mockStat.mockResolvedValue({ size: content.length });
      mockReadFile.mockResolvedValue(content);

      const result = await validatePayload('/scripts/trusted.sh');

      expect(result.status).toBe('VALIDATED');
    });
  });

  describe('validatePayload() — Dangerous patterns', () => {
    const dangerousCases = [
      { desc: 'rm -rf /', content: 'rm -rf /home' },
      { desc: 'fork bomb', content: ':(){ :|:& };:' },
      { desc: 'dd to device', content: 'dd if=/dev/zero of=/dev/sda' },
      { desc: 'mkfs', content: 'mkfs.ext4 /dev/sdb' },
    ];

    for (const { desc, content } of dangerousCases) {
      it(`quarantines script with ${desc}`, async () => {
        mockStat.mockResolvedValue({ size: content.length });
        mockReadFile.mockResolvedValue(Buffer.from(content));

        const result = await validatePayload('/scripts/dangerous.sh');

        expect(result.status).toBe('QUARANTINED');
        expect(result.message).toMatch(/dangerous/i);
      });
    }

    it('validates a clean script', async () => {
      const content = 'echo "Hello, Molly!"';
      mockStat.mockResolvedValue({ size: content.length });
      mockReadFile.mockResolvedValue(Buffer.from(content));

      const result = await validatePayload('/scripts/clean.sh');

      expect(result.status).toBe('VALIDATED');
      expect(result.dispatchCommand).toContain('/scripts/clean.sh');
      expect(result.scriptHash).toBeDefined();
    });
  });

  describe('quickValidate()', () => {
    it('returns invalid for unknown extension', () => {
      const result = quickValidate('/path/to/script.exe');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/extension/i);
    });

    it('returns valid for allowed extension', () => {
      const result = quickValidate('/path/to/script.sh');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Configuration helpers', () => {
    it('addTrustedHash / isHashTrusted round-trip', () => {
      const hash = 'abc123def456';
      expect(isHashTrusted(hash)).toBe(false);
      addTrustedHash(hash);
      expect(isHashTrusted(hash)).toBe(true);
    });

    it('removeTrustedHash removes the hash', () => {
      const hash = 'deadbeef1234';
      addTrustedHash(hash);
      const removed = removeTrustedHash(hash);
      expect(removed).toBe(true);
      expect(isHashTrusted(hash)).toBe(false);
    });

    it('getValidatorConfig returns current config', () => {
      const config = getValidatorConfig();
      expect(config.allowedExtensions).toContain('.sh');
      expect(config.maxScriptSize).toBeGreaterThan(0);
    });
  });

  describe('Validation stats', () => {
    it('tracks validation history', async () => {
      mockGetEnvStatus.mockReturnValue('RED');
      await validatePayload('/scripts/blocked.sh');
      await validatePayload('/scripts/blocked2.sh');

      const stats = getValidationStats();
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.blocked).toBeGreaterThanOrEqual(2);
    });
  });
});
