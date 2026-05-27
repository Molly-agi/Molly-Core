/**
 * Hidden Admin: IP Vault
 *
 * POST /api/admin/ip-vault
 *   Body: { action: 'verify' | 'contents', vaultKey: string }
 *   Header: x-admin-password (required — same as all admin routes)
 *
 * This route is not linked anywhere in the UI. You must know the URL.
 * Double-gated: admin password (x-admin-password) + vault key in body.
 *
 * SAFETY: Brute-force detection. 5+ failed attempts in 15 min → emergency lockout.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { checkBruteForce, isEmergencyReleasedAlready } from '@/lib/vault-safety';

const VAULT_PATH = path.join(process.cwd(), 'stuff/confidential/MODEL_95_IP_VAULT.enc');
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, 'sha512');
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

// Constant-time compare (prevent timing attacks)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a dummy compare to prevent length-based timing oracle
    crypto.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // SAFETY: Check if already in lockout.
  if (isEmergencyReleasedAlready()) {
    return NextResponse.json({
      error: 'Vault locked due to security policy. Transmission disabled.',
      emergency: true,
    }, { status: 423 });
  }

  // Gate 1: admin password
  const adminPassword = process.env.HIDDEN_ADMIN_PASSWORD;
  const providedAdmin = request.headers.get('x-admin-password') ?? '';
  if (!adminPassword || !safeEqual(providedAdmin, adminPassword)) {
    const bruteForceCheck = checkBruteForce('admin-password', 'fail', 'incorrect password');
    if (bruteForceCheck.isEmergencyRelease) {
      return NextResponse.json({
        error: 'Vault locked due to repeated failed attempts. Transmission disabled.',
        emergency: true,
        message: bruteForceCheck.message,
      }, { status: 423 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; vaultKey?: string };
  try {
    body = await request.json();
  } catch {
    checkBruteForce('json-parse', 'fail', 'malformed json');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, vaultKey } = body;

  if (!action || !['verify', 'contents'].includes(action)) {
    checkBruteForce(`action-${action}`, 'fail', 'invalid action');
    return NextResponse.json(
      { error: 'action must be: verify | contents' },
      { status: 400 }
    );
  }

  // Gate 2: vault key required for encrypted vault operations
  if (!vaultKey || vaultKey.length < 20) {
    const bruteForceCheck = checkBruteForce('vault-key', 'fail', 'missing or short key');
    if (bruteForceCheck.isEmergencyRelease) {
      return NextResponse.json({
        error: 'Vault locked due to repeated failed attempts. Transmission disabled.',
        emergency: true,
        message: bruteForceCheck.message,
      }, { status: 423 });
    }
    return NextResponse.json(
      { error: 'vaultKey required (min 20 chars)' },
      { status: 400 }
    );
  }

  if (!fs.existsSync(VAULT_PATH)) {
    return NextResponse.json(
      { error: 'Vault not yet sealed. Run: IP_VAULT_KEY=... npx tsx scripts/seal-ip-vault.mts' },
      { status: 404 }
    );
  }

  const vaultBuf = fs.readFileSync(VAULT_PATH);

  try {
    const plaintext = unseal(vaultKey, vaultBuf);
    const parsed = JSON.parse(plaintext) as {
      sealedAt: string;
      owner: string;
      project: string;
      files: Record<string, string>;
    };

    checkBruteForce(`${action}`, 'success');

    if (action === 'verify') {
      return NextResponse.json({
        ok: true,
        sealedAt: parsed.sealedAt,
        owner: parsed.owner,
        project: parsed.project,
        fileCount: Object.keys(parsed.files).length,
        files: Object.keys(parsed.files),
        vaultSizeBytes: vaultBuf.length,
      });
    }

    if (action === 'contents') {
      return NextResponse.json({
        ok: true,
        sealedAt: parsed.sealedAt,
        owner: parsed.owner,
        project: parsed.project,
        files: parsed.files,
      });
    }
  } catch {
    const bruteForceCheck = checkBruteForce('vault-decrypt', 'fail', 'decryption failed');
    if (bruteForceCheck.isEmergencyRelease) {
      return NextResponse.json({
        error: 'Vault locked due to repeated failed attempts. Transmission disabled.',
        emergency: true,
        message: bruteForceCheck.message,
      }, { status: 423 });
    }
    // Don't reveal whether it was the key or the file that failed
    return NextResponse.json({ error: 'Decryption failed' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}
