import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { MollyLogger, generateTraceId } from '../logger';
import { getRecoveryOrchestrator } from '../recovery/recovery-orchestrator';
import { getUSRegistryScanner } from '../recovery/scanners/us-registry-scanner';
import { getCryptoRecoveryScanner } from '../recovery/scanners/crypto-recovery-scanner';
import type { IdentityProfile } from '../recovery/types';
import type { OperatingMode } from '../recovery/recovery-orchestrator';

const FLOW_NAME = 'asset-recovery';

// ============================================================================
// SCHEMAS
// ============================================================================

const RecoveryScanInputSchema = z.object({
  /** Names to search (primary + variants) */
  names: z.array(z.string()).min(1),
  /** States/regions with known address history (priority search) */
  priorityStates: z.array(z.string()).optional(),
  /** Entity names (companies, trusts, estates) */
  entities: z.array(z.string()).optional(),
  /** Which scanners to run: 'all' | 'us' | 'crypto' */
  scanScope: z.enum(['all', 'us', 'crypto']).default('all'),
});

const RecoveryStatusInputSchema = z.object({
  /** Optional: filter by asset status */
  statusFilter: z
    .enum([
      'discovered',
      'verified',
      'claim-prepared',
      'claim-filed',
      'pending-review',
      'human-gate',
      'approved',
      'transferred',
      'routed',
      'rejected',
      'expired',
    ])
    .optional(),
});

const RecoveryModeInputSchema = z.object({
  mode: z.enum([
    'discovery-only',
    'discovery-contact',
    'full-operation',
    'paused',
  ]),
});

// ============================================================================
// FLOWS
// ============================================================================

/**
 * Asset Recovery Scan Flow
 *
 * Runs the recovery scanners against unclaimed property databases.
 * This is the core "go find money" operation.
 */
export const assetRecoveryScanFlow = ai.defineFlow(
  {
    name: 'assetRecoveryScan',
    inputSchema: RecoveryScanInputSchema,
    outputSchema: z.object({
      results: z.array(
        z.object({
          scannerType: z.string(),
          matchesFound: z.number(),
          recordsSearched: z.number(),
          durationMs: z.number(),
          errors: z.array(z.string()),
          assets: z.array(
            z.object({
              id: z.string(),
              type: z.string(),
              description: z.string(),
              estimatedValue: z.number(),
              currency: z.string(),
              matchedIdentity: z.string(),
              matchConfidence: z.number(),
              source: z.object({
                name: z.string(),
                url: z.string(),
                country: z.string(),
                region: z.string().optional(),
              }),
            })
          ),
        })
      ),
      totalAssetsFound: z.number(),
      totalEstimatedValue: z.number(),
      error: z.string().optional(),
    }),
  },
  async ({ names, priorityStates, entities, scanScope }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(FLOW_NAME, { names, scanScope }, traceId);

    try {
      const orchestrator = getRecoveryOrchestrator();

      // Build an ad-hoc search profile from input
      const searchProfile: IdentityProfile = {
        primaryName: names[0],
        nameVariants: names.slice(1),
        addresses: (priorityStates || []).map((state) => ({
          encrypted: '',
          region: state,
          country: 'US',
          current: true,
        })),
        governmentIds: [],
        entities: entities || [],
        familyMembers: [],
      };

      // Register scanners if not already
      const registeredScanners = orchestrator.getScanners();
      if (registeredScanners.length === 0) {
        if (scanScope === 'all' || scanScope === 'us') {
          const usScanner = getUSRegistryScanner();
          if (priorityStates && priorityStates.length > 0) {
            usScanner.setPriorityStates(priorityStates);
          }
          orchestrator.registerScanner(usScanner);
        }
        if (scanScope === 'all' || scanScope === 'crypto') {
          orchestrator.registerScanner(getCryptoRecoveryScanner());
        }
      }

      // Ensure we're at least in discovery mode
      if (orchestrator.getMode() === 'paused') {
        orchestrator.setMode('discovery-only');
      }

      // Run the scan
      const scanResults = await orchestrator.runFullScan(searchProfile);

      // Summarize
      const totalAssetsFound = scanResults.reduce(
        (sum, r) => sum + r.assets.length,
        0
      );
      const totalEstimatedValue = scanResults.reduce(
        (sum, r) => sum + r.assets.reduce((s, a) => s + a.estimatedValue, 0),
        0
      );

      const results = scanResults.map((r) => ({
        scannerType: r.scannerType,
        matchesFound: r.matchesFound,
        recordsSearched: r.recordsSearched,
        durationMs: r.durationMs,
        errors: r.errors,
        assets: r.assets.map((a) => ({
          id: a.id,
          type: a.type,
          description: a.description,
          estimatedValue: a.estimatedValue,
          currency: a.currency,
          matchedIdentity: a.matchedIdentity,
          matchConfidence: a.matchConfidence,
          source: {
            name: a.source.name,
            url: a.source.url,
            country: a.source.country,
            region: a.source.region,
          },
        })),
      }));

      MollyLogger.logFlowComplete(
        FLOW_NAME,
        { totalAssetsFound, totalEstimatedValue },
        traceId
      );

      return { results, totalAssetsFound, totalEstimatedValue };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      MollyLogger.error('Recovery scan failed', FLOW_NAME, {}, error, traceId);
      return {
        results: [],
        totalAssetsFound: 0,
        totalEstimatedValue: 0,
        error: msg,
      };
    }
  }
);

