/**
 * @fileOverview Base Scanner — Abstract Foundation for All Asset Scanners
 *
 * Every jurisdiction, every registry, every exchange — they all plug
 * into this base class. The interface is the same everywhere:
 * search, match, report. Only the connectors change.
 *
 * Scanners are modular. Add a new country? Extend BaseScanner.
 * Add a new exchange? Extend BaseScanner.
 *
 * Built-in features:
 * - Rate limiting (don't get blocked)
 * - Retry with exponential backoff
 * - Audit logging (every search is tracked)
 * - Human gate detection (CAPTCHA, notary, etc.)
 * - Match confidence scoring
 */

import { MollyLogger } from '@/ai/logger';
import type {
  AssetType,
  DiscoveredAsset,
  ScanResult,
  ScannerType,
  IdentityProfile,
  AuditEntry,
  AssetSource,
} from './types';

const FLOW_NAME = 'base-scanner';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RATE_LIMIT_MS = 2000; // 2 seconds between requests
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// ============================================================================
// BASE SCANNER
// ============================================================================

export abstract class BaseScanner {
  /** Scanner type identifier */
  abstract readonly scannerType: ScannerType;
  /** Human-readable name */
  abstract readonly name: string;
  /** Countries/regions this scanner covers */
  abstract readonly regions: string[];

  /** Rate limit between requests (ms) */
  protected rateLimitMs: number = DEFAULT_RATE_LIMIT_MS;
  /** Last request timestamp for rate limiting */
  private lastRequestAt = 0;
  /** Whether this scanner supports programmatic API access */
  protected hasApiAccess = false;
  /** Whether this scanner is currently running */
  private isRunning = false;

  // ==========================================================================
  // ABSTRACT METHODS — Implement per scanner
  // ==========================================================================

  /**
   * Search for unclaimed assets matching the identity profile.
   * This is the core method each scanner must implement.
   */
  protected abstract search(
    profile: IdentityProfile
  ): Promise<DiscoveredAsset[]>;

  /**
   * Check if this scanner's target systems are reachable.
   */
  abstract healthCheck(): Promise<boolean>;

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Execute a full scan against this scanner's registries.
   * Handles rate limiting, retries, auditing, and error handling.
   */
  async scan(profile: IdentityProfile): Promise<ScanResult> {
    if (this.isRunning) {
      MollyLogger.warn(
        `Scanner ${this.name} is already running, skipping`,
        FLOW_NAME
      );
      return this.emptyResult('Scanner already running');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const errors: string[] = [];

    MollyLogger.info(`Starting scan: ${this.name}`, FLOW_NAME, {
      scannerType: this.scannerType,
      regions: this.regions,
      nameVariants: profile.nameVariants.length,
    });

    try {
      await this.rateLimit();

      const assets = await this.withRetry(() => this.search(profile));

      // Score confidence for each match
      const scoredAssets = assets.map((asset) => ({
        ...asset,
        matchConfidence: this.scoreConfidence(asset, profile),
        auditLog: [
          ...asset.auditLog,
          this.audit('scan-complete', `Confidence: ${asset.matchConfidence}`),
        ],
      }));

      const result: ScanResult = {
        scannerType: this.scannerType,
        assets: scoredAssets,
        recordsSearched: scoredAssets.length, // Subclass can override
        matchesFound: scoredAssets.filter((a) => a.matchConfidence > 0.5)
          .length,
        durationMs: Date.now() - startTime,
        errors,
        completedAt: new Date().toISOString(),
      };

      MollyLogger.info(`Scan complete: ${this.name}`, FLOW_NAME, {
        matchesFound: result.matchesFound,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);
      MollyLogger.error(
        `Scan failed: ${this.name}`,
        FLOW_NAME,
        undefined,
        error
      );

      return this.emptyResult(errorMsg);
    } finally {
      this.isRunning = false;
    }
  }

  // ==========================================================================
  // CONFIDENCE SCORING
  // ==========================================================================

  /**
   * Score how confident we are that a discovered asset belongs to our profile.
   *
   * Factors:
   * - Exact name match: 0.4
   * - Name variant match: 0.25
   * - Address/region match: 0.2
   * - Entity/company match: 0.15
   *
   * Subclasses can override for domain-specific scoring.
   */
  protected scoreConfidence(
    asset: DiscoveredAsset,
    profile: IdentityProfile
  ): number {
    let score = 0;
    const matchedName = asset.matchedIdentity.toLowerCase();

    // Exact primary name match
    if (matchedName === profile.primaryName.toLowerCase()) {
      score += 0.4;
    }

    // Name variant match
    const variantMatch = profile.nameVariants.some(
      (v) => v.toLowerCase() === matchedName
    );
    if (variantMatch) {
      score += 0.25;
    }

    // Region match
    if (asset.source.region) {
      const regionMatch = profile.addresses.some(
        (a) => a.region.toLowerCase() === asset.source.region!.toLowerCase()
      );
      if (regionMatch) {
        score += 0.2;
      }
    }

    // Entity match
    const entityMatch = profile.entities.some(
      (e) =>
        matchedName.includes(e.toLowerCase()) ||
        e.toLowerCase().includes(matchedName)
    );
    if (entityMatch) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================

  /**
   * Wait if we're requesting too fast.
   */
  protected async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.rateLimitMs) {
      const waitMs = this.rateLimitMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  // ==========================================================================
  // RETRY LOGIC
  // ==========================================================================

  /**
   * Execute a function with exponential backoff retry.
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    retries: number = MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < retries) {
          const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
          MollyLogger.warn(
            `Retry ${attempt + 1}/${retries} for ${this.name} after ${backoffMs}ms`,
            FLOW_NAME,
            { error: lastError.message }
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError;
  }

  // ==========================================================================
  // HUMAN GATE DETECTION
  // ==========================================================================

  /**
   * Detect if a response indicates a human gate (CAPTCHA, notary, etc.).
   * Subclasses should call this on HTTP responses.
   */
  protected detectHumanGate(responseBody: string): boolean {
    const gates = [
      'captcha',
      'recaptcha',
      'hcaptcha',
      'verify you are human',
      'prove you are not a robot',
      'notarized',
      'notary required',
      'in-person verification',
      'must appear in person',
      'original documents required',
    ];

    const lower = responseBody.toLowerCase();
    return gates.some((gate) => lower.includes(gate));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Create an audit entry.
   */
  protected audit(action: string, details?: string): AuditEntry {
    return {
      action,
      timestamp: new Date().toISOString(),
      actor: 'scanner',
      details,
    };
  }

  /**
   * Create a new DiscoveredAsset template.
   */
  protected createAsset(
    type: AssetType,
    description: string,
    estimatedValue: number,
    currency: string,
    source: AssetSource,
    matchedIdentity: string
  ): DiscoveredAsset {
    const id = `${this.scannerType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id,
      type,
      status: 'discovered',
      description,
      estimatedValue,
      currency,
      source,
      matchedIdentity,
      matchConfidence: 0,
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      auditLog: [this.audit('discovered', `Found by ${this.name}`)],
    };
  }

  /**
   * Empty scan result (used for errors or skips).
   */
  private emptyResult(error: string): ScanResult {
    return {
      scannerType: this.scannerType,
      assets: [],
      recordsSearched: 0,
      matchesFound: 0,
      durationMs: 0,
      errors: [error],
      completedAt: new Date().toISOString(),
    };
  }
}
