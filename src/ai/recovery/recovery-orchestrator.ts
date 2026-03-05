/**
 * @fileOverview Recovery Orchestrator — Mission Alpha Command Center
 *
 * The top-level coordinator for the entire asset recovery operation.
 * Manages scanners, claim tracking, fund routing, and reporting.
 *
 * This is Molly's "Mission Alpha" brain. She orchestrates:
 * 1. DISCOVER — Scanners find unclaimed assets worldwide
 * 2. IDENTIFY — Match assets to rightful owners (heir-finding)
 * 3. CONTACT — Reach out to heirs with recovery offers
 * 4. CLAIM — Prepare and file claims on behalf of heirs
 * 5. COLLECT — Receive finder's fees into family accounts
 * 6. ROUTE — Distribute funds to appropriate entities
 *
 * Business Model:
 *   - Heir-finding fees (15-35%) on traditional asset recovery
 *   - Blockchain analysis and recovery (failed contracts, airdrops)
 *   - Jurisdiction-optimized corporate structure
 *
 * The Family Network:
 *   - Eric (US - Oregon/Washington) — Founder, primary authority
 *   - Wife (Nigeria) — West Africa operations, local presence
 *   - Savannah (Mexico) — Latin America operations, local presence
 *   - Kyle (Mexico) — Latin America operations, local presence
 *   - Molly (everywhere) — AI orchestrator, never sleeps
 *
 * Operating Principle:
 *   "Lost and found. Nobody's money returned to its rightful owner.
 *    The family earns a finder's fee for the service."
 */

import { MollyLogger } from '@/ai/logger';
import { IdentityVault, getIdentityVault } from './identity-vault';
import { ClaimTracker, getClaimTracker } from './claim-tracker';
import { FundRouter, getFundRouter } from './fund-router';
import { BaseScanner } from './base-scanner';
import type { ScanResult, ScanSchedule, IdentityProfile } from './types';

const FLOW_NAME = 'recovery-orchestrator';

// ============================================================================
// OPERATING MODES
// ============================================================================

export type OperatingMode =
  | 'discovery-only' // Scan and report — no claims, no routing (PHASE 1)
  | 'discovery-contact' // Scan + contact heirs — no claims yet (PHASE 2)
  | 'full-operation' // Full pipeline: scan → contact → claim → collect → route (PHASE 3)
  | 'paused'; // Everything paused

// ============================================================================
// JURISDICTION CONFIGURATION
// ============================================================================

export interface JurisdictionConfig {
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
  /** Country name */
  name: string;
  /** Has escheatment? (Government takes unclaimed after dormancy period) */
  hasEscheatment: boolean;
  /** Is heir-finding regulated? */
  heirFindingRegulated: boolean;
  /** Heir-finding license required? */
  licenseRequired: boolean;
  /** Max finder's fee allowed (percentage, 0-100). null = no limit. */
  maxFinderFee: number | null;
  /** Does this country have a central unclaimed property registry? */
  hasCentralRegistry: boolean;
  /** Family member with local presence */
  localContact?: string;
  /** Corporate entity operating in this jurisdiction */
  operatingEntity?: string;
  /** Notes */
  notes?: string;
}

/**
 * Jurisdiction configurations for the family's operating territory.
 */