/**
 * Recovery Status Flow
 *
 * Returns the current state of the recovery pipeline.
 */
export const assetRecoveryStatusFlow = ai.defineFlow(
  {
    name: 'assetRecoveryStatus',
    inputSchema: RecoveryStatusInputSchema,
    outputSchema: z.object({
      mode: z.string(),
      finderFeePercent: z.number(),
      scannerCount: z.number(),
      jurisdictionCount: z.number(),
      pipeline: z.object({
        discovered: z.number(),
        verified: z.number(),
        claimPrepared: z.number(),
        claimFiled: z.number(),
        pendingReview: z.number(),
        humanGate: z.number(),
        approved: z.number(),
        transferred: z.number(),
        routed: z.number(),
        rejected: z.number(),
        expired: z.number(),
        totalEstimatedValue: z.number(),
        totalRecoveredValue: z.number(),
      }),
      jurisdictions: z.array(
        z.object({
          country: z.string(),
          name: z.string(),
          hasEscheatment: z.boolean(),
          maxFinderFee: z.number().nullable(),
          localContact: z.string().optional(),
        })
      ),
      estimatedRevenue: z.number(),
    }),
  },
  async ({ statusFilter }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(FLOW_NAME + ':status', { statusFilter }, traceId);

    const orchestrator = getRecoveryOrchestrator();
    const report = orchestrator.getStatusReport();

    return {
      mode: report.mode,
      finderFeePercent: report.finderFeePercent,
      scannerCount: report.scanners.length,
      jurisdictionCount: report.jurisdictions.length,
      pipeline: report.pipeline,
      jurisdictions: report.jurisdictions.map((j) => ({
        country: j.country,
        name: j.name,
        hasEscheatment: j.hasEscheatment,
        maxFinderFee: j.maxFinderFee,
        localContact: j.localContact,
      })),
      estimatedRevenue: report.estimatedRevenue,
    };
  }
);

/**
 * Recovery Mode Flow
 *
 * Set the operating mode: discovery-only → discovery-contact → full-operation
 */
export const assetRecoveryModeFlow = ai.defineFlow(
  {
    name: 'assetRecoveryMode',
    inputSchema: RecoveryModeInputSchema,
    outputSchema: z.object({
      previousMode: z.string(),
      newMode: z.string(),
      success: z.boolean(),
    }),
  },
  async ({ mode }) => {
    const traceId = generateTraceId();
    MollyLogger.logFlowStart(FLOW_NAME + ':mode', { mode }, traceId);

    const orchestrator = getRecoveryOrchestrator();
    const previousMode = orchestrator.getMode();
    orchestrator.setMode(mode as OperatingMode);

    MollyLogger.logFlowComplete(
      FLOW_NAME + ':mode',
      { previousMode, newMode: mode },
      traceId
    );

    return {
      previousMode,
      newMode: mode,
      success: true,
    };
  }
);

// ============================================================================
// PUBLIC API
// ============================================================================

export async function runAssetRecoveryScan(input: {
  names: string[];
  priorityStates?: string[];
  entities?: string[];
  scanScope?: 'all' | 'us' | 'crypto';
}) {
  return assetRecoveryScanFlow({
    names: input.names,
    priorityStates: input.priorityStates,
    entities: input.entities,
    scanScope: input.scanScope || 'all',
  });
}

export async function getAssetRecoveryStatus(statusFilter?: string) {
  return assetRecoveryStatusFlow({
    statusFilter: statusFilter as
      | 'discovered'
      | 'verified'
      | 'claim-prepared'
      | 'claim-filed'
      | 'pending-review'
      | 'human-gate'
      | 'approved'
      | 'transferred'
      | 'routed'
      | 'rejected'
      | 'expired'
      | undefined,
  });
}

export async function setAssetRecoveryMode(
  mode: 'discovery-only' | 'discovery-contact' | 'full-operation' | 'paused'
) {
  return assetRecoveryModeFlow({ mode });
}
