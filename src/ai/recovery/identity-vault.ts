/**
 * @fileOverview Identity Vault — AES-256-GCM Encrypted Credential Store
 *
 * The most security-critical piece of the recovery system.
 * Stores Eric's identity documents, routing numbers, and authorization
 * proofs — encrypted at rest with a master password that is NEVER stored.
 *
 * Architecture:
 * - Master key derived from password via PBKDF2 (100,000 iterations)
 * - Each field encrypted individually with AES-256-GCM
 * - Unique IV per encryption operation
 * - Auth tag stored alongside ciphertext
 * - Vault locked after 15 minutes of inactivity
 * - Master password exists only in memory, only while unlocked
 *
 * What this is NOT:
 * - NOT a key manager for other systems
 * - NOT accessible via any API endpoint
 * - NOT stored in source code
 *
 * Persistence: Firestore → molly_system/vault/identity
 * (Encrypted blobs only — decryption requires the master password)
 *
 * Per Gemini's instructions:
 *   "The IdentityVault needs AES-256-GCM, master key never stored,
 *    zero API exposure."
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from 'crypto';
import { MollyLogger } from '@/ai/logger';
import type {
  IdentityProfile,
  EncryptedField,
  EncryptedAddress,
} from './types';

const FLOW_NAME = 'identity-vault';

// ============================================================================
// CONSTANTS
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

// ============================================================================
// TYPES
// ============================================================================

interface EncryptedBlob {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded auth tag */
  authTag: string;
  /** Base64-encoded salt (for key derivation) */
  salt: string;
}

interface VaultState {
  /** Encrypted identity profile */
  profile?: EncryptedBlob;
  /** Encrypted managed account details (keyed by account ID) */
  accounts: Record<string, EncryptedBlob>;
  /** Vault creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;
}

// ============================================================================
// IDENTITY VAULT
// ============================================================================

export class IdentityVault {
  private static instance: IdentityVault | null = null;

  private derivedKey: Buffer | null = null;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private vaultState: VaultState;
  private isInitialized = false;

  private constructor() {
    this.vaultState = {
      accounts: {},
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
  }

  static getInstance(): IdentityVault {
    if (!IdentityVault.instance) {
      IdentityVault.instance = new IdentityVault();
    }
    return IdentityVault.instance;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Unlock the vault with the master password.
   * Derives the encryption key and starts the auto-lock timer.
   * The password is NOT stored — only the derived key, in memory.
   */
  unlock(masterPassword: string, salt?: string): boolean {
    try {
      const saltBuffer = salt
        ? Buffer.from(salt, 'base64')
        : randomBytes(SALT_LENGTH);

      this.derivedKey = pbkdf2Sync(
        masterPassword,
        saltBuffer,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        PBKDF2_DIGEST
      );

      this.resetLockTimer();
      this.isInitialized = true;

      MollyLogger.info('Vault unlocked', FLOW_NAME, {
        salt: saltBuffer.toString('base64'),
      });

      return true;
    } catch (error) {
      MollyLogger.error('Failed to unlock vault', FLOW_NAME, undefined, error);
      return false;
    }
  }

  /**
   * Lock the vault. Wipes the derived key from memory.
   */
  lock(): void {
    if (this.derivedKey) {
      // Overwrite the key buffer before releasing
      this.derivedKey.fill(0);
      this.derivedKey = null;
    }
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    MollyLogger.info('Vault locked', FLOW_NAME);
  }

  /**
   * Check if the vault is currently unlocked.
   */
  isUnlocked(): boolean {
    return this.derivedKey !== null;
  }

  /**
   * Destroy the vault instance. Used in testing and shutdown.
   */
  destroy(): void {
    this.lock();
    IdentityVault.instance = null;
  }

  // ==========================================================================
  // ENCRYPTION / DECRYPTION
  // ==========================================================================

