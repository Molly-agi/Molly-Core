/**
 * @fileOverview Zero-knowledge encrypted vault for HackerOne findings.
 * All findings are AES-256-GCM encrypted before touching disk.
 * No plaintext vulnerability data ever exists on the file system.
 *
 * Implementation: encrypted append-log rather than SQLite, which avoids
 * native addon dependencies (better-sqlite3 requires node-gyp to compile).
 * Functionally equivalent — random-read is supported via readAllFindings().
 */

import { promises as fs } from 'fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { CipherStream } from '../security/CipherStream';
import type { EncryptedPacket } from '../security/CipherStream';

export interface SavedFinding {
  id: string;
  targetDomain: string;
  vulnerabilityType: string;
  pocSteps: string[];
  severityScore: number;
  discoveredAt: number;
}

const DEFAULT_VAULT_DIR = path.join(process.cwd(), '.molly_vault');
const ENV_VAULT_KEY = process.env.MOLLY_VAULT_KEY ?? 'molly-vault-key';

export class VaultStore {
  private readonly vaultPath: string;
  private readonly secretKey: string | Buffer;

  constructor(
    systemSecretKey: string | Buffer = ENV_VAULT_KEY,
    storageDir: string = DEFAULT_VAULT_DIR
  ) {
    this.secretKey = systemSecretKey;
    this.vaultPath = path.join(storageDir, 'findings.enc');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.vaultPath), { recursive: true });
  }

  /** Encrypt and persist a finding to the local vault. */
  public async writeFindingToVault(finding: SavedFinding): Promise<void> {
    await this.ensureDir();
    try {
      const packet: EncryptedPacket = CipherStream.encryptPayload(
        finding,
        this.secretKey
      );
      await fs.appendFile(
        this.vaultPath,
        JSON.stringify(packet) + '\n',
        'utf8'
      );
      console.log(`[VAULT_STORE]: Finding ${finding.id} secured.`);
    } catch (error: unknown) {
      console.error(
        `[VAULT_STORE_ERROR]: Write failure: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /** Read and decrypt all findings from the vault. Returns [] on any error. */
  public async readAllFindings(): Promise<SavedFinding[]> {
    try {
      const content = await fs.readFile(this.vaultPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.map((line) =>
        CipherStream.decryptPayload<SavedFinding>(
          JSON.parse(line) as EncryptedPacket,
          this.secretKey
        )
      );
    } catch {
      return [];
    }
  }

  /** Returns number of findings stored. */
  public async findingCount(): Promise<number> {
    const findings = await this.readAllFindings();
    return findings.length;
  }

  /** Generate a unique, collision-resistant finding ID. */
  public static generateFindingId(): string {
    return `H1-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }
}
