/**
 * IP Vault Sealer
 *
 * Creates an AES-256-GCM encrypted archive of all MODEL_95_NESTED IP documents.
 * The encrypted file is stored in the repo. The key is never committed.
 *
 * Usage:
 *   IP_VAULT_KEY="your-strong-passphrase-here" npx tsx scripts/seal-ip-vault.mts
 *
 * To verify the seal (decrypt and print):
 *   IP_VAULT_KEY="your-passphrase" npx tsx scripts/seal-ip-vault.mts --verify
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Files to seal ─────────────────────────────────────────────────────────────
const VAULT_CONTENTS: Record<string, string> = {};

const FILES_TO_SEAL = [
  'stuff/confidential/MODEL_95_IP_SPECIFICATION.md',
  'stuff/Titan_Echo_B2B_Launch_Package/TITAN_ECHO_IP_LOCKDOWN_PROTOCOL.md',
  'stuff/Titan_Echo_B2B_Launch_Package/TITAN_ECHO_IP_STRATEGY.md',
  'stuff/Titan_Echo_B2B_Launch_Package/TITAN_ECHO_PITCH_DECK.md',
  'BENCHMARK_INDUSTRY_COMPARISON.json',
  'docs/COPYRIGHT.md',
];

// ── Crypto helpers ────────────────────────────────────────────────────────────

const ITERATIONS = 210_000; // OWASP 2023 minimum for PBKDF2-SHA512
const KEY_LENGTH = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

function seal(passphrase: string, payload: string): Buffer {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Layout: [4 bytes magic] [32 bytes salt] [12 bytes iv] [16 bytes authTag] [ciphertext]
  const magic = Buffer.from('MVLT'); // Molly Vault
  return Buffer.concat([magic, salt, iv, authTag, encrypted]);
}

function unseal(passphrase: string, vaultBuf: Buffer): string {
  const magic = vaultBuf.subarray(0, 4).toString();
  if (magic !== 'MVLT') throw new Error('Not a valid Molly vault file.');

  const salt = vaultBuf.subarray(4, 36);
  const iv = vaultBuf.subarray(36, 48);
  const authTag = vaultBuf.subarray(48, 64);
  const ciphertext = vaultBuf.subarray(64);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const passphrase = process.env.IP_VAULT_KEY;
if (!passphrase || passphrase.length < 20) {
  console.error('ERROR: IP_VAULT_KEY env var must be set and at least 20 characters.');
  console.error('Usage: IP_VAULT_KEY="your-passphrase" npx tsx scripts/seal-ip-vault.mts');
  process.exit(1);
}

const isVerify = process.argv.includes('--verify');
const VAULT_PATH = path.join(ROOT, 'stuff/confidential/MODEL_95_IP_VAULT.enc');

if (isVerify) {
  console.log('\nVerifying vault...');
  try {
    const vaultBuf = fs.readFileSync(VAULT_PATH);
    const plaintext = unseal(passphrase, vaultBuf);
    const parsed = JSON.parse(plaintext) as { sealedAt: string; files: Record<string, string> };
    console.log(`\n✓ Vault is valid`);
    console.log(`  Sealed at: ${parsed.sealedAt}`);
    console.log(`  Contents (${Object.keys(parsed.files).length} files):`);
    for (const [name, content] of Object.entries(parsed.files)) {
      console.log(`    - ${name} (${content.length} chars)`);
    }
  } catch (e) {
    console.error('\n✗ Vault verification FAILED:', (e as Error).message);
    process.exit(1);
  }
} else {
  console.log('\nSealing IP vault...');

  for (const relPath of FILES_TO_SEAL) {
    const fullPath = path.join(ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      VAULT_CONTENTS[relPath] = fs.readFileSync(fullPath, 'utf-8');
      console.log(`  + ${relPath} (${VAULT_CONTENTS[relPath].length} chars)`);
    } else {
      console.warn(`  ! MISSING: ${relPath} — skipped`);
    }
  }

  const payload = JSON.stringify({
    sealedAt: new Date().toISOString(),
    owner: 'Eric Breon',
    project: 'Molly-Core / Titan Echo',
    files: VAULT_CONTENTS,
  });

  console.log(`\n  Encrypting ${Object.keys(VAULT_CONTENTS).length} files (${payload.length} chars total)...`);
  const vaultBuf = seal(passphrase, payload);

  fs.mkdirSync(path.dirname(VAULT_PATH), { recursive: true });
  fs.writeFileSync(VAULT_PATH, vaultBuf);

  console.log(`\n✓ Vault sealed: ${VAULT_PATH}`);
  console.log(`  Size: ${vaultBuf.length} bytes`);
  console.log(`  Encryption: AES-256-GCM`);
  console.log(`  KDF: PBKDF2-SHA512, ${ITERATIONS.toLocaleString()} iterations`);
  console.log('\n  The vault can only be opened with IP_VAULT_KEY.');
  console.log('  Store that passphrase somewhere only you can reach.\n');
}