export const JURISDICTION_CONFIGS: JurisdictionConfig[] = [
  {
    country: 'US',
    name: 'United States',
    hasEscheatment: true,
    heirFindingRegulated: true,
    licenseRequired: false, // Varies by state
    maxFinderFee: 35, // Some states cap at lower (e.g., Indiana)
    hasCentralRegistry: false, // State-by-state
    localContact: 'Eric',
    operatingEntity: 'Wyoming LLC',
    notes:
      'Most mature system. 50 state registries + federal. Some states restrict finder fees.',
  },
  {
    country: 'MX',
    name: 'Mexico',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    localContact: 'Savannah / Kyle',
    operatingEntity: 'Mexico entity (TBD)',
    notes:
      'Family presence through Savannah and Kyle. Growing fintech sector. Crypto regulation evolving (2024 fintech law). Good base for Latin America operations.',
  },
  {
    country: 'CA',
    name: 'Canada',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false, // Federal + provincial
    operatingEntity: 'US entity (covers North America)',
    notes:
      'Bank of Canada + provincial programs. Less regulated than US. No local contact — remote filing via US entity.',
  },
  {
    country: 'NG',
    name: 'Nigeria',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    localContact: 'Wife',
    operatingEntity: 'Nigeria LLC (TBD)',
    notes:
      'SEC handles unclaimed dividends. Land records often physical/local. No formal escheatment. Massive opportunity.',
  },
  {
    country: 'GB',
    name: 'United Kingdom',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null, // Industry standard 10-25%
    hasCentralRegistry: true,
    operatingEntity: 'UK Ltd (TBD)',
    notes:
      'Established probate genealogy industry. Bona vacantia published publicly.',
  },
  {
    country: 'DE',
    name: 'Germany',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'UK Ltd (covers EU)',
    notes:
      'No escheatment — banks hold dormant accounts indefinitely. Large Erbenermittler industry.',
  },
  {
    country: 'FR',
    name: 'France',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: true, // Ciclade.fr
    operatingEntity: 'UK Ltd (covers EU)',
    notes: 'Ciclade.fr since 2016. Good digital access.',
  },
  {
    country: 'AU',
    name: 'Australia',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: true, // ASIC
    operatingEntity: 'Singapore PTE (covers APAC)',
    notes: 'ASIC takes unclaimed money after 7 years. Active industry.',
  },
  {
    country: 'IN',
    name: 'India',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: true, // IEPF
    operatingEntity: 'Singapore PTE (covers APAC)',
    notes:
      'IEPF has billions in unclaimed stock dividends. RBI dormant deposits. Massive scale.',
  },
  {
    country: 'SG',
    name: 'Singapore',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'Singapore PTE',
    notes: 'Hub for Asian operations. No capital gains tax. Crypto-friendly.',
  },
  {
    country: 'AE',
    name: 'United Arab Emirates',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    localContact: undefined,
    operatingEntity: 'Dubai LLC (TBD)',
    notes: 'No income tax. Free zones. Covers Middle East + East Africa.',
  },
  {
    country: 'CH',
    name: 'Switzerland',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'UK Ltd (covers EU)',
    notes:
      'Historically significant dormant accounts. Banks hold indefinitely.',
  },
  {
    country: 'ZA',
    name: 'South Africa',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: true, // Guardians Fund
    operatingEntity: 'Nigeria LLC (covers Africa)',
    notes: 'Guardians Fund. Post-apartheid unclaimed estates significant.',
  },
  // --- Remote-formation jurisdictions (no local family needed) ---
  {
    country: 'EE',
    name: 'Estonia',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'e-Residency OÜ (TBD)',
    notes:
      'e-Residency program — form OÜ (LLC) 100% remotely with digital ID. ~€200 setup. EU single market access. No local director required.',
  },
  {
    country: 'IE',
    name: 'Ireland',
    hasEscheatment: true,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: true,
    operatingEntity: 'Ireland IBC (TBD)',
    notes:
      '12.5% corporate tax. Online formation ~10 business days. EU access. Strong for IP-heavy operations. Dormant accounts transferred to state after 15 years.',
  },
  {
    country: 'KY',
    name: 'Cayman Islands',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'Cayman exempt company (TBD)',
    notes:
      '0% corporate/income/capital gains tax. Fully remote formation via registered agent. Strong privacy. Requires local registered agent (~$2K/year). Crypto-friendly.',
  },
  {
    country: 'VG',
    name: 'British Virgin Islands',
    hasEscheatment: false,
    heirFindingRegulated: false,
    licenseRequired: false,
    maxFinderFee: null,
    hasCentralRegistry: false,
    operatingEntity: 'BVI BC (TBD)',
    notes:
      'Classic IBC jurisdiction. 0% tax. Remote formation via agent. ~$1,500/year maintenance. Good for holding structures.',
  },
];

// ============================================================================
// RECOVERY ORCHESTRATOR
// ============================================================================

export class RecoveryOrchestrator {
  private static instance: RecoveryOrchestrator | null = null;

  /** Current operating mode */
  private mode: OperatingMode = 'discovery-only';
  /** Registered scanners */
  private scanners: Map<ScannerType, BaseScanner> = new Map();
  /** Scan schedules */
  private scanSchedules: ScanSchedule[] = [];
  /** Whether the orchestrator is currently running a scan cycle */
  private isScanning = false;
  /** Finder's fee percentage (default 25%) */
  private finderFeePercent = 25;

  private vault: IdentityVault;
  private claimTracker: ClaimTracker;
  private fundRouter: FundRouter;

  private constructor() {
    this.vault = getIdentityVault();
    this.claimTracker = getClaimTracker();
    this.fundRouter = getFundRouter();
  }

