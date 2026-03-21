/**
 * @fileOverview Crypto Facade — Cross-Environment Cryptography
 *
 * Provides cryptographic functions that work in both Node.js and browser/edge
 * environments without bundler issues.
 */

// Check environment
const isNodeServer =
  typeof process !== 'undefined' &&
  process.versions?.node &&
  typeof window === 'undefined';

// Lazy-loaded Node crypto module
let nodeCrypto: typeof import('crypto') | null = null;

async function getNodeCrypto(): Promise<typeof import('crypto') | null> {
  if (!isNodeServer) return null;
  if (nodeCrypto) return nodeCrypto;

  try {
    nodeCrypto = await import('crypto');
    return nodeCrypto;
  } catch {
    return null;
  }
}

/**
 * Generate random bytes as hex string.
 */
export async function randomHex(bytes: number): Promise<string> {
  // Try Web Crypto API first (works everywhere)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback to Node crypto
  const crypto = await getNodeCrypto();
  if (crypto) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  // Last resort: Math.random (not cryptographically secure)
  let result = '';
  for (let i = 0; i < bytes; i++) {
    result += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return result;
}

/**
 * Generate random UUID.
 */
export async function randomUUID(): Promise<string> {
  // Try Web Crypto API first
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback to Node crypto
  const crypto = await getNodeCrypto();
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  // Manual UUID v4 generation
  const hex = await randomHex(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Create SHA-256 hash of string.
 */
export async function sha256(data: string): Promise<string> {
  // Try Web Crypto API first
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      dataBuffer
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback to Node crypto
  const crypto = await getNodeCrypto();
  if (crypto) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Create HMAC-SHA256 signature.
 */
export async function hmacSha256(data: string, key: string): Promise<string> {
  // Try Web Crypto API first
  if (typeof globalThis.crypto?.subtle?.importKey === 'function') {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(data)
    );
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback to Node crypto
  const crypto = await getNodeCrypto();
  if (crypto) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  throw new Error('No crypto implementation available');
}

/**
 * Synchronous versions for backward compatibility.
 * These are less portable but work in contexts where async isn't practical.
 */
export function randomHexSync(bytes: number): string {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback to Math.random (not cryptographically secure)
  let result = '';
  for (let i = 0; i < bytes; i++) {
    result += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return result;
}

export function randomUUIDSync(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Manual UUID v4 generation
  const hex = randomHexSync(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}
