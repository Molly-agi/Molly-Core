/**
 * @fileOverview Batch Scanner — Multi-Client Scanning Engine
 *
 * Runs scans across all active clients in the system.
 * Feeds each client's identity profile through the registered scanners,
 * links discovered assets to the correct client, and manages rate limits
 * to stay respectful to the registries.
 *
 * This is Molly's workhorse — she can scan for thousands of people
 * while the family sleeps.
 */

import { MollyLogger } from '@/ai/logger';
import { getRecoveryOrchestrator } from './recovery-orchestrator';
import { getClientManager } from './client-manager';
import type { ScanResult, DiscoveredAsset } from './types';

const FLOW_NAME = 'batch-scanner';

/** Delay between client scans to avoid hammering registries */
const INTER_CLIENT_DELAY_MS = 5000;

export interface BatchScanResult {
  /** Total clients scanned */
  clientsScanned: number;
  /** Total new assets discovered across all clients */
  totalAssetsFound: number;
  /** Total estimated value discovered */
  totalValueFound: number;
  /** Per-client results */
  clientResults: {
    clientId: string;
    clientName: string;
    assetsFound: number;
    estimatedValue: number;
    errors: string[];
  }[];
  /** Overall errors */
  errors: string[];
  /** Duration */
  durationMs: number;
  /** Timestamp */
  completedAt: string;
}

/**
 * Run a batch scan across all active clients.
 *
 * For each active client:
 *   1. Get their search profile
 *   2. Run it through all registered scanners
 *   3. Link discovered assets to the client
 *   4. Wait between clients to respect rate limits
 */
export async function runBatchScan(): Promise<BatchScanResult> {
  const orchestrator = getRecoveryOrchestrator();
  const clientManager = getClientManager();
  const startTime = Date.now();

  const activeProfiles = clientManager.getActiveProfiles();

  if (activeProfiles.length === 0) {
    MollyLogger.info('No active clients to scan', FLOW_NAME);
    return {
      clientsScanned: 0,
      totalAssetsFound: 0,
      totalValueFound: 0,
      clientResults: [],
      errors: [],
      durationMs: 0,
      completedAt: new Date().toISOString(),
    };
  }

  MollyLogger.info(
    `Starting batch scan for ${activeProfiles.length} clients`,
    FLOW_NAME
  );

  const clientResults: BatchScanResult['clientResults'] = [];
  const overallErrors: string[] = [];
  let totalAssets = 0;
  let totalValue = 0;

  for (let i = 0; i < activeProfiles.length; i++) {
    const { clientId, profile } = activeProfiles[i]!;
    const client = clientManager.getClient(clientId);
    const clientName = client?.name || clientId;

    try {
      MollyLogger.info(
        `Scanning for client ${i + 1}/${activeProfiles.length}: ${clientName}`,
        FLOW_NAME
      );

      // Run all scanners for this client's profile
      const scanResults: ScanResult[] = await orchestrator.runFullScan(profile);

      // Collect new assets and link them to the client
      let clientAssetsFound = 0;
      let clientValue = 0;
      const clientErrors: string[] = [];

      for (const result of scanResults) {
        if (result.errors.length > 0) {
          clientErrors.push(...result.errors);
        }

        for (const asset of result.assets) {
          // Link asset to client with fee calculation
          const link = clientManager.linkAsset(clientId, asset);
          if (link) {
            clientAssetsFound++;
            clientValue += asset.estimatedValue;
          }
        }
      }

      clientResults.push({
        clientId,
        clientName,
        assetsFound: clientAssetsFound,
        estimatedValue: clientValue,
        errors: clientErrors,
      });

      totalAssets += clientAssetsFound;
      totalValue += clientValue;

      // Update client status if assets were found
      if (clientAssetsFound > 0 && client?.status === 'active') {
        clientManager.updateStatus(
          clientId,
          'recovery-pending',
          `${clientAssetsFound} assets found worth ~$${clientValue.toFixed(2)}`
        );
      }
    } catch (error) {
      const msg = `Client scan failed for ${clientName}: ${error instanceof Error ? error.message : String(error)}`;
      MollyLogger.error(msg, FLOW_NAME, { clientId }, error);
      overallErrors.push(msg);

      clientResults.push({
        clientId,
        clientName,
        assetsFound: 0,
        estimatedValue: 0,
        errors: [msg],
      });
    }

    // Rate limit between clients
    if (i < activeProfiles.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, INTER_CLIENT_DELAY_MS)
      );
    }
  }

  const durationMs = Date.now() - startTime;

  MollyLogger.info('Batch scan complete', FLOW_NAME, {
    clientsScanned: activeProfiles.length,
    totalAssetsFound: totalAssets,
    totalValueFound: totalValue,
    durationMs,
  });

  return {
    clientsScanned: activeProfiles.length,
    totalAssetsFound: totalAssets,
    totalValueFound: totalValue,
    clientResults,
    errors: overallErrors,
    durationMs,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Scan for a single client by ID.
 */
export async function scanForClient(
  clientId: string
): Promise<BatchScanResult['clientResults'][0] | null> {
  const orchestrator = getRecoveryOrchestrator();
  const clientManager = getClientManager();
  const client = clientManager.getClient(clientId);

  if (!client) {
    MollyLogger.warn(`Client not found: ${clientId}`, FLOW_NAME);
    return null;
  }

  if (!client.agreementSigned) {
    MollyLogger.warn(
      `Client has not signed agreement: ${client.name}`,
      FLOW_NAME
    );
    return null;
  }

  MollyLogger.info(`Scanning for client: ${client.name}`, FLOW_NAME);

  const scanResults = await orchestrator.runFullScan(client.searchProfile);
  let assetsFound = 0;
  let estimatedValue = 0;
  const errors: string[] = [];

  for (const result of scanResults) {
    errors.push(...result.errors);
    for (const asset of result.assets) {
      const link = clientManager.linkAsset(clientId, asset);
      if (link) {
        assetsFound++;
        estimatedValue += asset.estimatedValue;
      }
    }
  }

  return {
    clientId,
    clientName: client.name,
    assetsFound,
    estimatedValue,
    errors,
  };
}
