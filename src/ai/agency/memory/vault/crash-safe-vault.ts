// src/ai/agency/memory/vault/crash-safe-vault.ts
import * as fs from "node:fs";
import * as path from "node:path";

export interface VaultOptions {
  sync?: boolean;
  createDirectoryIfMissing?: boolean;
}

/**
 * Crash-Safe Vault Implementation
 * Uses atomic POSIX rename mechanics to ensure zero data truncation during writes.
 * "Fixing the dam itself" by guaranteeing file integrity across power failures.
 */
export class CrashSafeVault {
  
  /**
   * Writes a buffer to a file atomically.
   * 1. Writes to a temporary file (.tmp).
   * 2. Flushes to hardware (fsync) to ensure data is on disk.
   * 3. Renames the temporary file to the target path (atomic operation).
   */
  public async writeFile(filePath: string, data: Buffer, options: VaultOptions = {}): Promise<void> {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const tmpPath = path.join(dir, `${fileName}.${Date.now()}.tmp`);

    if (options.createDirectoryIfMissing && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, data);
      
      if (options.sync !== false) {
        fs.fsyncSync(fd); // Flush to hardware
      }
    } finally {
      fs.closeSync(fd);
    }

    // Atomic rename
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Synchronous version of commit for critical lifecycle blocks.
   */
  public commitSync(filePath: string, data: Buffer, options: VaultOptions = {}): void {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const tmpPath = path.join(dir, `${fileName}.${Date.now()}.tmp`);

    if (options.createDirectoryIfMissing && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Reads a file with basic error handling.
   */
  public readFile(filePath: string): Buffer {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Vault Error: File not found at ${filePath}`);
    }
    return fs.readFileSync(filePath);
  }
}
