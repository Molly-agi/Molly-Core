/**
 * @fileOverview Encryption helpers for personality and engram data.
 */

import * as crypto from 'node:crypto';

/**
 * Derive encryption key from userId + password using PBKDF2.
 */
export function deriveEncryptionKey(userId: string, password: string): Buffer {
  const salt = Buffer.from(userId, 'utf-8');
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt sensitive data using AES-256-GCM.
 */
export function encryptEngramData(
  data: string,
  userId: string,
  password: string
): { encrypted: string; iv: string; authTag: string } {
  const key = deriveEncryptionKey(userId, password);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt sensitive data using AES-256-GCM.
 */
export function decryptEngramData(
  encrypted: string,
  userId: string,
  password: string,
  iv: string,
  authTag: string
): string {
  const key = deriveEncryptionKey(userId, password);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}
