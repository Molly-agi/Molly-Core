/**
 * @fileOverview AES-256-GCM symmetric encryption stream.
 * Encrypts any serializable payload with a 256-bit key and GCM authentication tag,
 * producing tamper-proof packets safe for transmission or local storage.
 */

import * as crypto from 'node:crypto';

export interface EncryptedPacket {
  /** Initialization vector (hex) */
  iv: string;
  /** GCM authentication tag — detects tampering (hex) */
  authTag: string;
  /** AES-256-GCM ciphertext (hex) */
  payload: string;
}

export class CipherStream {
  private static readonly ALGORITHM = 'aes-256-gcm' as const;
  private static readonly IV_LENGTH = 12; // 96-bit IV is the GCM recommendation

  /**
   * Normalize any key input to exactly 32 bytes.
   * A Buffer that is already 32 bytes is returned as-is.
   * Anything else is SHA-256 hashed to exactly 32 bytes.
   */
  private static normalizeKey(key: string | Buffer): Buffer {
    if (Buffer.isBuffer(key) && key.length === 32) return key;
    return crypto.createHash('sha256').update(key).digest();
  }

  /** Serialize and encrypt a payload with AES-256-GCM. */
  public static encryptPayload(
    data: unknown,
    secretKey: string | Buffer
  ): EncryptedPacket {
    const key = this.normalizeKey(secretKey);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      payload: encrypted,
    };
  }

  /** Decrypt and deserialize a packet back to its original type. Throws on tamper. */
  public static decryptPayload<T>(
    packet: EncryptedPacket,
    secretKey: string | Buffer
  ): T {
    const key = this.normalizeKey(secretKey);
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      key,
      Buffer.from(packet.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(packet.authTag, 'hex'));

    let decrypted = decipher.update(packet.payload, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  }
}
