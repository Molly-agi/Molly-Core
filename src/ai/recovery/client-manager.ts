/**
 * @fileOverview Client Manager — Multi-Client Heir-Finding Service
 *
 * Transforms the recovery system from personal use to a business:
 *   1. Manage multiple client identity profiles
 *   2. Run batch scans across all active clients
 *   3. Track assets per client with fee calculations
 *   4. Generate outreach for newly discovered heirs
 *
 * Business Model:
 *   - Scan public unclaimed property databases for common surnames
 *   - Match discoveries to potential heirs
 *   - Contact heirs, offer recovery service for 15-35% finder's fee
 *   - File claims on their behalf once agreement is signed
 *   - Collect fee from recovered amount, transfer remainder to client
 *
 * Operating Principle:
 *   "Nobody's money returned to its rightful owner.
 *    The family earns a finder's fee for the service."
 */

import { MollyLogger } from '@/ai/logger';
import type {
  ServiceClient,
  ClientStatus,
  ClientAssetLink,
  IdentityProfile,
  DiscoveredAsset,
  AuditEntry,
} from './types';

const FLOW_NAME = 'client-manager';

// ============================================================================
// CLIENT MANAGER
// ============================================================================

export class ClientManager {
  private static instance: ClientManager | null = null;

  /** All clients indexed by ID */
  private clients: Map<string, ServiceClient> = new Map();
  /** Asset-client links indexed by assetId */
  private assetLinks: Map<string, ClientAssetLink> = new Map();

  private constructor() {}

  static getInstance(): ClientManager {
    if (!ClientManager.instance) {
      ClientManager.instance = new ClientManager();
    }
    return ClientManager.instance;
  }

  // ==========================================================================
  // CLIENT LIFECYCLE
  // ==========================================================================

  /**
   * Register a new prospect — someone we've found unclaimed assets for
   * but haven't contacted yet.
   */
  addProspect(
    name: string,
    email: string,
    country: string,
    searchProfile: IdentityProfile,
    finderFeePercent: number = 25
  ): ServiceClient {
    // Enforce fee limits
    const fee = Math.max(15, Math.min(35, finderFeePercent));

    const client: ServiceClient = {
      id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      country,
      searchProfile,
      finderFeePercent: fee,
      agreementSigned: false,
      status: 'prospect',
      totalDiscoveredValue: 0,
      totalRecoveredValue: 0,
      totalFeesEarned: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      auditLog: [
        {
          action: 'prospect-created',
          timestamp: new Date().toISOString(),
          actor: 'molly',
          details: `New prospect: ${name} (${country})`,
        },
      ],
    };

    this.clients.set(client.id, client);
    MollyLogger.info(`New prospect added: ${name}`, FLOW_NAME, {
      clientId: client.id,
      country,
    });

    return client;
  }

