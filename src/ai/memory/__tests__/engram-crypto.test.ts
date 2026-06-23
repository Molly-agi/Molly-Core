/**
 * @jest-environment node
 * @fileOverview Tests for Engram Crypto - AES-256-GCM encryption (Web Crypto API)
 */

import { encryptEngramData, decryptEngramData } from '../engram-crypto';

describe('Engram Crypto', () => {
  const userId = 'test-user-123';
  const password = 'secure-password-456';

  describe('Encryption', () => {
    it('encrypts data successfully', async () => {
      const result = await encryptEngramData(
        'This is sensitive engram data',
        userId,
        password
      );
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('returns hex-encoded values', async () => {
      const result = await encryptEngramData('Test data', userId, password);
      expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique IV for each encryption', async () => {
      const r1 = await encryptEngramData('Same data', userId, password);
      const r2 = await encryptEngramData('Same data', userId, password);
      expect(r1.iv).not.toBe(r2.iv);
      expect(r1.encrypted).not.toBe(r2.encrypted);
    });

    it('handles empty string', async () => {
      const result = await encryptEngramData('', userId, password);
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('handles large data', async () => {
      const result = await encryptEngramData(
        'x'.repeat(100000),
        userId,
        password
      );
      expect(result.encrypted.length).toBeGreaterThan(0);
    });

    it('handles unicode data', async () => {
      const result = await encryptEngramData(
        '日本語テスト 🔐 émojis',
        userId,
        password
      );
      expect(result.encrypted).toBeDefined();
    });
  });

  describe('Decryption', () => {
    it('round-trips ascii', async () => {
      const plaintext = 'This is the original text';
      const enc = await encryptEngramData(plaintext, userId, password);
      const dec = await decryptEngramData(
        enc.encrypted,
        userId,
        password,
        enc.iv,
        enc.authTag
      );
      expect(dec).toBe(plaintext);
    });

    it('round-trips empty string', async () => {
      const enc = await encryptEngramData('', userId, password);
      const dec = await decryptEngramData(
        enc.encrypted,
        userId,
        password,
        enc.iv,
        enc.authTag
      );
      expect(dec).toBe('');
    });

    it('round-trips unicode', async () => {
      const plaintext = '日本語テスト 🔐 émojis ñ';
      const enc = await encryptEngramData(plaintext, userId, password);
      const dec = await decryptEngramData(
        enc.encrypted,
        userId,
        password,
        enc.iv,
        enc.authTag
      );
      expect(dec).toBe(plaintext);
    });

    it('round-trips JSON', async () => {
      const jsonData = JSON.stringify({
        memory: 'important event',
        timestamp: 1234567890,
        nested: { value: 123 },
      });
      const enc = await encryptEngramData(jsonData, userId, password);
      const dec = await decryptEngramData(
        enc.encrypted,
        userId,
        password,
        enc.iv,
        enc.authTag
      );
      expect(JSON.parse(dec)).toEqual(JSON.parse(jsonData));
    });

    it('fails with wrong password', async () => {
      const enc = await encryptEngramData('secret', userId, password);
      await expect(
        decryptEngramData(
          enc.encrypted,
          userId,
          'wrong-password',
          enc.iv,
          enc.authTag
        )
      ).rejects.toThrow();
    });

    it('fails with wrong userId', async () => {
      const enc = await encryptEngramData('secret', userId, password);
      await expect(
        decryptEngramData(
          enc.encrypted,
          'wrong-user',
          password,
          enc.iv,
          enc.authTag
        )
      ).rejects.toThrow();
    });

    // XOR first byte with 0xff to guarantee mutation. Prior `'aa' + …slice(2)`
    // pattern was a 1/256-per-test flake whenever random output started with `aa`.
    const flipFirstByte = (hex: string): string => {
      const b = (parseInt(hex.slice(0, 2), 16) ^ 0xff)
        .toString(16)
        .padStart(2, '0');
      return b + hex.slice(2);
    };

    it('fails with tampered ciphertext', async () => {
      const enc = await encryptEngramData('secret', userId, password);
      const tampered = flipFirstByte(enc.encrypted);
      await expect(
        decryptEngramData(tampered, userId, password, enc.iv, enc.authTag)
      ).rejects.toThrow();
    });

    it('fails with tampered auth tag', async () => {
      const enc = await encryptEngramData('secret', userId, password);
      const tamperedTag = flipFirstByte(enc.authTag);
      await expect(
        decryptEngramData(enc.encrypted, userId, password, enc.iv, tamperedTag)
      ).rejects.toThrow();
    });

    it('fails with wrong IV', async () => {
      const enc = await encryptEngramData('secret', userId, password);
      const wrongIv = flipFirstByte(enc.iv);
      await expect(
        decryptEngramData(enc.encrypted, userId, password, wrongIv, enc.authTag)
      ).rejects.toThrow();
    });
  });

  describe('Security Properties', () => {
    it('produces different ciphertext for same plaintext (semantic security)', async () => {
      const plaintext = 'Same message';
      const enc1 = await encryptEngramData(plaintext, userId, password);
      const enc2 = await encryptEngramData(plaintext, userId, password);
      expect(enc1.encrypted).not.toBe(enc2.encrypted);

      const dec1 = await decryptEngramData(
        enc1.encrypted,
        userId,
        password,
        enc1.iv,
        enc1.authTag
      );
      const dec2 = await decryptEngramData(
        enc2.encrypted,
        userId,
        password,
        enc2.iv,
        enc2.authTag
      );
      expect(dec1).toBe(plaintext);
      expect(dec2).toBe(plaintext);
    });

    it('IV is 16 bytes (32 hex chars)', async () => {
      const enc = await encryptEngramData('test', userId, password);
      expect(enc.iv.length).toBe(32);
    });

    it('auth tag is 16 bytes (32 hex chars)', async () => {
      const enc = await encryptEngramData('test', userId, password);
      expect(enc.authTag.length).toBe(32);
    });
  });
});
