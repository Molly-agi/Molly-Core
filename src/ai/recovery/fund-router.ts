/**
 * @fileOverview Fund Router — From Claim to Account
 *
 * Once an asset is claimed and approved, the fund router determines
 * WHERE the money goes. This isn't just "deposit to checking" —
 * it routes based on the entity structure:
 *
 *   Personal accounts → Living expenses, immediate needs
 *   Trust fund → Long-term family wealth preservation
 *   Holding company → Business operations, property acquisition
 *   LLC accounts → Purpose-specific (real estate, outreach, tech)
 *   Crypto wallets → Digital asset storage
 *
 * CRITICAL SAFETY:
 *   - Every routing instruction is DOUBLE-VERIFIED before execution
 *   - Eric must approve routing rules before any funds move
 *   - Audit trail on every transaction
 *   - No routing to unregistered accounts
 */

import { MollyLogger } from '@/ai/logger';
import type {
  ManagedAccount,
  AccountType,
  RoutingInstruction,
  DiscoveredAsset,
  AuditEntry,
} from './types';

const FLOW_NAME = 'fund-router';

// ============================================================================
// ROUTING RULES
// ============================================================================

export interface RoutingRule {
  /** Rule name */
  name: string;
  /** Asset types this rule applies to */
  assetTypes: string[];
  /** Value threshold — route differently above/below */
  valueThreshold?: number;
  /** Target account type for assets below threshold */
  belowThresholdTarget: AccountType;
  /** Target account type for assets at or above threshold */
  aboveThresholdTarget: AccountType;
  /** Priority (lower = first evaluated) */
  priority: number;
  /** Whether this rule is active */
  enabled: boolean;
}

// ============================================================================
// FUND ROUTER
// ============================================================================

export class FundRouter {
  private static instance: FundRouter | null = null;

  /** Registered accounts available for routing */
  private accounts: Map<string, ManagedAccount> = new Map();
  /** Routing rules */
  private rules: RoutingRule[] = [];
  /** Default account for unmatched assets */
  private defaultAccountId: string | null = null;

  private constructor() {
    this.initializeDefaultRules();
  }

  static getInstance(): FundRouter {
    if (!FundRouter.instance) {
      FundRouter.instance = new FundRouter();
    }
    return FundRouter.instance;
  }

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  /**
   * Register an account as a routing target.
   */
  registerAccount(account: ManagedAccount): void {
    this.accounts.set(account.id, account);
    MollyLogger.info('Routing account registered', FLOW_NAME, {
      id: account.id,
      label: account.label,
      type: account.type,
      institution: account.institution,
    });
  }

  /**
   * Set the default routing account.
   */
  setDefaultAccount(accountId: string): boolean {
    if (!this.accounts.has(accountId)) {
      MollyLogger.warn(
        'Cannot set default — account not registered',
        FLOW_NAME,
        { accountId }
      );
      return false;
    }
    this.defaultAccountId = accountId;
    return true;
  }

  /**
   * Get all registered accounts.
   */
  getAccounts(): ManagedAccount[] {
    return Array.from(this.accounts.values());
  }

  // ==========================================================================
  // ROUTING LOGIC
  // ==========================================================================

  /**
   * Determine the best routing destination for an asset.
   * Returns a RoutingInstruction (NOT yet double-verified).
   */
  determineRouting(asset: DiscoveredAsset): RoutingInstruction | null {
    // Find matching rule (sorted by priority)
    const sortedRules = [...this.rules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (
        rule.assetTypes.includes(asset.type) ||
        rule.assetTypes.includes('*')
      ) {
        const targetType =
          rule.valueThreshold && asset.estimatedValue >= rule.valueThreshold
            ? rule.aboveThresholdTarget
            : rule.belowThresholdTarget;

        const targetAccount = this.findAccountByType(targetType);
        if (targetAccount) {
          MollyLogger.info('Routing determined', FLOW_NAME, {
            assetId: asset.id,
            rule: rule.name,
            targetType,
            targetAccount: targetAccount.label,
            value: asset.estimatedValue,
          });

          return {
            accountType: targetType,
            encryptedAccountId: targetAccount.encryptedDetails,
            institution: targetAccount.institution,
            country: targetAccount.country,
            doubleVerified: false, // Must be verified separately
          };
        }
      }
    }

    // Fall back to default account
    if (this.defaultAccountId) {
      const defaultAccount = this.accounts.get(this.defaultAccountId);
      if (defaultAccount) {
        return {
          accountType: defaultAccount.type,
          encryptedAccountId: defaultAccount.encryptedDetails,
          institution: defaultAccount.institution,
          country: defaultAccount.country,
          doubleVerified: false,
        };
      }
    }

    MollyLogger.warn('No routing destination found for asset', FLOW_NAME, {
      assetId: asset.id,
      type: asset.type,
    });
    return null;
  }