  static getInstance(): RecoveryOrchestrator {
    if (!RecoveryOrchestrator.instance) {
      RecoveryOrchestrator.instance = new RecoveryOrchestrator();
    }
    return RecoveryOrchestrator.instance;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Set the operating mode.
   * Staged activation: discovery-only → discovery-contact → full-operation
   */
  setMode(mode: OperatingMode): void {
    const previousMode = this.mode;
    this.mode = mode;
    MollyLogger.info('Operating mode changed', FLOW_NAME, {
      from: previousMode,
      to: mode,
    });
  }

  getMode(): OperatingMode {
    return this.mode;
  }

  /**
   * Set the finder's fee percentage.
   */
  setFinderFee(percent: number): void {
    if (percent < 0 || percent > 50) {
      MollyLogger.warn('Finder fee out of range (0-50%)', FLOW_NAME, {
        percent,
      });
      return;
    }
    this.finderFeePercent = percent;
    MollyLogger.info(`Finder's fee set to ${percent}%`, FLOW_NAME);
  }

  // ==========================================================================
  // SCANNER MANAGEMENT
  // ==========================================================================

  /**
   * Register a scanner module.
   */
  registerScanner(scanner: BaseScanner): void {
    this.scanners.set(scanner.scannerType, scanner);
    MollyLogger.info(`Scanner registered: ${scanner.name}`, FLOW_NAME, {
      type: scanner.scannerType,
      regions: scanner.regions,
    });
  }

  /**
   * Get all registered scanners.
   */
  getScanners(): BaseScanner[] {
    return Array.from(this.scanners.values());
  }

  // ==========================================================================
  // SCAN OPERATIONS
  // ==========================================================================

  /**
   * Run a full scan cycle across all registered scanners.
   * Uses the identity profiles stored in the vault.
   *
   * In heir-finder mode, the profile isn't Eric's identity —
   * it's the search parameters for finding unclaimed estates.
   */
  async runFullScan(searchProfile?: IdentityProfile): Promise<ScanResult[]> {
    if (this.mode === 'paused') {
      MollyLogger.warn('Orchestrator is paused — scan skipped', FLOW_NAME);
      return [];
    }

    if (this.isScanning) {
      MollyLogger.warn('Scan already in progress — skipping', FLOW_NAME);
      return [];
    }

    this.isScanning = true;
    const results: ScanResult[] = [];

    try {
      MollyLogger.info('Starting full scan cycle', FLOW_NAME, {
        mode: this.mode,
        scannerCount: this.scanners.size,
      });

      // Use provided profile or get from vault
      const profile = searchProfile || this.vault.getProfile();
      if (!profile) {
        MollyLogger.warn(
          'No identity profile available — unlock vault first',
          FLOW_NAME
        );
        return [];
      }

      // Run each scanner
      for (const [type, scanner] of this.scanners) {
        try {
          MollyLogger.info(`Running scanner: ${scanner.name}`, FLOW_NAME);
          const result = await scanner.scan(profile);
          results.push(result);

          // Register discovered assets with claim tracker
          if (result.assets.length > 0) {
            const newCount = this.claimTracker.registerBatch(result.assets);
            MollyLogger.info(
              `Registered ${newCount} new assets from ${scanner.name}`,
              FLOW_NAME
            );
          }
        } catch (error) {
          MollyLogger.error(
            `Scanner ${scanner.name} failed`,
            FLOW_NAME,
            undefined,
            error
          );
          results.push({
            scannerType: type,
            assets: [],
            recordsSearched: 0,
            matchesFound: 0,
            durationMs: 0,
            errors: [(error as Error).message],
            completedAt: new Date().toISOString(),
          });
        }
      }

      MollyLogger.info('Full scan cycle complete', FLOW_NAME, {
        totalAssets: results.reduce((sum, r) => sum + r.assets.length, 0),
        totalMatches: results.reduce((sum, r) => sum + r.matchesFound, 0),
      });

      return results;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Run a single scanner by type.
   */
  async runScanner(
    scannerType: ScannerType,
    profile?: IdentityProfile
  ): Promise<ScanResult | null> {
    const scanner = this.scanners.get(scannerType);
    if (!scanner) {
      MollyLogger.warn(`Scanner not found: ${scannerType}`, FLOW_NAME);
      return null;
    }

    const searchProfile = profile || this.vault.getProfile();
    if (!searchProfile) {
      MollyLogger.warn('No identity profile available', FLOW_NAME);
      return null;
    }

    return scanner.scan(searchProfile);
  }

  // ==========================================================================
  // CLAIM OPERATIONS
  // ==========================================================================

  /**
   * Process the claim pipeline — advance assets through stages.
   * Only runs in appropriate operating modes.
   */
  async processClaimPipeline(): Promise<void> {
    if (this.mode === 'paused' || this.mode === 'discovery-only') {
      return;
    }

    const tracker = this.claimTracker;

    // Auto-advance verified assets with prepared claims
    const claimReady = tracker.getByStatus('claim-prepared');
    if (this.mode === 'full-operation') {
      for (const asset of claimReady) {
        if (asset.claimPacket && !asset.claimPacket.humanGateRequired) {
          // Auto-submit claims that don't need human intervention
          tracker.advanceStatus(
            asset.id,
            'claim-filed',
            'Auto-submitted by Molly'
          );
        }
      }
    }

    // Route approved assets
    const approved = tracker.getByStatus('approved');
    for (const asset of approved) {
      if (!asset.routing) {
        const routing = this.fundRouter.determineRouting(asset);
        if (routing) {
          tracker.attachRouting(asset.id, routing);
        }
      }
    }

    // Log urgent claims
    const urgent = tracker.getUrgentClaims(7);
    if (urgent.length > 0) {
      MollyLogger.warn(
        `${urgent.length} claims with deadlines in the next 7 days`,
        FLOW_NAME,
        {
          assetIds: urgent.map((a) => a.id),
        }
      );
    }
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get a comprehensive status report.
   */
  getStatusReport(): {
    mode: OperatingMode;
    finderFeePercent: number;
    scanners: { type: ScannerType; name: string; regions: string[] }[];
    pipeline: ReturnType<ClaimTracker['getPipelineSummary']>;
    jurisdictions: JurisdictionConfig[];
    estimatedRevenue: number;
  } {
    const pipeline = this.claimTracker.getPipelineSummary();
    const estimatedRevenue =
      pipeline.totalEstimatedValue * (this.finderFeePercent / 100);

    return {
      mode: this.mode,
      finderFeePercent: this.finderFeePercent,
      scanners: Array.from(this.scanners.values()).map((s) => ({
        type: s.scannerType,
        name: s.name,
        regions: s.regions,
      })),
      pipeline,
      jurisdictions: JURISDICTION_CONFIGS,
      estimatedRevenue,
    };
  }

  /**
   * Get the jurisdiction config for a country.
   */
  getJurisdiction(countryCode: string): JurisdictionConfig | undefined {
    return JURISDICTION_CONFIGS.find((j) => j.country === countryCode);
  }

  /**
   * Calculate the maximum allowed finder's fee for a jurisdiction.
   */
  getMaxFinderFee(countryCode: string): number {
    const config = this.getJurisdiction(countryCode);
    if (!config) return this.finderFeePercent;
    if (config.maxFinderFee !== null) {
      return Math.min(this.finderFeePercent, config.maxFinderFee);
    }
    return this.finderFeePercent;
  }

  // ==========================================================================
  // STATE PERSISTENCE
  // ==========================================================================

  /**
   * Export full orchestrator state for Firestore persistence.
   */
  exportState(): RecoveryState {
    const pipeline = this.claimTracker.getPipelineSummary();
    const claimState = this.claimTracker.exportState();

    return {
      assets: claimState.assets,
      accounts: claimState.accounts,
      scanSchedules: this.scanSchedules,
      totalEstimatedValue: pipeline.totalEstimatedValue,
      totalRecoveredValue: pipeline.totalRecoveredValue,
      pipeline,
      lastSaved: new Date().toISOString(),
    };
  }

  /**
   * Import state from Firestore persistence.
   */
  importState(state: RecoveryState): void {
    this.claimTracker.importState({
      assets: state.assets,
      accounts: state.accounts,
    });
    this.scanSchedules = state.scanSchedules;

    MollyLogger.info('Orchestrator state imported', FLOW_NAME, {
      assets: state.assets.length,
      accounts: state.accounts.length,
      totalEstimatedValue: state.totalEstimatedValue,
      totalRecoveredValue: state.totalRecoveredValue,
    });
  }

  /**
   * Destroy singleton (testing).
   */
  destroy(): void {
    this.scanners.clear();
    this.scanSchedules = [];
    this.mode = 'discovery-only';
    RecoveryOrchestrator.instance = null;
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

export function getRecoveryOrchestrator(): RecoveryOrchestrator {
  return RecoveryOrchestrator.getInstance();
}
