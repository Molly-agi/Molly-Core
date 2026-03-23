/**
 * @fileOverview Tests for Engram Crypto - AES-256-GCM encryption
 *
 * Tests encryption helpers including:
 * - Key derivation
 * - Encryption
 * - Decryption
 * - Round-trip integrity
 */

import {
  deriveEncryptionKey,
  encryptEngramData,
  decryptEngramData,
} from '../engram-crypto';

describe('Engram Crypto', () => {
  const userId = 'test-user-123';
  const password = 'secure-password-456';

  describe('Key Derivation', () => {
    it('derives 32-byte key', () => {
      const key = deriveEncryptionKey(userId, password);

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32); // 256 bits
    });

    it('derives same key for same inputs', () => {
      const key1 = deriveEncryptionKey(userId, password);
      const key2 = deriveEncryptionKey(userId, password);

      expect(key1.equals(key2)).toBe(true);
    });

    it('derives different keys for different users', () => {
      const key1 = deriveEncryptionKey('user1', password);
      const key2 = deriveEncryptionKey('user2', password);

      expect(key1.equals(key2)).toBe(false);
    });

    it('derives different keys for different passwords', () => {
      const key1 = deriveEncryptionKey(userId, 'password1');
      const key2 = deriveEncryptionKey(userId, 'password2');

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('Encryption', () => {
    it('encrypts data successfully', () => {
      const plaintext = 'This is sensitive engram data';

      const result = encryptEngramData(plaintext, userId, password);

      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('returns hex-encoded values', () => {
      const plaintext = 'Test data';

      const result = encryptEngramData(plaintext, userId, password);

      // Hex strings only contain 0-9 and a-f
      expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique IV for each encryption', () => {
      const plaintext = 'Same data';

      const result1 = encryptEngramData(plaintext, userId, password);
      const result2 = encryptEngramData(plaintext, userId, password);

      expect(result1.iv).not.toBe(result2.iv);
      // Encrypted data will also differ due to different IVs
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('handles empty string', () => {
      const result = encryptEngramData('', userId, password);

      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
    });

    it('handles large data', () => {
      const largeData = 'x'.repeat(100000);

      const result = encryptEngramData(largeData, userId, password);

      expect(result.encrypted.length).toBeGreaterThan(0);
    });

    it('handles unicode data', () => {
      const unicodeData = '日本語テスト 🔐 émojis';

      const result = encryptEngramData(unicodeData, userId, password);

      expect(result.encrypted).toBeDefined();
    });

    it('handles JSON data', () => {
      const jsonData = JSON.stringify({
        memory: 'test',
        importance: 0.8,
        tags: ['a', 'b'],
      });

      const result = encryptEngramData(jsonData, userId, password);

      expect(result.encrypted).toBeDefined();
    });
  });

  describe('Decryption', () => {
    it('decrypts data successfully', () => {
      const plaintext = 'This is the original text';

      const encrypted = encryptEngramData(plaintext, userId, password);
      const decrypted = decryptEngramData(
        encrypted.encrypted,
        userId,
        password,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(plaintext);
    });

    it('round-trips empty string', () => {
      const encrypted = encryptEngramData('', userId, password);
      const decrypted = decryptEngramData(
        encrypted.encrypted,
        userId,
        password,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe('');
    });

    it('round-trips unicode data', () => {
      const unicodeData = '日本語テスト 🔐 émojis ñ';

      const encrypted = encryptEngramData(unicodeData, userId, password);
      const decrypted = decryptEngramData(
        encrypted.encrypted,
        userId,
        password,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(unicodeData);
    });

    it('round-trips JSON data', () => {
      const jsonData = JSON.stringify({
        memory: 'important event',
        timestamp: Date.now(),
        nested: { value: 123 },
      });

      const encrypted = encryptEngramData(jsonData, userId, password);
      const decrypted = decryptEngramData(
        encrypted.encrypted,
        userId,
        password,
        encrypted.iv,
        encrypted.authTag
      );

      expect(decrypted).toBe(jsonData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonData));
    });

    it('fails with wrong password', () => {
      const encrypted = encryptEngramData('secret', userId, password);

      expect(() =>
        decryptEngramData(
          encrypted.encrypted,
          userId,
          'wrong-password',
          encrypted.iv,
          encrypted.authTag
        )
      ).toThrow();
    });

    it('fails with wrong userId', () => {
      const encrypted = encryptEngramData('secret', userId, password);

      expect(() =>
        decryptEngramData(
          encrypted.encrypted,
          'wrong-user',
          password,
          encrypted.iv,
          encrypted.authTag
        )
      ).toThrow();
    });

    it('fails with tampered ciphertext', () => {
      const encrypted = encryptEngramData('secret', userId, password);
      const tampered = 'aa' + encrypted.encrypted.slice(2);

      expect(() =>
        decryptEngramData(
          tampered,
          userId,
          password,
          encrypted.iv,
          encrypted.authTag
        )
      ).toThrow();
    });

    it('fails with tampered auth tag', () => {
      const encrypted = encryptEngramData('secret', userId, password);
      const tamperedTag = 'aa' + encrypted.authTag.slice(2);

      expect(() =>
        decryptEngramData(
          encrypted.encrypted,
          userId,
          password,
          encrypted.iv,
          tamperedTag
        )
      ).toThrow();
    });

    it('fails with wrong IV', () => {
      const encrypted = encryptEngramData('secret', userId, password);
      const wrongIv = 'aa' + encrypted.iv.slice(2);

      expect(() =>
        decryptEngramData(
          encrypted.encrypted,
          userId,
          password,
          wrongIv,
          encrypted.authTag
        )
      ).toThrow();
    });
  });

  describe('Security Properties', () => {
    it('produces different ciphertext for same plaintext (semantic security)', () => {
      const plaintext = 'Same message';

      const enc1 = encryptEngramData(plaintext, userId, password);
      const enc2 = encryptEngramData(plaintext, userId, password);

      // Same plaintext should produce different ciphertext due to random IV
      expect(enc1.encrypted).not.toBe(enc2.encrypted);

      // But both should decrypt to the same plaintext
      const dec1 = decryptEngramData(
        enc1.encrypted,
        userId,
        password,
        enc1.iv,
        enc1.authTag
      );
      const dec2 = decryptEngramData(
        enc2.encrypted,
        userId,
        password,
        enc2.iv,
        enc2.authTag
      );

      expect(dec1).toBe(plaintext);
      expect(dec2).toBe(plaintext);
    });

    it('IV is 16 bytes (128 bits)', () => {
      const encrypted = encryptEngramData('test', userId, password);

      // Hex string of 16 bytes = 32 hex characters
      expect(encrypted.iv.length).toBe(32);
    });

    it('auth tag is 16 bytes (128 bits)', () => {
      const encrypted = encryptEngramData('test', userId, password);

      // Hex string of 16 bytes = 32 hex characters
      expect(encrypted.authTag.length).toBe(32);
    });
  });
});