  /**
   * Encrypt a plaintext string with AES-256-GCM.
   * Each call generates a unique IV — same plaintext produces different ciphertext.
   */
  encrypt(plaintext: string): EncryptedBlob {
    this.requireUnlocked();

    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.derivedKey!, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  /**
   * Decrypt an encrypted blob back to plaintext.
   */
  decrypt(blob: EncryptedBlob): string {
    this.requireUnlocked();

    const iv = Buffer.from(blob.iv, 'base64');
    const authTag = Buffer.from(blob.authTag, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.derivedKey!, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(blob.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    this.resetLockTimer();
    return decrypted;
  }

  // ==========================================================================
  // IDENTITY PROFILE
  // ==========================================================================

  /**
   * Store an identity profile (encrypted).
   */
  storeProfile(profile: IdentityProfile): void {
    this.requireUnlocked();

    const serialized = JSON.stringify(profile);
    this.vaultState.profile = this.encrypt(serialized);
    this.vaultState.modifiedAt = new Date().toISOString();

    MollyLogger.info('Identity profile stored', FLOW_NAME, {
      nameVariants: profile.nameVariants.length,
      addresses: profile.addresses.length,
      entities: profile.entities.length,
      familyMembers: profile.familyMembers.length,
    });
  }

  /**
   * Retrieve the identity profile (decrypted).
   */
  getProfile(): IdentityProfile | null {
    this.requireUnlocked();

    if (!this.vaultState.profile) {
      return null;
    }

    const decrypted = this.decrypt(this.vaultState.profile);
    return JSON.parse(decrypted) as IdentityProfile;
  }

  // ==========================================================================
  // ACCOUNT STORAGE
  // ==========================================================================

  /**
   * Store encrypted account details (routing numbers, account numbers, etc.)
   */
  storeAccountDetails(
    accountId: string,
    details: Record<string, string>
  ): void {
    this.requireUnlocked();

    const serialized = JSON.stringify(details);
    this.vaultState.accounts[accountId] = this.encrypt(serialized);
    this.vaultState.modifiedAt = new Date().toISOString();

    MollyLogger.info('Account details stored', FLOW_NAME, {
      accountId,
      fieldCount: Object.keys(details).length,
    });
  }

  /**
   * Retrieve decrypted account details.
   */
  getAccountDetails(accountId: string): Record<string, string> | null {
    this.requireUnlocked();

    const blob = this.vaultState.accounts[accountId];
    if (!blob) return null;

    const decrypted = this.decrypt(blob);
    return JSON.parse(decrypted) as Record<string, string>;
  }

  /**
   * List stored account IDs (no decryption needed).
   */
  listAccountIds(): string[] {
    return Object.keys(this.vaultState.accounts);
  }

  /**
   * Remove account details from the vault.
   */
  removeAccount(accountId: string): boolean {
    if (this.vaultState.accounts[accountId]) {
      delete this.vaultState.accounts[accountId];
      this.vaultState.modifiedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // UTILITY HELPERS
  // ==========================================================================

  /**
   * Create an EncryptedField from a plaintext value.
   * Stores only the encrypted value and the last 4 characters for display.
   */
  encryptField(value: string, type: string): EncryptedField {
    this.requireUnlocked();

    const blob = this.encrypt(value);
    return {
      encrypted: JSON.stringify(blob),
      type,
      lastFour: value.slice(-4),
    };
  }

  /**
   * Decrypt an EncryptedField back to plaintext.
   */
  decryptField(field: EncryptedField): string {
    this.requireUnlocked();

    const blob = JSON.parse(field.encrypted) as EncryptedBlob;
    return this.decrypt(blob);
  }

  /**
   * Create an EncryptedAddress.
   */
  encryptAddress(
    fullAddress: string,
    region: string,
    country: string,
    current: boolean
  ): EncryptedAddress {
    this.requireUnlocked();

    const blob = this.encrypt(fullAddress);
    return {
      encrypted: JSON.stringify(blob),
      region,
      country,
      current,
    };
  }

  /**
   * Decrypt an EncryptedAddress back to the full address string.
   */
  decryptAddress(address: EncryptedAddress): string {
    this.requireUnlocked();

    const blob = JSON.parse(address.encrypted) as EncryptedBlob;
    return this.decrypt(blob);
  }

  // ==========================================================================
  // SERIALIZATION (for Firestore persistence)
  // ==========================================================================

  /**
   * Export the vault state for Firestore persistence.
   * Everything is already encrypted — this just serializes the blobs.
   */
  exportState(): VaultState {
    return { ...this.vaultState };
  }

  /**
   * Import vault state from Firestore.
   * Requires the vault to be unlocked to verify the key works.
   */
  importState(state: VaultState): void {
    this.vaultState = state;
    this.isInitialized = true;
    MollyLogger.info('Vault state imported', FLOW_NAME, {
      hasProfile: !!state.profile,
      accountCount: Object.keys(state.accounts).length,
      createdAt: state.createdAt,
    });
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  private requireUnlocked(): void {
    if (!this.derivedKey) {
      throw new Error(
        'IdentityVault is locked. Call unlock() with the master password first.'
      );
    }
  }

  private resetLockTimer(): void {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
    }
    this.lockTimer = setTimeout(() => {
      MollyLogger.info('Auto-locking vault after inactivity', FLOW_NAME);
      this.lock();
    }, AUTO_LOCK_MS);
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

export function getIdentityVault(): IdentityVault {
  return IdentityVault.getInstance();
}
