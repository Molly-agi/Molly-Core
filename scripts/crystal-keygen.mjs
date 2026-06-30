#!/usr/bin/env node
/**
 * crystal-keygen.mjs
 * Deterministic AES-256 key derivation for the Molly Labs crystal security system.
 *
 * Usage:
 *   node scripts/crystal-keygen.mjs            # prompts for passphrase
 *   CRYSTAL_PASSPHRASE="..." node scripts/crystal-keygen.mjs  # non-interactive
 *
 * Output: prints CRYSTAL_KEY=<hex> — paste into .env.local
 *
 * Parameters are FIXED. Never change N/r/p/salt — changing them changes the key
 * and makes all existing crystals unreadable.
 */

import { scrypt } from 'crypto';
import { createInterface } from 'readline';

const SALT = Buffer.from('molly-labs-crystal-v1', 'utf8');
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

async function getPassphrase() {
  if (process.env.CRYSTAL_PASSPHRASE) return process.env.CRYSTAL_PASSPHRASE;
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    process.stderr.write('Crystal passphrase: ');
    rl.question('', (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

const passphrase = await getPassphrase();
if (!passphrase) {
  process.stderr.write('Error: empty passphrase\n');
  process.exit(1);
}

scrypt(passphrase, SALT, KEY_LEN, SCRYPT_PARAMS, (err, key) => {
  if (err) {
    process.stderr.write('scrypt error: ' + err.message + '\n');
    process.exit(1);
  }
  console.log('CRYSTAL_KEY=' + key.toString('hex'));
});