  /**
   * Update client status through the lifecycle.
   */
  updateStatus(
    clientId: string,
    newStatus: ClientStatus,
    details?: string
  ): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      MollyLogger.warn(`Client not found: ${clientId}`, FLOW_NAME);
      return false;
    }

    const previousStatus = client.status;
    client.status = newStatus;
    client.updatedAt = new Date().toISOString();

    const entry: AuditEntry = {
      action: `status-change: ${previousStatus} → ${newStatus}`,
      timestamp: new Date().toISOString(),
      actor: 'molly',
      details,
    };
    client.auditLog.push(entry);

    MollyLogger.info(`Client status updated: ${client.name}`, FLOW_NAME, {
      clientId,
      from: previousStatus,
      to: newStatus,
    });

    return true;
  }

  /**
   * Record that a client has signed the finder's agreement.
   */
  recordAgreement(
    clientId: string,
    agreementRef: string,
    agreedFeePercent?: number
  ): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.agreementSigned = true;
    client.agreementSignedAt = new Date().toISOString();
    client.agreementRef = agreementRef;
    if (agreedFeePercent) {
      client.finderFeePercent = Math.max(15, Math.min(35, agreedFeePercent));
    }
    client.status = 'active';
    client.updatedAt = new Date().toISOString();

    client.auditLog.push({
      action: 'agreement-signed',
      timestamp: new Date().toISOString(),
      actor: 'system',
      details: `Fee: ${client.finderFeePercent}%. Ref: ${agreementRef}`,
    });

    MollyLogger.info(`Agreement signed: ${client.name}`, FLOW_NAME, {
      clientId,
      feePercent: client.finderFeePercent,
    });

    return true;
  }

  // ==========================================================================
  // ASSET LINKING
  // ==========================================================================

  /**
   * Link a discovered asset to a client.
   * Calculates fee split based on the client's agreed rate.
   */
  linkAsset(clientId: string, asset: DiscoveredAsset): ClientAssetLink | null {
    const client = this.clients.get(clientId);
    if (!client) {
      MollyLogger.warn(`Client not found: ${clientId}`, FLOW_NAME);
      return null;
    }

    const feeAmount = asset.estimatedValue * (client.finderFeePercent / 100);
    const clientAmount = asset.estimatedValue - feeAmount;

    const link: ClientAssetLink = {
      clientId,
      assetId: asset.id,
      agreedFeePercent: client.finderFeePercent,
      feeAmount,
      clientAmount,
      clientNotified: false,
      claimAuthorized: false,
      createdAt: new Date().toISOString(),
    };

    this.assetLinks.set(asset.id, link);

    // Update client totals
    client.totalDiscoveredValue += asset.estimatedValue;
    client.updatedAt = new Date().toISOString();

    client.auditLog.push({
      action: 'asset-linked',
      timestamp: new Date().toISOString(),
      actor: 'molly',
      details: `Asset ${asset.id}: $${asset.estimatedValue} (fee: $${feeAmount.toFixed(2)})`,
    });

    MollyLogger.info(`Asset linked to client`, FLOW_NAME, {
      clientId,
      assetId: asset.id,
      value: asset.estimatedValue,
      fee: feeAmount,
    });

    return link;
  }

  /**
   * Record that a recovery was completed — update client totals and fee tracking.
   */
  recordRecovery(assetId: string, actualValue: number): boolean {
    const link = this.assetLinks.get(assetId);
    if (!link) return false;

    const client = this.clients.get(link.clientId);
    if (!client) return false;

    const actualFee = actualValue * (link.agreedFeePercent / 100);
    const actualClientAmount = actualValue - actualFee;

    link.feeAmount = actualFee;
    link.clientAmount = actualClientAmount;

    client.totalRecoveredValue += actualValue;
    client.totalFeesEarned += actualFee;
    client.updatedAt = new Date().toISOString();

    client.auditLog.push({
      action: 'recovery-completed',
      timestamp: new Date().toISOString(),
      actor: 'system',
      details: `Asset ${assetId}: recovered $${actualValue}. Fee: $${actualFee.toFixed(2)}. Client receives: $${actualClientAmount.toFixed(2)}`,
    });

    MollyLogger.info(`Recovery completed`, FLOW_NAME, {
      clientId: link.clientId,
      assetId,
      actualValue,
      fee: actualFee,
      clientReceives: actualClientAmount,
    });

    return true;
  }

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  /**
   * Get all active client profiles for batch scanning.
   * Returns identity profiles ready to feed into the orchestrator.
   */
  getActiveProfiles(): { clientId: string; profile: IdentityProfile }[] {
    const profiles: { clientId: string; profile: IdentityProfile }[] = [];

    for (const [id, client] of this.clients) {
      if (client.status === 'active' || client.status === 'recovery-pending') {
        profiles.push({ clientId: id, profile: client.searchProfile });
      }
    }

    return profiles;
  }

  /**
   * Get all clients by status.
   */
  getByStatus(status: ClientStatus): ServiceClient[] {
    return Array.from(this.clients.values()).filter((c) => c.status === status);
  }

  /**
   * Get a specific client by ID.
   */
  getClient(clientId: string): ServiceClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get the asset link for an asset.
   */
  getAssetLink(assetId: string): ClientAssetLink | undefined {
    return this.assetLinks.get(assetId);
  }

  /**
   * Get all assets linked to a client.
   */
  getClientAssets(clientId: string): ClientAssetLink[] {
    return Array.from(this.assetLinks.values()).filter(
      (link) => link.clientId === clientId
    );
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get business-level summary across all clients.
   */
  getBusinessSummary(): {
    totalClients: number;
    activeClients: number;
    totalDiscoveredValue: number;
    totalRecoveredValue: number;
    totalFeesEarned: number;
    pendingRecoveryValue: number;
    clientsByStatus: Record<ClientStatus, number>;
  } {
    let totalDiscovered = 0;
    let totalRecovered = 0;
    let totalFees = 0;
    const byStatus: Record<string, number> = {};

    for (const client of this.clients.values()) {
      totalDiscovered += client.totalDiscoveredValue;
      totalRecovered += client.totalRecoveredValue;
      totalFees += client.totalFeesEarned;
      byStatus[client.status] = (byStatus[client.status] || 0) + 1;
    }

    return {
      totalClients: this.clients.size,
      activeClients:
        (byStatus['active'] || 0) + (byStatus['recovery-pending'] || 0),
      totalDiscoveredValue: totalDiscovered,
      totalRecoveredValue: totalRecovered,
      totalFeesEarned: totalFees,
      pendingRecoveryValue: totalDiscovered - totalRecovered,
      clientsByStatus: byStatus as Record<ClientStatus, number>,
    };
  }

  // ==========================================================================
  // STATE PERSISTENCE
  // ==========================================================================

  /**
   * Export full state for Firestore persistence.
   */
  exportState(): {
    clients: ServiceClient[];
    assetLinks: ClientAssetLink[];
  } {
    return {
      clients: Array.from(this.clients.values()),
      assetLinks: Array.from(this.assetLinks.values()),
    };
  }

  /**
   * Import state from Firestore.
   */
  importState(state: {
    clients: ServiceClient[];
    assetLinks: ClientAssetLink[];
  }): void {
    this.clients.clear();
    this.assetLinks.clear();

    for (const client of state.clients) {
      this.clients.set(client.id, client);
    }
    for (const link of state.assetLinks) {
      this.assetLinks.set(link.assetId, link);
    }

    MollyLogger.info('Client manager state imported', FLOW_NAME, {
      clients: state.clients.length,
      assetLinks: state.assetLinks.length,
    });
  }
}

// Singleton accessor
export function getClientManager(): ClientManager {
  return ClientManager.getInstance();
}