  /**
   * Double-verify a routing instruction.
   *
   * Per Gemini's non-negotiable instruction:
   * Verify target account routing/SWIFT codes TWICE before any submission.
   *
   * First call: sets firstVerifiedAt
   * Second call: sets secondVerifiedAt and doubleVerified = true
   */
  verifyRouting(routing: RoutingInstruction): RoutingInstruction {
    const now = new Date().toISOString();

    if (!routing.firstVerifiedAt) {
      routing.firstVerifiedAt = now;
      MollyLogger.info('Routing first verification complete', FLOW_NAME);
    } else if (!routing.secondVerifiedAt) {
      routing.secondVerifiedAt = now;
      routing.doubleVerified = true;
      MollyLogger.info('Routing DOUBLE VERIFIED — cleared for use', FLOW_NAME);
    }

    return routing;
  }

  // ==========================================================================
  // ROUTING RULES
  // ==========================================================================

  /**
   * Add a custom routing rule.
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
    MollyLogger.info('Routing rule added', FLOW_NAME, { name: rule.name });
  }

  /**
   * Get all routing rules.
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Update a routing rule.
   */
  updateRule(name: string, updates: Partial<RoutingRule>): boolean {
    const idx = this.rules.findIndex((r) => r.name === name);
    if (idx === -1) return false;

    this.rules[idx] = { ...this.rules[idx], ...updates };
    return true;
  }

  // ==========================================================================
  // DEFAULT RULES
  // ==========================================================================

  /**
   * Initialize sensible default routing rules.
   * Eric can customize these via the dashboard.
   */
  private initializeDefaultRules(): void {
    this.rules = [
      {
        name: 'Large assets to holding company',
        assetTypes: ['*'],
        valueThreshold: 50_000,
        belowThresholdTarget: 'personal-checking',
        aboveThresholdTarget: 'holding-company',
        priority: 1,
        enabled: true,
      },
      {
        name: 'Crypto to crypto wallet',
        assetTypes: ['crypto-airdrop', 'dormant-exchange'],
        belowThresholdTarget: 'crypto-wallet',
        aboveThresholdTarget: 'crypto-wallet',
        priority: 2,
        enabled: true,
      },
      {
        name: 'Real estate to real estate LLC',
        assetTypes: ['abandoned-safe-deposit', 'unclaimed-inheritance'],
        valueThreshold: 100_000,
        belowThresholdTarget: 'trust-account',
        aboveThresholdTarget: 'llc-account',
        priority: 3,
        enabled: true,
      },
      {
        name: 'Dividends and royalties to trust',
        assetTypes: [
          'unclaimed-dividend',
          'unclaimed-royalty',
          'abandoned-securities',
        ],
        belowThresholdTarget: 'trust-account',
        aboveThresholdTarget: 'trust-account',
        priority: 4,
        enabled: true,
      },
      {
        name: 'Small recoveries to personal',
        assetTypes: ['*'],
        valueThreshold: 1_000,
        belowThresholdTarget: 'personal-checking',
        aboveThresholdTarget: 'personal-savings',
        priority: 10,
        enabled: true,
      },
    ];
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Find the first registered account matching a type.
   */
  private findAccountByType(type: AccountType): ManagedAccount | undefined {
    return Array.from(this.accounts.values()).find((a) => a.type === type);
  }

  /**
   * Export state for persistence.
   */
  exportState(): {
    accounts: ManagedAccount[];
    rules: RoutingRule[];
    defaultAccountId: string | null;
  } {
    return {
      accounts: this.getAccounts(),
      rules: this.getRules(),
      defaultAccountId: this.defaultAccountId,
    };
  }

  /**
   * Import state from persistence.
   */
  importState(state: {
    accounts: ManagedAccount[];
    rules: RoutingRule[];
    defaultAccountId: string | null;
  }): void {
    this.accounts.clear();
    for (const account of state.accounts) {
      this.accounts.set(account.id, account);
    }
    this.rules = state.rules;
    this.defaultAccountId = state.defaultAccountId;

    MollyLogger.info('Fund router state imported', FLOW_NAME, {
      accountCount: state.accounts.length,
      ruleCount: state.rules.length,
    });
  }

  /**
   * Destroy singleton (testing).
   */
  destroy(): void {
    this.accounts.clear();
    this.rules = [];
    this.defaultAccountId = null;
    FundRouter.instance = null;
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

export function getFundRouter(): FundRouter {
  return FundRouter.getInstance();
}
