/**
 * @fileOverview Tests for Mission Alpha — Recovery System
 *
 * Tests the core components:
 * 1. IdentityVault — encryption, locking, profiles
 * 2. ClaimTracker — asset lifecycle, pipeline
 * 3. FundRouter — routing rules, double verification
 * 4. RecoveryOrchestrator — modes, scanning, reporting
 * 5. USRegistryScanner — state portals, health check
 * 6. CryptoRecoveryScanner — settlement sources, discovery questions
 */

import { IdentityVault } from '../identity-vault';
import { ClaimTracker } from '../claim-tracker';
import { FundRouter } from '../fund-router';
import {
  RecoveryOrchestrator,
  JURISDICTION_CONFIGS,
} from '../recovery-orchestrator';
import {
  USRegistryScanner,
  US_STATE_PORTALS,
  US_FEDERAL_SOURCES,
} from '../scanners/us-registry-scanner';
import {
  CryptoRecoveryScanner,
  SETTLEMENT_SOURCES,
  MAJOR_EXCHANGES,
  AIRDROP_CHAINS,
} from '../scanners/crypto-recovery-scanner';
import type {
  DiscoveredAsset,
  ManagedAccount,
  RoutingInstruction,
  IdentityProfile,
} from '../types';

// ============================================================================
// TEST HELPERS
// ============================================================================

const TEST_PASSWORD = 'test-master-password-never-use-in-production';

function createTestAsset(
  overrides?: Partial<DiscoveredAsset>
): DiscoveredAsset {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'unclaimed-property',
    status: 'discovered',
    description: 'Test unclaimed property',
    estimatedValue: 5000,
    currency: 'USD',
    source: {
      name: 'Test Registry',
      url: 'https://test.gov/',
      country: 'US',
      region: 'OR',
      hasApi: false,
    },
    matchedIdentity: 'Test Person',
    matchConfidence: 0.85,
    discoveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    auditLog: [
      {
        action: 'test-created',
        timestamp: new Date().toISOString(),
        actor: 'system',
      },
    ],
    ...overrides,
  };
}

