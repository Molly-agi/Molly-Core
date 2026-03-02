/**
 * @fileOverview Claim Tracker — From Discovery to Deposit
 *
 * Integrates with Molly's Promise Tracker. When an asset is discovered,
 * a promise is registered. When a claim is filed, the promise tracks
 * the deadline. When money arrives, the promise is fulfilled.
 *
 * Molly holds herself accountable for every asset in the pipeline.
 *
 * Pipeline:
 *   discovered → verified → claim-prepared → claim-filed →
 *   pending-review → approved → transferred → routed
 *
 * Side paths:
 *   human-gate (needs Eric)
 *   rejected (needs review)
 *   expired (deadline passed)
 */

import { MollyLogger } from '@/ai/logger';
import type {
  DiscoveredAsset,
  AssetStatus,
  ClaimPacket,
  RoutingInstruction,
  AuditEntry,
  ManagedAccount,
} from './types';

const FLOW_NAME = 'claim-tracker';

// ============================================================================
// CLAIM TRACKER
// ============================================================================

export class ClaimTracker {
  private static instance: ClaimTracker | null = null;

  /** All tracked assets indexed by ID */
  private assets: Map<string, DiscoveredAsset> = new Map();
  /** Managed accounts for routing */
  private accounts: Map<string, ManagedAccount> = new Map();

  private constructor() {}

  static getInstance(): ClaimTracker {
    if (!ClaimTracker.instance) {
      ClaimTracker.instance = new ClaimTracker();
    }
    return ClaimTracker.instance;
  }

  // ==========================================================================
  // ASSET LIFECYCLE
  // ==========================================================================

  /**
   * Register a newly discovered asset.
   */
  register(asset: DiscoveredAsset): void {
    this.assets.set(asset.id, asset);
    MollyLogger.info('Asset registered', FLOW_NAME, {
      id: asset.id,
      type: asset.type,
      estimatedValue: asset.estimatedValue,
      source: asset.source.name,
    });
  }

  /**
   * Register multiple assets from a scan result.
   */
  registerBatch(assets: DiscoveredAsset[]): number {
    let newCount = 0;
    for (const asset of assets) {
      if (!this.assets.has(asset.id)) {
        this.register(asset);
        newCount++;
      }
    }
    return newCount;
  }

