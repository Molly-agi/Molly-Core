/**
 * @fileOverview Encryption helpers for personality and engram data.
 * Uses Web Crypto API (works in both browser and Node.js 15+).
 */

const { subtle } = globalThis.crypto;

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function deriveKey(userId: string, password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(userId),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data using AES-256-GCM.
 */
export async function encryptEngramData(
  data: string,
  userId: string,
  password: string
): Promise<{ encrypted: string; iv: string; authTag: string }> {
  const key = await deriveKey(userId, password);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // AES-GCM appends 16-byte auth tag to ciphertext
  const ciphertextWithTag = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(data)
    )
  );

  return {
    encrypted: uint8ArrayToHex(ciphertextWithTag.slice(0, -16)),
    iv: uint8ArrayToHex(iv),
    authTag: uint8ArrayToHex(ciphertextWithTag.slice(-16)),
  };
}

/**
 * Decrypt sensitive data using AES-256-GCM.
 */
export async function decryptEngramData(
  encrypted: string,
  userId: string,
  password: string,
  iv: string,
  authTag: string
): Promise<string> {
  const key = await deriveKey(userId, password);

  const encryptedBytes = hexToUint8Array(encrypted);
  const authTagBytes = hexToUint8Array(authTag);
  const combined = new Uint8Array(encryptedBytes.length + authTagBytes.length);
  combined.set(encryptedBytes);
  combined.set(authTagBytes, encryptedBytes.length);

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: hexToUint8Array(iv) },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}