function createTestAccount(
  overrides?: Partial<ManagedAccount>
): ManagedAccount {
  return {
    id: `acc-${Date.now()}`,
    label: 'Test Account',
    type: 'personal-checking',
    institution: 'Test Bank',
    encryptedDetails: 'encrypted-test-details',
    country: 'US',
    purpose: 'Testing',
    currency: 'USD',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const testProfile: IdentityProfile = {
  primaryName: 'Test Person',
  nameVariants: ['T. Person', 'Test P.'],
  addresses: [
    {
      encrypted: 'encrypted-address',
      region: 'OR',
      country: 'US',
      current: true,
    },
  ],
  governmentIds: [],
  entities: ['Test LLC'],
  familyMembers: [],
};

// ============================================================================
// IDENTITY VAULT TESTS
// ============================================================================

describe('IdentityVault', () => {
  let vault: IdentityVault;

  beforeEach(() => {
    vault = IdentityVault.getInstance();
    vault.unlock(TEST_PASSWORD);
  });

  afterEach(() => {
    vault.destroy();
  });

  test('should encrypt and decrypt text correctly', () => {
    const plaintext = 'sensitive-data-123';
    const blob = vault.encrypt(plaintext);

    expect(blob.ciphertext).not.toBe(plaintext);
    expect(blob.iv).toBeTruthy();
    expect(blob.authTag).toBeTruthy();

    const decrypted = vault.decrypt(blob);
    expect(decrypted).toBe(plaintext);
  });

  test('should produce different ciphertext for same plaintext', () => {
    const plaintext = 'same-text';
    const blob1 = vault.encrypt(plaintext);
    const blob2 = vault.encrypt(plaintext);

    expect(blob1.ciphertext).not.toBe(blob2.ciphertext);
    expect(vault.decrypt(blob1)).toBe(plaintext);
    expect(vault.decrypt(blob2)).toBe(plaintext);
  });

  test('should lock and prevent operations', () => {
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
    expect(() => vault.encrypt('test')).toThrow('locked');
  });

  test('should store and retrieve identity profile', () => {
    vault.storeProfile(testProfile);
    const retrieved = vault.getProfile();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.primaryName).toBe('Test Person');
    expect(retrieved!.nameVariants).toHaveLength(2);
    expect(retrieved!.entities).toContain('Test LLC');
  });

  test('should store and retrieve account details', () => {
    const details = {
      routingNumber: '123456789',
      accountNumber: '9876543210',
    };

    vault.storeAccountDetails('acc-1', details);
    const retrieved = vault.getAccountDetails('acc-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.routingNumber).toBe('123456789');
    expect(retrieved!.accountNumber).toBe('9876543210');
  });

  test('should return null for missing account', () => {
    const result = vault.getAccountDetails('nonexistent');
    expect(result).toBeNull();
  });

  test('should list account IDs', () => {
    vault.storeAccountDetails('acc-1', { test: 'a' });
    vault.storeAccountDetails('acc-2', { test: 'b' });

    const ids = vault.listAccountIds();
    expect(ids).toContain('acc-1');
    expect(ids).toContain('acc-2');
  });

  test('should encrypt fields with last four', () => {
    const field = vault.encryptField('123-45-6789', 'SSN');

    expect(field.type).toBe('SSN');
    expect(field.lastFour).toBe('6789');
    expect(field.encrypted).not.toContain('6789');

    const decrypted = vault.decryptField(field);
    expect(decrypted).toBe('123-45-6789');
  });

  test('should export and import state', () => {
    vault.storeProfile(testProfile);
    vault.storeAccountDetails('acc-1', { routing: '123' });

    const state = vault.exportState();
    expect(state.profile).toBeTruthy();
    expect(Object.keys(state.accounts)).toHaveLength(1);

    // Create new vault and import
    vault.destroy();
    const newVault = IdentityVault.getInstance();
    newVault.unlock(TEST_PASSWORD);
    newVault.importState(state);

    expect(newVault.listAccountIds()).toContain('acc-1');
    newVault.destroy();
  });
});

// ============================================================================
// CLAIM TRACKER TESTS
// ============================================================================

describe('ClaimTracker', () => {
  let tracker: ClaimTracker;

  beforeEach(() => {
    tracker = ClaimTracker.getInstance();
  });

  afterEach(() => {
    tracker.destroy();
  });

  test('should register an asset', () => {
    const asset = createTestAsset();
    tracker.register(asset);

    const retrieved = tracker.getAsset(asset.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.description).toBe('Test unclaimed property');
  });

  test('should register batch and skip duplicates', () => {
    const asset1 = createTestAsset({ id: 'dup-1' });
    const asset2 = createTestAsset({ id: 'dup-2' });

    tracker.register(asset1);
    const newCount = tracker.registerBatch([asset1, asset2]);

    expect(newCount).toBe(1); // Only asset2 is new
    expect(tracker.getAllAssets()).toHaveLength(2);
  });

  test('should advance asset status', () => {
    const asset = createTestAsset();
    tracker.register(asset);

    tracker.advanceStatus(asset.id, 'verified', 'Manually verified');
    const updated = tracker.getAsset(asset.id);
    expect(updated!.status).toBe('verified');
    expect(updated!.auditLog.length).toBeGreaterThan(1);
  });

  test('should flag human gate', () => {
    const asset = createTestAsset();
    tracker.register(asset);

    tracker.flagHumanGate(asset.id, 'CAPTCHA detected');
    expect(tracker.getHumanGates()).toHaveLength(1);
  });

  test('should refuse unverified routing', () => {
    const asset = createTestAsset();
    tracker.register(asset);

    const routing: RoutingInstruction = {
      accountType: 'personal-checking',
      encryptedAccountId: 'encrypted',
      institution: 'Test Bank',
      country: 'US',
      doubleVerified: false,
    };

    const result = tracker.attachRouting(asset.id, routing);
    expect(result).toBe(false);
  });

  test('should accept double-verified routing', () => {
    const asset = createTestAsset();
    tracker.register(asset);

    const routing: RoutingInstruction = {
      accountType: 'personal-checking',
      encryptedAccountId: 'encrypted',
      institution: 'Test Bank',
      country: 'US',
      doubleVerified: true,
      firstVerifiedAt: new Date().toISOString(),
      secondVerifiedAt: new Date().toISOString(),
    };

    const result = tracker.attachRouting(asset.id, routing);
    expect(result).toBe(true);
  });

  test('should get pipeline summary', () => {
    tracker.register(
      createTestAsset({ status: 'discovered', estimatedValue: 1000 })
    );
    tracker.register(
      createTestAsset({ status: 'discovered', estimatedValue: 2000 })
    );
    tracker.register(
      createTestAsset({ status: 'transferred', estimatedValue: 5000 })
    );

    const summary = tracker.getPipelineSummary();
    expect(summary.discovered).toBe(2);
    expect(summary.transferred).toBe(1);
    expect(summary.totalEstimatedValue).toBe(8000);
    expect(summary.totalRecoveredValue).toBe(5000);
  });

  test('should get urgent claims', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextYear = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    ).toISOString();

    tracker.register(createTestAsset({ claimDeadline: tomorrow }));
    tracker.register(createTestAsset({ claimDeadline: nextYear }));

    const urgent = tracker.getUrgentClaims(7);
    expect(urgent).toHaveLength(1);
  });

  test('should export and import state', () => {
    tracker.register(createTestAsset({ id: 'persist-1' }));
    tracker.registerAccount(createTestAccount({ id: 'acc-persist' }));

    const state = tracker.exportState();
    tracker.destroy();

    const newTracker = ClaimTracker.getInstance();
    newTracker.importState(state);

    expect(newTracker.getAsset('persist-1')).toBeDefined();
    expect(newTracker.getAccounts()).toHaveLength(1);
    newTracker.destroy();
  });
});