  /**
   * Advance an asset to the next status in the pipeline.
   */
  advanceStatus(
    assetId: string,
    newStatus: AssetStatus,
    details?: string
  ): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) {
      MollyLogger.warn('Asset not found for status advance', FLOW_NAME, {
        assetId,
        newStatus,
      });
      return false;
    }

    const previousStatus = asset.status;
    asset.status = newStatus;
    asset.updatedAt = new Date().toISOString();
    asset.auditLog.push(
      this.audit(`status-change: ${previousStatus} → ${newStatus}`, details)
    );

    MollyLogger.info('Asset status advanced', FLOW_NAME, {
      id: assetId,
      from: previousStatus,
      to: newStatus,
      value: asset.estimatedValue,
    });

    return true;
  }

  /**
   * Attach a claim packet to an asset.
   */
  attachClaimPacket(assetId: string, packet: ClaimPacket): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    asset.claimPacket = packet;
    asset.status = 'claim-prepared';
    asset.updatedAt = new Date().toISOString();
    asset.auditLog.push(
      this.audit(
        'claim-packet-attached',
        `Submission: ${packet.submissionMethod}`
      )
    );

    MollyLogger.info('Claim packet attached', FLOW_NAME, {
      assetId,
      method: packet.submissionMethod,
      humanGate: packet.humanGateRequired,
    });

    return true;
  }

  /**
   * Attach routing instructions to an approved asset.
   */
  attachRouting(assetId: string, routing: RoutingInstruction): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    // Per Gemini's instructions: routing must be double-verified
    if (!routing.doubleVerified) {
      MollyLogger.warn(
        'Routing not double-verified — refusing to attach',
        FLOW_NAME,
        { assetId }
      );
      return false;
    }

    asset.routing = routing;
    asset.updatedAt = new Date().toISOString();
    asset.auditLog.push(
      this.audit(
        'routing-attached',
        `Target: ${routing.accountType} @ ${routing.institution} [DOUBLE-VERIFIED]`
      )
    );

    return true;
  }

  /**
   * Mark an asset as requiring human intervention.
   */
  flagHumanGate(assetId: string, reason: string): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    asset.status = 'human-gate';
    asset.updatedAt = new Date().toISOString();
    asset.auditLog.push(this.audit('human-gate-flagged', reason));

    MollyLogger.info('Human gate flagged', FLOW_NAME, { assetId, reason });

    return true;
  }

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  /**
   * Register a managed account for fund routing.
   */
  registerAccount(account: ManagedAccount): void {
    this.accounts.set(account.id, account);
    MollyLogger.info('Account registered', FLOW_NAME, {
      id: account.id,
      label: account.label,
      type: account.type,
      institution: account.institution,
    });
  }

  /**
   * Get all managed accounts.
   */
  getAccounts(): ManagedAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get accounts filtered by type.
   */
  getAccountsByType(type: ManagedAccount['type']): ManagedAccount[] {
    return this.getAccounts().filter((a) => a.type === type);
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get an asset by ID.
   */
  getAsset(assetId: string): DiscoveredAsset | undefined {
    return this.assets.get(assetId);
  }

  /**
   * Get all assets.
   */
  getAllAssets(): DiscoveredAsset[] {
    return Array.from(this.assets.values());
  }

  /**
   * Get assets by status.
   */
  getByStatus(status: AssetStatus): DiscoveredAsset[] {
    return this.getAllAssets().filter((a) => a.status === status);
  }

  /**
   * Get assets requiring human attention.
   */
  getHumanGates(): DiscoveredAsset[] {
    return this.getByStatus('human-gate');
  }

  /**
   * Get assets with approaching deadlines (within N days).
   */
  getUrgentClaims(withinDays: number = 7): DiscoveredAsset[] {
    const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    return this.getAllAssets().filter((a) => {
      if (!a.claimDeadline) return false;
      const deadline = new Date(a.claimDeadline).getTime();
      return (
        deadline <= cutoff &&
        a.status !== 'transferred' &&
        a.status !== 'routed'
      );
    });
  }

  /**
   * Get high-confidence matches (> threshold).
   */
  getHighConfidence(threshold: number = 0.7): DiscoveredAsset[] {
    return this.getAllAssets().filter((a) => a.matchConfidence >= threshold);
  }

  // ==========================================================================
  // PIPELINE SUMMARY
  // ==========================================================================

  /**
   * Get a summary of the entire pipeline.
   */
  getPipelineSummary(): {
    discovered: number;
    verified: number;
    claimPrepared: number;
    claimFiled: number;
    pendingReview: number;
    humanGate: number;
    approved: number;
    transferred: number;
    routed: number;
    rejected: number;
    expired: number;
    totalEstimatedValue: number;
    totalRecoveredValue: number;
  } {
    const all = this.getAllAssets();
    const countStatus = (s: AssetStatus) =>
      all.filter((a) => a.status === s).length;
    const sumValue = (statuses: AssetStatus[]) =>
      all
        .filter((a) => statuses.includes(a.status))
        .reduce((sum, a) => sum + a.estimatedValue, 0);

    return {
      discovered: countStatus('discovered'),
      verified: countStatus('verified'),
      claimPrepared: countStatus('claim-prepared'),
      claimFiled: countStatus('claim-filed'),
      pendingReview: countStatus('pending-review'),
      humanGate: countStatus('human-gate'),
      approved: countStatus('approved'),
      transferred: countStatus('transferred'),
      routed: countStatus('routed'),
      rejected: countStatus('rejected'),
      expired: countStatus('expired'),
      totalEstimatedValue: all.reduce((sum, a) => sum + a.estimatedValue, 0),
      totalRecoveredValue: sumValue(['transferred', 'routed']),
    };
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Export state for persistence.
   */
  exportState(): {
    assets: DiscoveredAsset[];
    accounts: ManagedAccount[];
  } {
    return {
      assets: this.getAllAssets(),
      accounts: this.getAccounts(),
    };
  }

  /**
   * Import state from persistence.
   */
  importState(state: {
    assets: DiscoveredAsset[];
    accounts: ManagedAccount[];
  }): void {
    this.assets.clear();
    this.accounts.clear();

    for (const asset of state.assets) {
      this.assets.set(asset.id, asset);
    }
    for (const account of state.accounts) {
      this.accounts.set(account.id, account);
    }

    MollyLogger.info('Claim tracker state imported', FLOW_NAME, {
      assetCount: state.assets.length,
      accountCount: state.accounts.length,
    });
  }

  /**
   * Destroy singleton (testing).
   */
  destroy(): void {
    this.assets.clear();
    this.accounts.clear();
    ClaimTracker.instance = null;
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  private audit(action: string, details?: string): AuditEntry {
    return {
      action,
      timestamp: new Date().toISOString(),
      actor: 'molly',
      details,
    };
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

export function getClaimTracker(): ClaimTracker {
  return ClaimTracker.getInstance();
}