// ============================================================================
// FUND ROUTER TESTS
// ============================================================================

describe('FundRouter', () => {
  let router: FundRouter;

  beforeEach(() => {
    router = FundRouter.getInstance();
  });

  afterEach(() => {
    router.destroy();
  });

  test('should register accounts', () => {
    router.registerAccount(createTestAccount({ id: 'r-1' }));
    router.registerAccount(createTestAccount({ id: 'r-2' }));
    expect(router.getAccounts()).toHaveLength(2);
  });

  test('should determine routing by rules', () => {
    router.registerAccount(
      createTestAccount({
        id: 'check-1',
        type: 'personal-checking',
      })
    );

    const smallAsset = createTestAsset({ estimatedValue: 500 });
    const routing = router.determineRouting(smallAsset);

    // Should route to personal-checking (small value, default rules)
    expect(routing).not.toBeNull();
    expect(routing!.accountType).toBe('personal-checking');
    expect(routing!.doubleVerified).toBe(false);
  });

  test('should route large assets to holding company', () => {
    router.registerAccount(
      createTestAccount({
        id: 'holding-1',
        type: 'holding-company',
        label: 'Main Holding',
      })
    );

    const largeAsset = createTestAsset({ estimatedValue: 100_000 });
    const routing = router.determineRouting(largeAsset);

    expect(routing).not.toBeNull();
    expect(routing!.accountType).toBe('holding-company');
  });

  test('should double-verify routing', () => {
    const routing: RoutingInstruction = {
      accountType: 'personal-checking',
      encryptedAccountId: 'test',
      institution: 'Test Bank',
      country: 'US',
      doubleVerified: false,
    };

    // First verification
    router.verifyRouting(routing);
    expect(routing.firstVerifiedAt).toBeTruthy();
    expect(routing.doubleVerified).toBe(false);

    // Second verification
    router.verifyRouting(routing);
    expect(routing.secondVerifiedAt).toBeTruthy();
    expect(routing.doubleVerified).toBe(true);
  });

  test('should have default rules', () => {
    const rules = router.getRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.name.includes('Large assets'))).toBe(true);
    expect(rules.some((r) => r.name.includes('Crypto'))).toBe(true);
  });

  test('should export and import state', () => {
    router.registerAccount(createTestAccount({ id: 'exp-1' }));
    router.addRule({
      name: 'Custom rule',
      assetTypes: ['*'],
      belowThresholdTarget: 'personal-checking',
      aboveThresholdTarget: 'trust-account',
      priority: 0,
      enabled: true,
    });

    const state = router.exportState();
    router.destroy();

    const newRouter = FundRouter.getInstance();
    newRouter.importState(state);

    expect(newRouter.getAccounts()).toHaveLength(1);
    expect(newRouter.getRules().some((r) => r.name === 'Custom rule')).toBe(
      true
    );
    newRouter.destroy();
  });
});

// ============================================================================
// RECOVERY ORCHESTRATOR TESTS
// ============================================================================

describe('RecoveryOrchestrator', () => {
  let orchestrator: RecoveryOrchestrator;

  beforeEach(() => {
    orchestrator = RecoveryOrchestrator.getInstance();
  });

  afterEach(() => {
    orchestrator.destroy();
  });

  test('should start in discovery-only mode', () => {
    expect(orchestrator.getMode()).toBe('discovery-only');
  });

  test('should change operating mode', () => {
    orchestrator.setMode('full-operation');
    expect(orchestrator.getMode()).toBe('full-operation');
  });

  test('should register scanners', () => {
    const usScanner = new USRegistryScanner();
    orchestrator.registerScanner(usScanner);
    expect(orchestrator.getScanners()).toHaveLength(1);
  });

  test('should generate status report', () => {
    const report = orchestrator.getStatusReport();

    expect(report.mode).toBe('discovery-only');
    expect(report.finderFeePercent).toBe(25);
    expect(report.jurisdictions.length).toBeGreaterThan(0);
    expect(report.pipeline).toBeDefined();
  });

  test('should have correct jurisdiction configs', () => {
    expect(JURISDICTION_CONFIGS.length).toBeGreaterThanOrEqual(10);

    // US has escheatment
    const us = orchestrator.getJurisdiction('US');
    expect(us).toBeDefined();
    expect(us!.hasEscheatment).toBe(true);
    expect(us!.localContact).toBe('Eric');

    // Germany does NOT have escheatment
    const de = orchestrator.getJurisdiction('DE');
    expect(de).toBeDefined();
    expect(de!.hasEscheatment).toBe(false);

    // Nigeria does NOT have escheatment
    const ng = orchestrator.getJurisdiction('NG');
    expect(ng).toBeDefined();
    expect(ng!.hasEscheatment).toBe(false);
    expect(ng!.localContact).toBe('Wife');
  });

  test('should respect max finder fees per jurisdiction', () => {
    orchestrator.setFinderFee(35);

    // US caps at 35
    expect(orchestrator.getMaxFinderFee('US')).toBe(35);

    // Nigeria has no cap — gets our default
    expect(orchestrator.getMaxFinderFee('NG')).toBe(35);
  });

  test('should block scan when paused', async () => {
    orchestrator.setMode('paused');
    const results = await orchestrator.runFullScan(testProfile);
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// US REGISTRY SCANNER TESTS
// ============================================================================

describe('USRegistryScanner', () => {
  test('should have all 50 states + DC', () => {
    expect(US_STATE_PORTALS).toHaveLength(51);
  });

  test('should have Oregon as priority state', () => {
    const or = US_STATE_PORTALS.find((p) => p.stateCode === 'OR');
    expect(or).toBeDefined();
    expect(or!.notes).toContain('Priority');
  });

  test('should have federal sources', () => {
    expect(US_FEDERAL_SOURCES.length).toBeGreaterThanOrEqual(6);
    expect(US_FEDERAL_SOURCES.some((s) => s.name.includes('Treasury'))).toBe(
      true
    );
    expect(US_FEDERAL_SOURCES.some((s) => s.name.includes('FDIC'))).toBe(true);
    expect(US_FEDERAL_SOURCES.some((s) => s.name.includes('IRS'))).toBe(true);
  });

  test('should pass health check', async () => {
    const scanner = new USRegistryScanner();
    const healthy = await scanner.healthCheck();
    expect(healthy).toBe(true);
  });

  test('should have some API-enabled states', () => {
    const apiStates = US_STATE_PORTALS.filter((p) => p.hasApi);
    expect(apiStates.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// CRYPTO RECOVERY SCANNER TESTS
// ============================================================================

describe('CryptoRecoveryScanner', () => {
  test('should have settlement sources', () => {
    expect(SETTLEMENT_SOURCES.length).toBeGreaterThanOrEqual(5);
    expect(SETTLEMENT_SOURCES.some((s) => s.name.includes('FTX'))).toBe(true);
    expect(SETTLEMENT_SOURCES.some((s) => s.name.includes('Celsius'))).toBe(
      true
    );
  });

  test('should have major exchanges', () => {
    expect(MAJOR_EXCHANGES.length).toBeGreaterThanOrEqual(10);
    expect(MAJOR_EXCHANGES.some((e) => e.name === 'Coinbase')).toBe(true);
  });

  test('should have blockchain networks', () => {
    expect(AIRDROP_CHAINS.length).toBeGreaterThanOrEqual(7);
    expect(AIRDROP_CHAINS.some((c) => c.chain === 'Ethereum')).toBe(true);
    expect(AIRDROP_CHAINS.some((c) => c.chain === 'Bitcoin')).toBe(true);
  });

  test('should generate discovery questions', () => {
    const questions = CryptoRecoveryScanner.generateDiscoveryQuestions();
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.some((q) => q.includes('Coinbase'))).toBe(true);
  });

  test('should pass health check', async () => {
    const scanner = new CryptoRecoveryScanner();
    const healthy = await scanner.healthCheck();
    expect(healthy).toBe(true);
  });

  test('should allow wallet registration', () => {
    const scanner = new CryptoRecoveryScanner();
    scanner.registerWallets('Ethereum', ['0x1234567890abcdef']);
    // No throw = success
  });
});
